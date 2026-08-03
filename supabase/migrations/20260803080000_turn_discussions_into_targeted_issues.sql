ALTER TABLE public.qa_discussions
  DROP CONSTRAINT qa_discussions_result_uq;

ALTER TABLE public.qa_discussions
  ADD COLUMN target_type text NOT NULL DEFAULT 'event'
    CHECK (target_type IN ('event', 'property')),
  ADD COLUMN target_id text NOT NULL DEFAULT 'event',
  ADD COLUMN target_label text NOT NULL DEFAULT '이벤트 전체',
  ADD COLUMN workflow_status text NOT NULL DEFAULT 'needs_review'
    CHECK (workflow_status IN ('needs_review', 'still_issue', 'next_validation', 'dismissed', 'verified'));

CREATE UNIQUE INDEX qa_discussions_target_uq
  ON public.qa_discussions (checklist_item_result_id, target_type, target_id);

CREATE INDEX qa_discussions_workflow_status_idx
  ON public.qa_discussions (workflow_status);

-- The old helper assumed one discussion per result. Targeted issues add comments
-- directly to a selected thread, so keeping it would silently choose the wrong one.
DROP FUNCTION public.add_qa_discussion_comment(uuid, text);

NOTIFY pgrst, 'reload schema';
