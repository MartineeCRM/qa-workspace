-- Reverting 20260731040000: the value stored in `description` for properties/custom
-- attributes was actually functioning as a short display label, not a full explanation.
-- Move it back to display_name and leave description blank for users to fill in later.

ALTER TABLE public.taxonomy_event_properties ADD COLUMN display_name text;
ALTER TABLE public.taxonomy_custom_attributes ADD COLUMN display_name text;

UPDATE public.taxonomy_event_properties SET display_name = description, description = NULL
WHERE description IS NOT NULL;
UPDATE public.taxonomy_custom_attributes SET display_name = description, description = NULL
WHERE description IS NOT NULL;
