-- Issue 1 (fast-follow #2): the prior migration restricted client UPDATE of profiles.email,
-- but the column-level INSERT grant was still unrestricted. A client could bypass
-- ensure_profile() entirely with `insert into profiles (id, display_name, email) values (...)`,
-- and because ensure_profile's `email = COALESCE(public.profiles.email, _email)` never
-- overwrites a non-null email, a spoofed value would persist permanently. Restrict the
-- INSERT grant to the columns a client-driven insert should ever populate; ensure_profile()
-- is SECURITY DEFINER (owned by postgres, not authenticated) and so is unaffected by this
-- grant change and can still populate email from auth.users as before.
REVOKE INSERT ON public.profiles FROM authenticated;
GRANT INSERT (id, display_name, avatar_url) ON public.profiles TO authenticated;
