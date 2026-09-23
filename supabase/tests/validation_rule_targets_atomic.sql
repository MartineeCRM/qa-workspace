-- 원자적 교체 함수가 중간 실패 시 기존 대상을 보존하는지 확인한다.
BEGIN;
DO $$
DECLARE
  actor uuid := gen_random_uuid();
  viewer uuid := gen_random_uuid();
  ws uuid;
  project uuid;
  event uuid;
  rule uuid;
  target_count int;
BEGIN
  INSERT INTO public.profiles(id, display_name) VALUES (actor, '규칙 테스트');
  PERFORM set_config('request.jwt.claim.sub', actor::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  INSERT INTO public.workspaces(name, created_by) VALUES ('Rule atomic test', actor) RETURNING id INTO ws;
  INSERT INTO public.workspace_members(workspace_id, user_id, role) VALUES (ws, actor, 'owner') ON CONFLICT DO NOTHING;
  INSERT INTO public.projects(workspace_id, name, project_key, created_by)
    VALUES (ws, 'Rule atomic test', actor::text, actor) RETURNING id INTO project;
  INSERT INTO public.taxonomy_events(project_id, technical_name, created_by)
    VALUES (project, 'purchase', actor) RETURNING id INTO event;
  INSERT INTO public.validation_rules(project_id, name, created_by)
    VALUES (project, '테스트 규칙', actor) RETURNING id INTO rule;
  PERFORM public.replace_validation_rule_targets(rule,
    jsonb_build_array(jsonb_build_object('target_type', 'event', 'target_id', event)));
  SELECT count(*) INTO target_count FROM public.validation_rule_targets WHERE rule_id = rule;
  ASSERT target_count = 1, '정상 저장 시 대상이 1개여야 함';

  -- 잘못된 target_type으로 호출하면 INSERT의 CHECK 제약이 실패해야 하고,
  -- 그래도 기존 대상(1개)은 그대로 남아있어야 한다.
  BEGIN
    PERFORM public.replace_validation_rule_targets(rule,
      jsonb_build_array(jsonb_build_object('target_type', 'invalid_type', 'target_id', event)));
    RAISE EXCEPTION '체크 제약 위반이 발생했어야 함';
  EXCEPTION WHEN check_violation THEN
    NULL; -- 예상된 실패
  END;
  SELECT count(*) INTO target_count FROM public.validation_rule_targets WHERE rule_id = rule;
  ASSERT target_count = 1, '삽입 실패 시에도 기존 대상이 사라지면 안 됨 (지금은 0개가 되던 버그)';

  -- 잘못된 target_id(uuid 아님)로 호출해도 기존 대상이 사라지면 안 된다.
  BEGIN
    PERFORM public.replace_validation_rule_targets(rule,
      jsonb_build_array(jsonb_build_object('target_type', 'event', 'target_id', 'not-a-uuid')));
    RAISE EXCEPTION 'uuid 캐스팅 실패가 발생했어야 함';
  EXCEPTION WHEN invalid_text_representation THEN
    NULL; -- 예상된 실패
  END;
  SELECT count(*) INTO target_count FROM public.validation_rule_targets WHERE rule_id = rule;
  ASSERT target_count = 1, '잘못된 target_id로 실패해도 기존 대상이 사라지면 안 됨';

  -- p_targets가 빈 배열이면 기존 대상을 전부 지워야 한다 (scope를 project로 되돌릴 때의 경로).
  PERFORM public.replace_validation_rule_targets(rule, '[]'::jsonb);
  SELECT count(*) INTO target_count FROM public.validation_rule_targets WHERE rule_id = rule;
  ASSERT target_count = 0, '빈 배열로 호출하면 기존 대상을 전부 지워야 함';

  -- RLS 거부 테스트를 위해 편집 권한이 없는(can_edit_ws가 허용하지 않는 'viewer') 멤버를 준비한다.
  INSERT INTO public.profiles(id, display_name) VALUES (viewer, '뷰어 테스트');
  INSERT INTO public.workspace_members(workspace_id, user_id, role) VALUES (ws, viewer, 'viewer') ON CONFLICT DO NOTHING;
  PERFORM set_config('test.rule', rule::text, true);
  PERFORM set_config('test.event', event::text, true);
  PERFORM set_config('test.viewer', viewer::text, true);
  PERFORM set_config('test.actor', actor::text, true);
END;
$$;

-- 편집 권한이 없는 'viewer' 사용자로 전환해 RLS가 실제로 호출을 막는지 확인한다.
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  target_count int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', current_setting('test.viewer'), true);
  BEGIN
    PERFORM public.replace_validation_rule_targets(current_setting('test.rule')::uuid,
      jsonb_build_array(jsonb_build_object('target_type', 'event', 'target_id', current_setting('test.event'))));
    RAISE EXCEPTION '편집 권한이 없는 사용자의 호출이 성공해서는 안 됨';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- 예상된 실패 (vrt_insert 정책의 WITH CHECK 위반)
  END;
  SELECT count(*) INTO target_count FROM public.validation_rule_targets
    WHERE rule_id = current_setting('test.rule')::uuid;
  ASSERT target_count = 0, '권한 없는 호출은 기존 대상(빈 배열로 지워진 상태)에 영향을 주면 안 됨';

  -- 이후 검증이 있을 경우를 대비해 JWT claim을 원래 액터로 되돌려 둔다.
  PERFORM set_config('request.jwt.claim.sub', current_setting('test.actor'), true);
END;
$$;
ROLLBACK;
