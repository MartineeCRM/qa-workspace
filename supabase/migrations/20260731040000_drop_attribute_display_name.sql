-- display_name on properties/custom attributes was never surfaced in the UI and duplicated
-- what description already covers; no rows use it. Events keep display_name (shown in the list).

ALTER TABLE public.taxonomy_event_properties DROP COLUMN display_name;
ALTER TABLE public.taxonomy_custom_attributes DROP COLUMN display_name;
