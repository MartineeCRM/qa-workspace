-- array-of-object custom attributes (e.g. offer_list, $current_location) bundle multiple
-- named keys per element. Model those keys the same way event properties model an event's
-- fields, instead of leaving them as prose inside example_value.

CREATE TABLE public.taxonomy_custom_attribute_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  custom_attribute_id uuid NOT NULL REFERENCES public.taxonomy_custom_attributes(id) ON DELETE CASCADE,
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
CREATE UNIQUE INDEX taxonomy_custom_attribute_properties_name_uq ON public.taxonomy_custom_attribute_properties (custom_attribute_id, technical_name);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.taxonomy_custom_attribute_properties TO authenticated;
GRANT ALL ON public.taxonomy_custom_attribute_properties TO service_role;
ALTER TABLE public.taxonomy_custom_attribute_properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY tcap_select ON public.taxonomy_custom_attribute_properties FOR SELECT TO authenticated USING (
  public.is_ws_member(public.ws_of_project((SELECT project_id FROM public.taxonomy_custom_attributes WHERE id = custom_attribute_id)))
);
CREATE POLICY tcap_insert ON public.taxonomy_custom_attribute_properties FOR INSERT TO authenticated WITH CHECK (
  public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.taxonomy_custom_attributes WHERE id = custom_attribute_id))) AND created_by = auth.uid()
);
CREATE POLICY tcap_update ON public.taxonomy_custom_attribute_properties FOR UPDATE TO authenticated USING (
  public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.taxonomy_custom_attributes WHERE id = custom_attribute_id)))
) WITH CHECK (
  public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.taxonomy_custom_attributes WHERE id = custom_attribute_id)))
);
CREATE POLICY tcap_delete ON public.taxonomy_custom_attribute_properties FOR DELETE TO authenticated USING (
  public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.taxonomy_custom_attributes WHERE id = custom_attribute_id)))
);

CREATE TRIGGER trg_taxonomy_custom_attribute_properties_updated BEFORE UPDATE ON public.taxonomy_custom_attribute_properties FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
