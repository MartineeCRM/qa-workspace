ALTER TABLE public.qa_discussion_comments
  ALTER COLUMN author_id DROP NOT NULL,
  ADD COLUMN external_author_name text;

ALTER TABLE public.qa_discussion_comments
  ADD CONSTRAINT qa_discussion_comments_author_check
  CHECK (author_id IS NOT NULL OR length(trim(external_author_name)) BETWEEN 1 AND 80);

INSERT INTO public.qa_discussion_comments (
  discussion_id, author_id, external_author_name, body, created_at
)
SELECT share.discussion_id, NULL, comment.author_name, comment.body, comment.created_at
FROM public.qa_issue_share_comments comment
JOIN public.qa_issue_shares share ON share.id = comment.share_id;

NOTIFY pgrst, 'reload schema';
