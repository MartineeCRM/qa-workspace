CREATE TABLE public.taxonomy_event_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.taxonomy_events(id) ON DELETE CASCADE,
  technical_name text NOT NULL,
  display_name text,
  description text,
  data_type text NOT NULL DEFAULT 'string',
  is_required boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  example_value jsonb,
  allowed_values jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX taxonomy_event_properties_name_uq ON public.taxonomy_event_properties (event_id, technical_name);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.taxonomy_event_properties TO authenticated;
GRANT ALL ON public.taxonomy_event_properties TO service_role;
ALTER TABLE public.taxonomy_event_properties ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.taxonomy_custom_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  technical_name text NOT NULL,
  display_name text,
  description text,
  data_type text NOT NULL DEFAULT 'string',
  is_required boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  example_value jsonb,
  allowed_values jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX taxonomy_custom_attributes_name_uq ON public.taxonomy_custom_attributes (project_id, technical_name);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.taxonomy_custom_attributes TO authenticated;
GRANT ALL ON public.taxonomy_custom_attributes TO service_role;
ALTER TABLE public.taxonomy_custom_attributes ENABLE ROW LEVEL SECURITY;

-- 데이터 이관
INSERT INTO public.taxonomy_event_properties
  (id, event_id, technical_name, display_name, description, data_type, is_required, is_active, example_value, allowed_values, sort_order, created_by, created_at, updated_at)
SELECT id, event_id, technical_name, display_name, description, data_type, is_required, is_active, example_value, allowed_values, sort_order, created_by, created_at, updated_at
FROM public.taxonomy_attributes WHERE event_id IS NOT NULL;

INSERT INTO public.taxonomy_custom_attributes
  (id, project_id, technical_name, display_name, description, data_type, is_required, is_active, example_value, allowed_values, sort_order, created_by, created_at, updated_at)
SELECT id, project_id, technical_name, display_name, description, data_type, is_required, is_active, example_value, allowed_values, sort_order, created_by, created_at, updated_at
FROM public.taxonomy_attributes WHERE event_id IS NULL;

-- RLS 정책
CREATE POLICY tep_select ON public.taxonomy_event_properties FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project((SELECT project_id FROM public.taxonomy_events WHERE id = event_id))));
CREATE POLICY tep_insert ON public.taxonomy_event_properties FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.taxonomy_events WHERE id = event_id))) AND created_by = auth.uid());
CREATE POLICY tep_update ON public.taxonomy_event_properties FOR UPDATE TO authenticated USING (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.taxonomy_events WHERE id = event_id)))) WITH CHECK (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.taxonomy_events WHERE id = event_id))));
CREATE POLICY tep_delete ON public.taxonomy_event_properties FOR DELETE TO authenticated USING (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.taxonomy_events WHERE id = event_id))));

CREATE POLICY tca_select ON public.taxonomy_custom_attributes FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project(project_id)));
CREATE POLICY tca_insert ON public.taxonomy_custom_attributes FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)) AND created_by = auth.uid());
CREATE POLICY tca_update ON public.taxonomy_custom_attributes FOR UPDATE TO authenticated USING (public.can_edit_ws(public.ws_of_project(project_id))) WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)));
CREATE POLICY tca_delete ON public.taxonomy_custom_attributes FOR DELETE TO authenticated USING (public.can_edit_ws(public.ws_of_project(project_id)));

CREATE TRIGGER trg_taxonomy_event_properties_updated BEFORE UPDATE ON public.taxonomy_event_properties FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_taxonomy_custom_attributes_updated BEFORE UPDATE ON public.taxonomy_custom_attributes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 주의: validation_rules/qa_item_status가 옛 taxonomy_attributes.id를 참조 중이므로,
-- 여기서는 taxonomy_attributes를 아직 DROP하지 않는다 (다음 마이그레이션에서 참조 이관 후 DROP).
