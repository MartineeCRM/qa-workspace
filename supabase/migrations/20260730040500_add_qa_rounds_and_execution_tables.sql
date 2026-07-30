CREATE TABLE public.qa_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  qa_environment_id uuid NOT NULL REFERENCES public.qa_environments(id) ON DELETE CASCADE,
  round_number integer NOT NULL,
  previous_round_id uuid REFERENCES public.qa_rounds(id) ON DELETE SET NULL,
  started_by uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE UNIQUE INDEX qa_rounds_env_number_uq ON public.qa_rounds (qa_environment_id, round_number);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_rounds TO authenticated;
GRANT ALL ON public.qa_rounds TO service_role;
ALTER TABLE public.qa_rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY qr_select ON public.qa_rounds FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project(project_id)));
CREATE POLICY qr_insert ON public.qa_rounds FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)) AND started_by = auth.uid());
CREATE POLICY qr_update ON public.qa_rounds FOR UPDATE TO authenticated USING (public.can_edit_ws(public.ws_of_project(project_id))) WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)));
CREATE POLICY qr_delete ON public.qa_rounds FOR DELETE TO authenticated USING (public.can_admin_ws(public.ws_of_project(project_id)));

CREATE TABLE public.qa_run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qa_round_id uuid NOT NULL REFERENCES public.qa_rounds(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.taxonomy_events(id) ON DELETE SET NULL,
  raw_event_name text NOT NULL,
  occurred_at timestamptz NOT NULL,
  external_user_id text NOT NULL,
  raw_properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX qa_run_events_round_idx ON public.qa_run_events (qa_round_id, occurred_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_run_events TO authenticated;
GRANT ALL ON public.qa_run_events TO service_role;
ALTER TABLE public.qa_run_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY qre_select ON public.qa_run_events FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = qa_round_id))));
CREATE POLICY qre_insert ON public.qa_run_events FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = qa_round_id))));
CREATE POLICY qre_delete ON public.qa_run_events FOR DELETE TO authenticated USING (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = qa_round_id))));

CREATE TABLE public.qa_attribute_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qa_round_id uuid NOT NULL REFERENCES public.qa_rounds(id) ON DELETE CASCADE,
  external_user_id text NOT NULL,
  snapshot_name text NOT NULL,
  status text NOT NULL DEFAULT 'requesting' CHECK (status IN ('requesting','captured','failed')),
  payload jsonb,
  previous_snapshot_id uuid REFERENCES public.qa_attribute_snapshots(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  captured_at timestamptz
);
CREATE INDEX qa_attribute_snapshots_round_idx ON public.qa_attribute_snapshots (qa_round_id, captured_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_attribute_snapshots TO authenticated;
GRANT ALL ON public.qa_attribute_snapshots TO service_role;
ALTER TABLE public.qa_attribute_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY qas_select ON public.qa_attribute_snapshots FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = qa_round_id))));
CREATE POLICY qas_insert ON public.qa_attribute_snapshots FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = qa_round_id))));
CREATE POLICY qas_update ON public.qa_attribute_snapshots FOR UPDATE TO authenticated USING (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = qa_round_id)))) WITH CHECK (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = qa_round_id))));
