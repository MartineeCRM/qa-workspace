-- profiles.email is populated server-side from auth.users, never from client input.
ALTER TABLE public.profiles ADD COLUMN email text;

CREATE OR REPLACE FUNCTION public.ensure_profile(_display_name text DEFAULT NULL)
RETURNS public.profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles; _email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT email INTO _email FROM auth.users WHERE id = auth.uid();
  INSERT INTO public.profiles (id, display_name, email)
  VALUES (auth.uid(), COALESCE(NULLIF(btrim(_display_name), ''), 'New user'), _email)
  ON CONFLICT (id) DO UPDATE SET
    display_name = COALESCE(NULLIF(btrim(_display_name), ''), public.profiles.display_name),
    email = COALESCE(public.profiles.email, _email)
  RETURNING * INTO p;
  RETURN p;
END; $$;
GRANT EXECUTE ON FUNCTION public.ensure_profile(text) TO authenticated;

-- Pending email invites: workspace_id + email -> role, consumed at first signup.
CREATE TABLE public.workspace_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','admin','editor','viewer')),
  invited_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, email)
);
GRANT SELECT, INSERT, DELETE ON public.workspace_invites TO authenticated;
GRANT ALL ON public.workspace_invites TO service_role;
ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY wi_select ON public.workspace_invites FOR SELECT TO authenticated USING (public.can_admin_ws(workspace_id));
CREATE POLICY wi_insert ON public.workspace_invites FOR INSERT TO authenticated WITH CHECK (public.can_admin_ws(workspace_id) AND invited_by = auth.uid());
CREATE POLICY wi_delete ON public.workspace_invites FOR DELETE TO authenticated USING (public.can_admin_ws(workspace_id));

CREATE OR REPLACE FUNCTION public.tg_normalize_invite_email() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.email := lower(btrim(NEW.email));
  RETURN NEW;
END; $$;
CREATE TRIGGER workspace_invites_normalize_email BEFORE INSERT OR UPDATE ON public.workspace_invites
FOR EACH ROW EXECUTE FUNCTION public.tg_normalize_invite_email();

-- Consume matching invites the moment a brand-new profile is created (= first signup).
-- Fires only on true INSERT, not on ensure_profile's ON CONFLICT DO UPDATE path,
-- so an existing user re-running ensure_profile never re-triggers this.
CREATE OR REPLACE FUNCTION public.tg_consume_workspace_invites() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    SELECT wi.workspace_id, NEW.id, wi.role
    FROM public.workspace_invites wi
    WHERE wi.email = lower(btrim(NEW.email))
    ON CONFLICT DO NOTHING;

    DELETE FROM public.workspace_invites WHERE email = lower(btrim(NEW.email));
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER profiles_consume_invites AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_consume_workspace_invites();
