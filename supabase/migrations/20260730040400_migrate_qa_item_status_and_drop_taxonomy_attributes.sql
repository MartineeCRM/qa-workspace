ALTER TABLE public.qa_item_status ADD COLUMN property_id uuid REFERENCES public.taxonomy_event_properties(id) ON DELETE CASCADE;
ALTER TABLE public.qa_item_status ADD COLUMN custom_attribute_id uuid REFERENCES public.taxonomy_custom_attributes(id) ON DELETE CASCADE;

UPDATE public.qa_item_status qis
SET property_id = qis.attribute_id
FROM public.taxonomy_attributes ta
WHERE qis.attribute_id = ta.id AND ta.event_id IS NOT NULL;

UPDATE public.qa_item_status qis
SET custom_attribute_id = qis.attribute_id
FROM public.taxonomy_attributes ta
WHERE qis.attribute_id = ta.id AND ta.event_id IS NULL;

DROP INDEX IF EXISTS public.qa_item_status_item_uq;
ALTER TABLE public.qa_item_status DROP CONSTRAINT qa_item_status_target_chk;
ALTER TABLE public.qa_item_status DROP COLUMN attribute_id;

ALTER TABLE public.qa_item_status ADD CONSTRAINT qa_item_status_target_chk
  CHECK (num_nonnulls(event_id, property_id, custom_attribute_id) = 1);

CREATE UNIQUE INDEX qa_item_status_item_uq
  ON public.qa_item_status (qa_environment_id, event_id, property_id, custom_attribute_id) NULLS NOT DISTINCT;

DROP TABLE public.taxonomy_attributes;
