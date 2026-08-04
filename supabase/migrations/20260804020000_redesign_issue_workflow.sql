ALTER TABLE public.qa_discussions
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  DROP CONSTRAINT qa_discussions_workflow_status_check;

UPDATE public.qa_discussions
SET
  workflow_status = CASE workflow_status
    WHEN 'needs_review' THEN 'open'
    WHEN 'still_issue' THEN 'talk'
    WHEN 'next_validation' THEN 'fixing'
    ELSE workflow_status
  END,
  updated_at = created_at;

ALTER TABLE public.qa_discussions
  ALTER COLUMN workflow_status SET DEFAULT 'open',
  ADD CONSTRAINT qa_discussions_workflow_status_check
    CHECK (workflow_status IN ('open', 'talk', 'fixing', 'done', 'dismissed', 'verified'));

NOTIFY pgrst, 'reload schema';
