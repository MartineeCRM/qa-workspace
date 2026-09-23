-- Existing users must receive membership when invited, too.
CREATE OR REPLACE FUNCTION public.tg_accept_existing_workspace_invite()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _user_id uuid;
BEGIN
  SELECT id INTO _user_id FROM public.profiles
  WHERE lower(btrim(email)) = NEW.email;
  IF _user_id IS NOT NULL THEN
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (NEW.workspace_id, _user_id, NEW.role)
    ON CONFLICT (workspace_id, user_id) DO NOTHING;
    DELETE FROM public.workspace_invites WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER workspace_invites_accept_existing
AFTER INSERT ON public.workspace_invites
FOR EACH ROW EXECUTE FUNCTION public.tg_accept_existing_workspace_invite();

-- Also retry pending invitations on subsequent profile initialization.
DROP TRIGGER profiles_consume_invites ON public.profiles;
CREATE TRIGGER profiles_consume_invites AFTER INSERT OR UPDATE OF email ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_consume_workspace_invites();

-- Repair only memberships explicitly granted by an existing invitation.
INSERT INTO public.workspace_members (workspace_id, user_id, role)
SELECT i.workspace_id, p.id, i.role
FROM public.workspace_invites i
JOIN public.profiles p ON lower(btrim(p.email)) = i.email
ON CONFLICT (workspace_id, user_id) DO NOTHING;

DELETE FROM public.workspace_invites i USING public.profiles p
WHERE lower(btrim(p.email)) = i.email
AND EXISTS (
  SELECT 1 FROM public.workspace_members m
  WHERE m.workspace_id = i.workspace_id AND m.user_id = p.id
);
