-- Run in a transaction with the migration applied; always rolls back fixtures.
BEGIN;
DO $$
DECLARE
  owner_id uuid := gen_random_uuid();
  existing_id uuid := gen_random_uuid();
  new_id uuid := gen_random_uuid();
  ws uuid;
  existing_email text := existing_id::text || '@example.invalid';
  new_email text := new_id::text || '@example.invalid';
BEGIN
  INSERT INTO public.profiles(id, display_name, email)
  VALUES (owner_id, 'Invite test owner', owner_id::text || '@example.invalid'),
         (existing_id, 'Existing invite test', existing_email);
  INSERT INTO public.workspaces(name, created_by)
  VALUES ('Invitation regression test', owner_id) RETURNING id INTO ws;

  INSERT INTO public.workspace_invites(workspace_id, email, role, invited_by)
  VALUES (ws, '  ' || upper(existing_email) || '  ', 'admin', owner_id);
  ASSERT EXISTS (SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws AND user_id = existing_id AND role = 'admin'),
    'Existing users must receive the invited role';
  ASSERT NOT EXISTS (SELECT 1 FROM public.workspace_invites WHERE workspace_id = ws),
    'Accepted invitations must be removed';

  INSERT INTO public.workspace_invites(workspace_id, email, role, invited_by)
  VALUES (ws, existing_email, 'viewer', owner_id);
  ASSERT EXISTS (SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws AND user_id = existing_id AND role = 'admin'),
    'Reinviting must preserve an existing membership role';

  INSERT INTO public.workspace_invites(workspace_id, email, role, invited_by)
  VALUES (ws, new_email, 'editor', owner_id);
  ASSERT EXISTS (SELECT 1 FROM public.workspace_invites WHERE workspace_id = ws),
    'Unregistered users must remain pending';
  INSERT INTO public.profiles(id, display_name, email)
  VALUES (new_id, 'New invite test', new_email);
  ASSERT EXISTS (SELECT 1 FROM public.workspace_members
    WHERE workspace_id = ws AND user_id = new_id AND role = 'editor'),
    'New profiles must still consume invitations';
  PERFORM set_config('request.jwt.claim.sub', new_id::text, true);
  PERFORM set_config('test.invite_workspace', ws::text, true);
END;
$$;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.workspace_invites(workspace_id, email, role, invited_by)
    VALUES (current_setting('test.invite_workspace')::uuid,
      'unauthorized@example.invalid', 'admin', auth.uid());
    RAISE EXCEPTION 'Non-admin invitation unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;
ROLLBACK;
