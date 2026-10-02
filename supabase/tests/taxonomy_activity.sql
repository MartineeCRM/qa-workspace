-- Run after the taxonomy activity migration; fixtures are rolled back.
BEGIN;
DO $$
DECLARE
  actor uuid := gen_random_uuid();
  ws uuid;
  project uuid;
  event uuid;
  property uuid;
  attribute uuid;
  subproperty uuid;
  category uuid;
  activity_count bigint;
BEGIN
  INSERT INTO public.profiles(id, display_name) VALUES (actor, '활동 테스트');
  PERFORM set_config('request.jwt.claim.sub', actor::text, true);
  INSERT INTO public.workspaces(name, created_by)
    VALUES ('Activity test', actor) RETURNING id INTO ws;
  INSERT INTO public.projects(workspace_id, name, project_key, created_by)
    VALUES (ws, 'Activity test', actor::text, actor) RETURNING id INTO project;
  INSERT INTO public.taxonomy_events(project_id, technical_name, created_by)
    VALUES (project, 'purchase', actor) RETURNING id INTO event;
  ASSERT (SELECT count(*) FROM public.activity_logs
    WHERE entity_id = event AND action_type = 'insert') = 1, 'Event inserts must log once';
  INSERT INTO public.taxonomy_event_properties(event_id, technical_name, created_by)
    VALUES (event, 'price', actor) RETURNING id INTO property;
  UPDATE public.taxonomy_event_properties SET description = '실결제가', example_value = '7000'
    WHERE id = property;
  ASSERT EXISTS (SELECT 1 FROM public.activity_logs WHERE entity_id = property
    AND action_type = 'update' AND project_id = project AND workspace_id = ws
    AND actor_user_id = actor AND metadata->>'actor_name' = '활동 테스트'
    AND metadata->>'entity_name' = 'purchase.price'
    AND metadata->>'changed_fields' = '설명, 예시값'), 'Property changes must log scope, author and fields';
  SELECT count(*) INTO activity_count FROM public.activity_logs WHERE entity_id = property;
  UPDATE public.taxonomy_event_properties SET description = '실결제가' WHERE id = property;
  UPDATE public.taxonomy_event_properties SET updated_at = now() + interval '1 second' WHERE id = property;
  ASSERT (SELECT count(*) FROM public.activity_logs WHERE entity_id = property) = activity_count,
    'No-op and timestamp-only updates must not log';
  INSERT INTO public.taxonomy_custom_attributes(project_id, technical_name, created_by)
    VALUES (project, 'offers', actor) RETURNING id INTO attribute;
  INSERT INTO public.taxonomy_custom_attribute_properties(custom_attribute_id, technical_name, created_by)
    VALUES (attribute, 'code', actor) RETURNING id INTO subproperty;
  UPDATE public.taxonomy_custom_attribute_properties SET is_required = true WHERE id = subproperty;
  ASSERT EXISTS (SELECT 1 FROM public.activity_logs WHERE entity_id = subproperty
    AND action_type = 'update' AND project_id = project
    AND metadata->>'entity_name' = 'offers.code'), 'Nested attributes must resolve their project';
  UPDATE public.taxonomy_custom_attributes SET display_name = '혜택 목록' WHERE id = attribute;
  INSERT INTO public.taxonomy_categories(project_id, name, created_by)
    VALUES (project, '구매', actor) RETURNING id INTO category;
  ASSERT (SELECT count(*) FROM public.activity_logs WHERE entity_id = category) = 1,
    'Category inserts must log once';
  DELETE FROM public.taxonomy_event_properties WHERE id = property;
  DELETE FROM public.taxonomy_custom_attribute_properties WHERE id = subproperty;
  DELETE FROM public.taxonomy_custom_attributes WHERE id = attribute;
  DELETE FROM public.taxonomy_events WHERE id = event;
  DELETE FROM public.taxonomy_categories WHERE id = category;
  ASSERT (SELECT count(*) FROM public.activity_logs
    WHERE entity_id IN (property, subproperty, attribute, event, category) AND action_type = 'delete') = 5,
    'Every taxonomy entity must log direct deletion';
END;
$$;
ROLLBACK;
