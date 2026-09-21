-- 원자적 교체 함수가 중간 실패 시 기존 대상을 보존하는지 확인한다.
BEGIN;
DO $$
DECLARE
  actor uuid := gen_random_uuid();
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
END;
$$;
ROLLBACK;
