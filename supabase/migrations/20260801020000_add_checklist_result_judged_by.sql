ALTER TABLE public.qa_checklist_item_results
  ADD COLUMN judged_by text CHECK (judged_by IN ('rule', 'ai'));
