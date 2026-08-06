ALTER TABLE public.qa_run_events
  ADD COLUMN source_event_id text;

ALTER TABLE public.qa_run_events
  ADD CONSTRAINT qa_run_events_session_source_event_uq
  UNIQUE (qa_session_id, source_event_id);
