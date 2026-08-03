CREATE TABLE public.qa_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  is_required boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, slug)
);

ALTER TABLE public.qa_channels ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.qa_channels TO authenticated;
CREATE POLICY qc_select ON public.qa_channels FOR SELECT TO authenticated
  USING (public.is_ws_member(public.ws_of_project(project_id)));
CREATE POLICY qc_insert ON public.qa_channels FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)));
CREATE POLICY qc_update ON public.qa_channels FOR UPDATE TO authenticated
  USING (public.can_edit_ws(public.ws_of_project(project_id)))
  WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)));

INSERT INTO public.qa_channels (project_id, name, slug, sort_order)
SELECT id, 'iOS', 'ios', 0 FROM public.projects
ON CONFLICT (project_id, slug) DO NOTHING;
INSERT INTO public.qa_channels (project_id, name, slug, sort_order)
SELECT id, 'Android', 'android', 1 FROM public.projects
ON CONFLICT (project_id, slug) DO NOTHING;

CREATE FUNCTION public.tg_create_default_qa_channels()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.qa_channels (project_id, name, slug, sort_order)
  VALUES (NEW.id, 'iOS', 'ios', 0), (NEW.id, 'Android', 'android', 1)
  ON CONFLICT (project_id, slug) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER create_default_qa_channels
AFTER INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.tg_create_default_qa_channels();

ALTER TABLE public.qa_sessions
  ADD COLUMN qa_channel_id uuid REFERENCES public.qa_channels(id) ON DELETE RESTRICT;

UPDATE public.qa_sessions session
SET qa_channel_id = channel.id
FROM public.qa_rounds round, public.qa_channels channel
WHERE round.id = session.qa_round_id
  AND channel.project_id = round.project_id
  AND (
    (channel.slug = 'ios' AND lower(session.name) ~ '(^|[^a-z])(ios|iphone|아이폰)')
    OR
    (channel.slug = 'android' AND lower(session.name) ~ '(^|[^a-z])(android|aos|안드로이드)')
  );

DROP INDEX public.qa_sessions_round_name_uq;
CREATE UNIQUE INDEX qa_sessions_round_channel_name_uq
  ON public.qa_sessions (qa_round_id, qa_channel_id, name) NULLS NOT DISTINCT;

-- Applicability is opt-out: no row means the shared taxonomy applies to the
-- channel. This keeps new events/properties available everywhere by default.
CREATE TABLE public.taxonomy_event_channel_exclusions (
  event_id uuid NOT NULL REFERENCES public.taxonomy_events(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.qa_channels(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, channel_id)
);
CREATE TABLE public.taxonomy_property_channel_exclusions (
  property_id uuid NOT NULL REFERENCES public.taxonomy_event_properties(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.qa_channels(id) ON DELETE CASCADE,
  PRIMARY KEY (property_id, channel_id)
);

ALTER TABLE public.taxonomy_event_channel_exclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxonomy_property_channel_exclusions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.taxonomy_event_channel_exclusions TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.taxonomy_property_channel_exclusions TO authenticated;
CREATE POLICY tece_select ON public.taxonomy_event_channel_exclusions FOR SELECT TO authenticated
  USING (public.is_ws_member(public.ws_of_project((SELECT project_id FROM public.taxonomy_events WHERE id = event_id))));
CREATE POLICY tece_write ON public.taxonomy_event_channel_exclusions FOR ALL TO authenticated
  USING (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.taxonomy_events WHERE id = event_id))))
  WITH CHECK (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.taxonomy_events WHERE id = event_id))));
CREATE POLICY tpce_select ON public.taxonomy_property_channel_exclusions FOR SELECT TO authenticated
  USING (public.is_ws_member(public.ws_of_project((SELECT project_id FROM public.taxonomy_events WHERE id = (SELECT event_id FROM public.taxonomy_event_properties WHERE id = property_id)))));
CREATE POLICY tpce_write ON public.taxonomy_property_channel_exclusions FOR ALL TO authenticated
  USING (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.taxonomy_events WHERE id = (SELECT event_id FROM public.taxonomy_event_properties WHERE id = property_id)))))
  WITH CHECK (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.taxonomy_events WHERE id = (SELECT event_id FROM public.taxonomy_event_properties WHERE id = property_id)))));

CREATE OR REPLACE FUNCTION public.carry_over_qa_checklist_items(
  _item_ids uuid[],
  _assignee_id uuid DEFAULT NULL
) RETURNS TABLE (round_id uuid, session_id uuid)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _source_session public.qa_sessions%ROWTYPE;
  _source_round public.qa_rounds%ROWTYPE;
  _next_round_id uuid;
  _next_session_id uuid;
BEGIN
  IF COALESCE(array_length(_item_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'At least one checklist item is required';
  END IF;

  SELECT qs.* INTO _source_session
  FROM public.qa_round_checklist_items item
  JOIN public.qa_sessions qs ON qs.id = item.qa_session_id
  WHERE item.id = ANY (_item_ids)
  LIMIT 1;

  IF _source_session.id IS NULL
     OR (SELECT count(*) FROM public.qa_round_checklist_items WHERE id = ANY (_item_ids)) <> cardinality(_item_ids)
     OR EXISTS (
       SELECT 1 FROM public.qa_round_checklist_items
       WHERE id = ANY (_item_ids) AND qa_session_id <> _source_session.id
     ) THEN
    RAISE EXCEPTION 'Checklist items must exist and belong to one session';
  END IF;

  SELECT * INTO _source_round FROM public.qa_rounds WHERE id = _source_session.qa_round_id;
  IF NOT public.can_edit_ws(public.ws_of_project(_source_round.project_id)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.qa_rounds (
    project_id, qa_environment_id, round_number, previous_round_id, started_by
  ) VALUES (
    _source_round.project_id, _source_round.qa_environment_id,
    _source_round.round_number + 1, _source_round.id, auth.uid()
  )
  ON CONFLICT (qa_environment_id, round_number) DO NOTHING
  RETURNING id INTO _next_round_id;

  IF _next_round_id IS NULL THEN
    SELECT id INTO _next_round_id FROM public.qa_rounds
    WHERE qa_environment_id = _source_round.qa_environment_id
      AND round_number = _source_round.round_number + 1;
  END IF;

  INSERT INTO public.qa_sessions (qa_round_id, qa_channel_id, name, started_by)
  VALUES (_next_round_id, _source_session.qa_channel_id, '이월 항목', auth.uid())
  ON CONFLICT (qa_round_id, qa_channel_id, name) DO NOTHING
  RETURNING id INTO _next_session_id;

  IF _next_session_id IS NULL THEN
    SELECT id INTO _next_session_id FROM public.qa_sessions
    WHERE qa_round_id = _next_round_id
      AND qa_channel_id IS NOT DISTINCT FROM _source_session.qa_channel_id
      AND name = '이월 항목';
  END IF;

  INSERT INTO public.qa_round_checklist_items (
    qa_session_id, target_type, target_id, carried_from_item_id, assigned_to
  )
  SELECT _next_session_id, target_type, target_id, id, _assignee_id
  FROM public.qa_round_checklist_items WHERE id = ANY (_item_ids)
  ON CONFLICT (qa_session_id, target_type, target_id) DO NOTHING;

  UPDATE public.qa_round_checklist_items
  SET disposition = 'carried_over', disposed_by = auth.uid(), disposed_at = now()
  WHERE id = ANY (_item_ids);

  RETURN QUERY SELECT _next_round_id, _next_session_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
