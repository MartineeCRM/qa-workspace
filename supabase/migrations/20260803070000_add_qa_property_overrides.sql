-- A reviewer can mark a specific event property's structural violation as a
-- false positive ("통과로 표시") — this must affect real re-analysis, not just
-- the spec-diff screen, so it lives as data the judging engine reads, not a
-- local UI toggle. Scoped to (event_id, technical_name): overriding "platform"
-- as a false positive on one event does not affect "platform" on any other
-- event using the same name.
CREATE TABLE public.qa_property_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.taxonomy_events(id) ON DELETE CASCADE,
  technical_name text NOT NULL,
  reason text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, technical_name)
);

ALTER TABLE public.qa_property_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY qpo_select ON public.qa_property_overrides FOR SELECT TO authenticated USING (
  public.is_ws_member(public.ws_of_project((
    SELECT project_id FROM public.taxonomy_events WHERE id = event_id
  )))
);

CREATE POLICY qpo_insert ON public.qa_property_overrides FOR INSERT TO authenticated WITH CHECK (
  public.can_edit_ws(public.ws_of_project((
    SELECT project_id FROM public.taxonomy_events WHERE id = event_id
  )))
  AND created_by = auth.uid()
);

CREATE POLICY qpo_delete ON public.qa_property_overrides FOR DELETE TO authenticated USING (
  public.can_edit_ws(public.ws_of_project((
    SELECT project_id FROM public.taxonomy_events WHERE id = event_id
  )))
);
