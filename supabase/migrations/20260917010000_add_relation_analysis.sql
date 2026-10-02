CREATE TABLE IF NOT EXISTS public.qa_relation_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qa_session_id uuid NOT NULL REFERENCES public.qa_sessions(id) ON DELETE CASCADE,
  input_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('running','complete','partial','failed')),
  total_logs integer NOT NULL DEFAULT 0,
  covered_logs integer NOT NULL DEFAULT 0,
  planned_batches integer NOT NULL DEFAULT 0,
  completed_batches integer NOT NULL DEFAULT 0,
  model text NOT NULL,
  prompt_version text NOT NULL,
  definitions jsonb NOT NULL DEFAULT '[]',
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  error text,
  started_by uuid NOT NULL REFERENCES public.profiles(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (qa_session_id, input_hash)
);
CREATE INDEX IF NOT EXISTS qa_relation_analyses_session_idx ON public.qa_relation_analyses(qa_session_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.qa_relation_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.qa_relation_analyses(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  title text NOT NULL,
  reasoning text NOT NULL,
  connection_reason text NOT NULL,
  normal_exceptions jsonb NOT NULL,
  evidence jsonb NOT NULL,
  review_status text NOT NULL DEFAULT 'open' CHECK (review_status IN ('open','confirmed','normal','deferred')),
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  UNIQUE (analysis_id, fingerprint)
);
ALTER TABLE public.qa_relation_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_relation_candidates ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.qa_relation_analyses, public.qa_relation_candidates TO authenticated;
GRANT UPDATE (review_status, reviewed_by, reviewed_at) ON public.qa_relation_candidates TO authenticated;
GRANT ALL ON public.qa_relation_analyses, public.qa_relation_candidates TO service_role;

CREATE POLICY relation_analysis_read ON public.qa_relation_analyses FOR SELECT TO authenticated
USING (public.is_ws_member(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = (SELECT qa_round_id FROM public.qa_sessions WHERE id = qa_session_id)))));
CREATE POLICY relation_candidate_read ON public.qa_relation_candidates FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.qa_relation_analyses a WHERE a.id = analysis_id));
CREATE POLICY relation_candidate_review ON public.qa_relation_candidates FOR UPDATE TO authenticated
USING (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = (SELECT qa_round_id FROM public.qa_sessions WHERE id = (SELECT qa_session_id FROM public.qa_relation_analyses WHERE id = analysis_id))))))
WITH CHECK (reviewed_by = auth.uid() AND public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = (SELECT qa_round_id FROM public.qa_sessions WHERE id = (SELECT qa_session_id FROM public.qa_relation_analyses WHERE id = analysis_id))))));
NOTIFY pgrst, 'reload schema';
