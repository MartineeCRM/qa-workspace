ALTER TABLE public.qa_discussions
  DROP CONSTRAINT qa_discussions_target_type_check;

ALTER TABLE public.qa_discussions
  ADD CONSTRAINT qa_discussions_target_type_check
  CHECK (target_type IN ('event', 'property', 'custom_attribute'));

NOTIFY pgrst, 'reload schema';
