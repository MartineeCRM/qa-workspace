CREATE TABLE public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('manager', 'contributor', 'client_reviewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

CREATE TABLE public.project_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('manager', 'contributor', 'client_reviewer')),
  invited_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  UNIQUE (project_id, email)
);

GRANT ALL ON public.project_members, public.project_invites TO service_role;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_invites ENABLE ROW LEVEL SECURITY;

INSERT INTO public.project_members (project_id, user_id, role)
SELECT id, created_by, 'manager' FROM public.projects
ON CONFLICT (project_id, user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.tg_setup_project_access()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.project_members (project_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'manager')
  ON CONFLICT (project_id, user_id) DO NOTHING;

  INSERT INTO public.qa_project_issue_shares (project_id, created_by, expires_at)
  VALUES (NEW.id, NEW.created_by, now() + interval '10 years')
  ON CONFLICT (project_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER setup_project_access
AFTER INSERT ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.tg_setup_project_access();

CREATE OR REPLACE FUNCTION public.tg_consume_project_invites()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    INSERT INTO public.project_members (project_id, user_id, role)
    SELECT project_id, NEW.id, role
    FROM public.project_invites
    WHERE email = lower(btrim(NEW.email)) AND expires_at > now()
    ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role;

    DELETE FROM public.project_invites
    WHERE email = lower(btrim(NEW.email));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER consume_project_invites
AFTER INSERT OR UPDATE OF email ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_consume_project_invites();

NOTIFY pgrst, 'reload schema';
