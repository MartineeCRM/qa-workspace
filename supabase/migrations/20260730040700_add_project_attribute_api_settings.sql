CREATE TABLE public.project_attribute_api_settings (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  base_url text NOT NULL,
  user_id_param_name text NOT NULL DEFAULT 'user_id',
  auth_secret text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_attribute_api_settings TO authenticated;
GRANT ALL ON public.project_attribute_api_settings TO service_role;
ALTER TABLE public.project_attribute_api_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY paas_select ON public.project_attribute_api_settings FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project(project_id)));
CREATE POLICY paas_insert ON public.project_attribute_api_settings FOR INSERT TO authenticated WITH CHECK (public.can_admin_ws(public.ws_of_project(project_id)));
CREATE POLICY paas_update ON public.project_attribute_api_settings FOR UPDATE TO authenticated USING (public.can_admin_ws(public.ws_of_project(project_id))) WITH CHECK (public.can_admin_ws(public.ws_of_project(project_id)));

REVOKE SELECT (auth_secret) ON public.project_attribute_api_settings FROM authenticated;
