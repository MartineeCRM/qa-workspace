CREATE TABLE public.qa_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qa_round_id uuid NOT NULL REFERENCES public.qa_rounds(id) ON DELETE CASCADE,
  name text NOT NULL,
  started_by uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_sessions TO authenticated;
GRANT ALL ON public.qa_sessions TO service_role;
ALTER TABLE public.qa_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY qs_select ON public.qa_sessions FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = qa_round_id))));
CREATE POLICY qs_insert ON public.qa_sessions FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = qa_round_id))) AND started_by = auth.uid());
CREATE POLICY qs_update ON public.qa_sessions FOR UPDATE TO authenticated USING (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = qa_round_id)))) WITH CHECK (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = qa_round_id))));
CREATE POLICY qs_delete ON public.qa_sessions FOR DELETE TO authenticated USING (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = qa_round_id))));

-- qa_run_events: move from qa_round_id to qa_session_id
ALTER TABLE public.qa_run_events ADD COLUMN qa_session_id uuid REFERENCES public.qa_sessions(id) ON DELETE CASCADE;
DROP POLICY qre_select ON public.qa_run_events;
DROP POLICY qre_insert ON public.qa_run_events;
DROP POLICY qre_delete ON public.qa_run_events;
ALTER TABLE public.qa_run_events DROP COLUMN qa_round_id;
ALTER TABLE public.qa_run_events ALTER COLUMN qa_session_id SET NOT NULL;
CREATE POLICY qre_select ON public.qa_run_events FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = (SELECT qa_round_id FROM public.qa_sessions WHERE id = qa_session_id)))));
CREATE POLICY qre_insert ON public.qa_run_events FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = (SELECT qa_round_id FROM public.qa_sessions WHERE id = qa_session_id)))));
CREATE POLICY qre_delete ON public.qa_run_events FOR DELETE TO authenticated USING (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = (SELECT qa_round_id FROM public.qa_sessions WHERE id = qa_session_id)))));

DROP INDEX IF EXISTS public.qa_run_events_round_idx;
CREATE INDEX qa_run_events_session_idx ON public.qa_run_events (qa_session_id, occurred_at);

-- qa_attribute_snapshots: move from qa_round_id to qa_session_id
ALTER TABLE public.qa_attribute_snapshots ADD COLUMN qa_session_id uuid REFERENCES public.qa_sessions(id) ON DELETE CASCADE;
DROP POLICY qas_select ON public.qa_attribute_snapshots;
DROP POLICY qas_insert ON public.qa_attribute_snapshots;
DROP POLICY qas_update ON public.qa_attribute_snapshots;
ALTER TABLE public.qa_attribute_snapshots DROP COLUMN qa_round_id;
ALTER TABLE public.qa_attribute_snapshots ALTER COLUMN qa_session_id SET NOT NULL;
CREATE POLICY qas_select ON public.qa_attribute_snapshots FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = (SELECT qa_round_id FROM public.qa_sessions WHERE id = qa_session_id)))));
CREATE POLICY qas_insert ON public.qa_attribute_snapshots FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = (SELECT qa_round_id FROM public.qa_sessions WHERE id = qa_session_id)))));
CREATE POLICY qas_update ON public.qa_attribute_snapshots FOR UPDATE TO authenticated USING (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = (SELECT qa_round_id FROM public.qa_sessions WHERE id = qa_session_id))))) WITH CHECK (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = (SELECT qa_round_id FROM public.qa_sessions WHERE id = qa_session_id)))));

DROP INDEX IF EXISTS public.qa_attribute_snapshots_round_idx;
CREATE INDEX qa_attribute_snapshots_session_idx ON public.qa_attribute_snapshots (qa_session_id, captured_at);
