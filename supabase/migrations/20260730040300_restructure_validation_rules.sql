ALTER TABLE public.validation_rules ADD COLUMN property_id uuid REFERENCES public.taxonomy_event_properties(id) ON DELETE CASCADE;
ALTER TABLE public.validation_rules ADD COLUMN custom_attribute_id uuid REFERENCES public.taxonomy_custom_attributes(id) ON DELETE CASCADE;

-- 기존 attribute_id(옛 taxonomy_attributes 참조)를 새 컬럼으로 이관
UPDATE public.validation_rules vr
SET property_id = vr.attribute_id
FROM public.taxonomy_attributes ta
WHERE vr.attribute_id = ta.id AND ta.event_id IS NOT NULL;

UPDATE public.validation_rules vr
SET custom_attribute_id = vr.attribute_id
FROM public.taxonomy_attributes ta
WHERE vr.attribute_id = ta.id AND ta.event_id IS NULL;

ALTER TABLE public.validation_rules DROP COLUMN attribute_id;
ALTER TABLE public.validation_rules DROP COLUMN rule_type;
ALTER TABLE public.validation_rules DROP COLUMN severity;
ALTER TABLE public.validation_rules DROP COLUMN pass_condition_type;
ALTER TABLE public.validation_rules DROP COLUMN minimum_pass_rate;
ALTER TABLE public.validation_rules DROP COLUMN maximum_failure_count;
ALTER TABLE public.validation_rules DROP COLUMN rule_config;

ALTER TABLE public.validation_rules ADD CONSTRAINT validation_rules_target_chk
  CHECK (NOT (property_id IS NOT NULL AND custom_attribute_id IS NOT NULL));
