UPDATE public.taxonomy_event_properties
SET is_required = true
WHERE NOT is_required;

ALTER TABLE public.taxonomy_event_properties
  ALTER COLUMN is_required SET DEFAULT true;
