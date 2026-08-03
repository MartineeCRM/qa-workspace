-- Keep QA discussion writes scoped to the discussion's workspace.
DROP POLICY qdc_insert ON public.qa_discussion_comments;
CREATE POLICY qdc_insert ON public.qa_discussion_comments
FOR INSERT TO authenticated WITH CHECK (
  author_id = auth.uid()
  AND public.can_edit_ws(public.ws_of_project((
    SELECT qr.project_id
    FROM public.qa_discussions qd
    JOIN public.qa_checklist_item_results qcir ON qcir.id = qd.checklist_item_result_id
    JOIN public.qa_round_checklist_items qrci ON qrci.id = qcir.checklist_item_id
    JOIN public.qa_sessions qs ON qs.id = qrci.qa_session_id
    JOIN public.qa_rounds qr ON qr.id = qs.qa_round_id
    WHERE qd.id = discussion_id
  )))
);

DROP POLICY qd_update ON public.qa_discussions;
CREATE POLICY qd_update ON public.qa_discussions
FOR UPDATE TO authenticated USING (
  public.can_edit_ws(public.ws_of_project((
    SELECT qr.project_id
    FROM public.qa_checklist_item_results qcir
    JOIN public.qa_round_checklist_items qrci ON qrci.id = qcir.checklist_item_id
    JOIN public.qa_sessions qs ON qs.id = qrci.qa_session_id
    JOIN public.qa_rounds qr ON qr.id = qs.qa_round_id
    WHERE qcir.id = checklist_item_result_id
  )))
) WITH CHECK (
  public.can_edit_ws(public.ws_of_project((
    SELECT qr.project_id
    FROM public.qa_checklist_item_results qcir
    JOIN public.qa_round_checklist_items qrci ON qrci.id = qcir.checklist_item_id
    JOIN public.qa_sessions qs ON qs.id = qrci.qa_session_id
    JOIN public.qa_rounds qr ON qr.id = qs.qa_round_id
    WHERE qcir.id = checklist_item_result_id
  )))
);

ALTER TABLE public.qa_round_checklist_items
  ADD CONSTRAINT qa_round_checklist_items_assigned_to_fkey
    FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL NOT VALID,
  ADD CONSTRAINT qa_round_checklist_items_disposed_by_fkey
    FOREIGN KEY (disposed_by) REFERENCES public.profiles(id) ON DELETE SET NULL NOT VALID;

CREATE OR REPLACE FUNCTION public.validate_qa_checklist_carryover()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.carried_from_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.qa_round_checklist_items source_item
    JOIN public.qa_sessions source_session ON source_session.id = source_item.qa_session_id
    JOIN public.qa_sessions destination_session ON destination_session.id = NEW.qa_session_id
    JOIN public.qa_rounds destination_round ON destination_round.id = destination_session.qa_round_id
    WHERE source_item.id = NEW.carried_from_item_id
      AND source_item.target_type = NEW.target_type
      AND source_item.target_id = NEW.target_id
      AND destination_round.previous_round_id = source_session.qa_round_id
  ) THEN
    RAISE EXCEPTION 'Carry-over source must be the same target from the previous round';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_qa_checklist_carryover
BEFORE INSERT OR UPDATE OF carried_from_item_id, qa_session_id, target_type, target_id
ON public.qa_round_checklist_items
FOR EACH ROW EXECUTE FUNCTION public.validate_qa_checklist_carryover();

-- Carry-over is one unit of work: the destination round/session/items and source
-- disposition either all commit or all roll back.
CREATE OR REPLACE FUNCTION public.carry_over_qa_checklist_items(
  _item_ids uuid[],
  _assignee_id uuid DEFAULT NULL
) RETURNS TABLE (round_id uuid, session_id uuid)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _source_session_id uuid;
  _source_round public.qa_rounds%ROWTYPE;
  _next_round_id uuid;
  _next_session_id uuid;
