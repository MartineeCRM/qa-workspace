DROP INDEX IF EXISTS public.qa_item_status_event_uq;
DROP INDEX IF EXISTS public.qa_item_status_attr_uq;
CREATE UNIQUE INDEX qa_item_status_item_uq
  ON public.qa_item_status (stage_id, event_id, attribute_id) NULLS NOT DISTINCT;