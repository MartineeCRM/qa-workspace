ALTER TABLE public.qa_discussions
  ADD COLUMN workflow_updated_by uuid,
  ADD COLUMN workflow_updated_by_external_name text;

UPDATE public.qa_discussions
SET workflow_updated_by = created_by
WHERE workflow_updated_by IS NULL;

NOTIFY pgrst, 'reload schema';
