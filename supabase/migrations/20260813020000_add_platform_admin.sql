CREATE TABLE public.platform_admins (
  email text PRIMARY KEY CHECK (email = lower(btrim(email))),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.platform_admins TO service_role;

INSERT INTO public.platform_admins (email)
VALUES ('yoomin.jeong@martinee.io');

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins
    WHERE email = lower(auth.jwt() ->> 'email')
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

DROP POLICY ws_insert ON public.workspaces;

CREATE POLICY ws_insert ON public.workspaces
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  )
);
