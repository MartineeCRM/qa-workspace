-- A checklist row can be carried over before the tester performs the action.
-- Keep that separate from created_at so the execution board and delayed
-- attribute reminder are anchored to the real QA action.
ALTER TABLE public.qa_round_checklist_items
  ADD COLUMN executed_at timestamptz;
