-- carry_over_qa_checklist_items used min(qa_session_id) to grab any one
-- session id from the matched rows, but Postgres has no built-in min/max
-- aggregate for uuid, so every call failed with "function min(uuid) does
-- not exist" (surfaced to PostgREST clients as a bare 404). The rows are
-- already verified to share one session_id right after, so a plain
-- LIMIT 1 gives the same value without needing an aggregate.
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

  SELECT qa_session_id
  INTO _source_session_id
  FROM public.qa_round_checklist_items
  WHERE id = ANY (_item_ids)
  LIMIT 1;

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
