CREATE TABLE public.qa_issue_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  discussion_id uuid NOT NULL UNIQUE REFERENCES public.qa_discussions(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  revoked_at timestamptz
);

CREATE TABLE public.qa_issue_share_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id uuid NOT NULL REFERENCES public.qa_issue_shares(id) ON DELETE CASCADE,
  author_name text NOT NULL CHECK (length(trim(author_name)) BETWEEN 1 AND 80),
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.qa_issue_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_issue_share_comments ENABLE ROW LEVEL SECURITY;

CREATE INDEX qa_issue_share_comments_share_created_idx
  ON public.qa_issue_share_comments (share_id, created_at);

NOTIFY pgrst, 'reload schema';
