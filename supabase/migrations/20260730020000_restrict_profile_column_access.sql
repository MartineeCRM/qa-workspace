-- Issue 1: profiles.email must not be client-writable. The pre-existing profiles_update
-- RLS policy and the blanket UPDATE grant let any authenticated user overwrite their own
-- email directly, contradicting the "server-populated only" invariant. Restrict the grant
-- to the columns that are actually meant to be client-editable. ensure_profile() is
-- SECURITY DEFINER and owned by the table owner, so it still bypasses this grant and can
-- keep writing email.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (display_name, avatar_url) ON public.profiles TO authenticated;

-- Issue 2: profiles_select was USING (true), letting any signed-in user enumerate every
-- registered user's email (previously just display_name, which was already an anomaly
-- vs. every other table in this schema being workspace-scoped). Scope it to "your own
-- row, or a profile of someone who shares at least one workspace with you", matching the
-- is_ws_member pattern used elsewhere.
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated USING (
  id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.workspace_members wm1
    JOIN public.workspace_members wm2 ON wm1.workspace_id = wm2.workspace_id
    WHERE wm1.user_id = auth.uid() AND wm2.user_id = profiles.id
  )
);
