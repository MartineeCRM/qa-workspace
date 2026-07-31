CREATE TABLE public.taxonomy_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX taxonomy_categories_name_uq ON public.taxonomy_categories (project_id, name);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.taxonomy_categories TO authenticated;
GRANT ALL ON public.taxonomy_categories TO service_role;
ALTER TABLE public.taxonomy_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY tc_select ON public.taxonomy_categories FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project(project_id)));
CREATE POLICY tc_insert ON public.taxonomy_categories FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)) AND created_by = auth.uid());
CREATE POLICY tc_update ON public.taxonomy_categories FOR UPDATE TO authenticated USING (public.can_edit_ws(public.ws_of_project(project_id))) WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)));
CREATE POLICY tc_delete ON public.taxonomy_categories FOR DELETE TO authenticated USING (public.can_edit_ws(public.ws_of_project(project_id)));
CREATE TRIGGER trg_taxonomy_categories_updated BEFORE UPDATE ON public.taxonomy_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_taxonomy_categories_log AFTER INSERT OR UPDATE ON public.taxonomy_categories FOR EACH ROW EXECUTE FUNCTION public.tg_log_activity();

ALTER TABLE public.taxonomy_events ADD COLUMN category_id uuid REFERENCES public.taxonomy_categories(id) ON DELETE SET NULL;