BEGIN
  IF COALESCE(array_length(_item_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'At least one checklist item is required';
  END IF;

  SELECT min(qa_session_id)
  INTO _source_session_id
  FROM public.qa_round_checklist_items
  WHERE id = ANY (_item_ids);

  IF _source_session_id IS NULL
     OR (SELECT count(*) FROM public.qa_round_checklist_items WHERE id = ANY (_item_ids))
        <> cardinality(_item_ids)
     OR EXISTS (
       SELECT 1 FROM public.qa_round_checklist_items
       WHERE id = ANY (_item_ids) AND qa_session_id <> _source_session_id
     ) THEN
    RAISE EXCEPTION 'Checklist items must exist and belong to one session';
  END IF;

  SELECT qr.*
  INTO _source_round
  FROM public.qa_sessions qs
  JOIN public.qa_rounds qr ON qr.id = qs.qa_round_id
  WHERE qs.id = _source_session_id;

  IF NOT public.can_edit_ws(public.ws_of_project(_source_round.project_id)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.qa_rounds (
    project_id, qa_environment_id, round_number, previous_round_id, started_by
  ) VALUES (
    _source_round.project_id,
    _source_round.qa_environment_id,
    _source_round.round_number + 1,
    _source_round.id,
    auth.uid()
  )
  ON CONFLICT (qa_environment_id, round_number) DO NOTHING
  RETURNING id INTO _next_round_id;

  IF _next_round_id IS NULL THEN
    SELECT id INTO _next_round_id
    FROM public.qa_rounds
    WHERE qa_environment_id = _source_round.qa_environment_id
      AND round_number = _source_round.round_number + 1;
  END IF;

  INSERT INTO public.qa_sessions (qa_round_id, name, started_by)
  VALUES (_next_round_id, '이월 항목', auth.uid())
  ON CONFLICT (qa_round_id, name) DO NOTHING
  RETURNING id INTO _next_session_id;

  IF _next_session_id IS NULL THEN
    SELECT id INTO _next_session_id
    FROM public.qa_sessions
    WHERE qa_round_id = _next_round_id AND name = '이월 항목';
  END IF;

  INSERT INTO public.qa_round_checklist_items (
    qa_session_id, target_type, target_id, carried_from_item_id, assigned_to
  )
  SELECT _next_session_id, target_type, target_id, id, _assignee_id
  FROM public.qa_round_checklist_items
  WHERE id = ANY (_item_ids)
  ON CONFLICT (qa_session_id, target_type, target_id) DO NOTHING;

  UPDATE public.qa_round_checklist_items
  SET disposition = 'carried_over', disposed_by = auth.uid(), disposed_at = now()
  WHERE id = ANY (_item_ids);

  RETURN QUERY SELECT _next_round_id, _next_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.carry_over_qa_checklist_items(uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.carry_over_qa_checklist_items(uuid[], uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_qa_discussion_comment(
  _result_id uuid,
  _body text
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _discussion_id uuid;
BEGIN
  INSERT INTO public.qa_discussions (checklist_item_result_id, created_by)
  VALUES (_result_id, auth.uid())
  ON CONFLICT (checklist_item_result_id) DO NOTHING
  RETURNING id INTO _discussion_id;

  IF _discussion_id IS NULL THEN
    SELECT id INTO _discussion_id
    FROM public.qa_discussions
    WHERE checklist_item_result_id = _result_id;
  END IF;

  INSERT INTO public.qa_discussion_comments (discussion_id, author_id, body)
  VALUES (_discussion_id, auth.uid(), _body);
  RETURN _discussion_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_qa_discussion_comment(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_qa_discussion_comment(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_qa_checklist_disposition(
  _item_id uuid,
  _disposition text
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF _disposition NOT IN ('passed_override', 'discussing') THEN
    RAISE EXCEPTION 'Unsupported disposition';
  END IF;

  UPDATE public.qa_round_checklist_items
  SET disposition = _disposition, disposed_by = auth.uid(), disposed_at = now()
  WHERE id = _item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checklist item not found or not editable';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_qa_checklist_disposition(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_qa_checklist_disposition(uuid, text) TO authenticated;
