-- Validation rules move from a single target column set (event_id/property_id/custom_attribute_id)
-- to a many-to-many join table, so one rule can express a relationship across multiple
-- events/properties/custom attributes (e.g. "this event's product_id must match that event's").

CREATE TABLE public.validation_rule_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.validation_rules(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('event', 'property', 'custom_attribute')),
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX validation_rule_targets_uq ON public.validation_rule_targets (rule_id, target_type, target_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.validation_rule_targets TO authenticated;
GRANT ALL ON public.validation_rule_targets TO service_role;
ALTER TABLE public.validation_rule_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY vrt_select ON public.validation_rule_targets FOR SELECT TO authenticated USING (
  public.is_ws_member(public.ws_of_project((SELECT vr.project_id FROM public.validation_rules vr WHERE vr.id = rule_id)))
);
CREATE POLICY vrt_insert ON public.validation_rule_targets FOR INSERT TO authenticated WITH CHECK (
  public.can_edit_ws(public.ws_of_project((SELECT vr.project_id FROM public.validation_rules vr WHERE vr.id = rule_id)))
);
CREATE POLICY vrt_delete ON public.validation_rule_targets FOR DELETE TO authenticated USING (
  public.can_edit_ws(public.ws_of_project((SELECT vr.project_id FROM public.validation_rules vr WHERE vr.id = rule_id)))
);

-- Carry over existing single-target rules before dropping the old columns.
INSERT INTO public.validation_rule_targets (rule_id, target_type, target_id)
SELECT id, 'event', event_id FROM public.validation_rules WHERE event_id IS NOT NULL;
INSERT INTO public.validation_rule_targets (rule_id, target_type, target_id)
SELECT id, 'property', property_id FROM public.validation_rules WHERE property_id IS NOT NULL;
INSERT INTO public.validation_rule_targets (rule_id, target_type, target_id)
SELECT id, 'custom_attribute', custom_attribute_id FROM public.validation_rules WHERE custom_attribute_id IS NOT NULL;

ALTER TABLE public.validation_rules DROP CONSTRAINT validation_rules_target_chk;
ALTER TABLE public.validation_rules DROP COLUMN event_id;
ALTER TABLE public.validation_rules DROP COLUMN property_id;
ALTER TABLE public.validation_rules DROP COLUMN custom_attribute_id;
