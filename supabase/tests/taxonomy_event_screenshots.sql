-- 두 번의 append가 서로를 덮어쓰지 않고 둘 다 남는지, remove가 지정한 경로만 지우는지,
-- 그리고 편집 권한이 없는 사용자는 RLS(te_update)에 막히는지 확인한다.
BEGIN;
DO $$
DECLARE
  actor uuid := gen_random_uuid();
  viewer uuid := gen_random_uuid();
  ws uuid;
  project uuid;
  event uuid;
  shots jsonb;
BEGIN
  INSERT INTO public.profiles(id, display_name) VALUES (actor, '이미지 테스트');
  PERFORM set_config('request.jwt.claim.sub', actor::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  INSERT INTO public.workspaces(name, created_by) VALUES ('Screenshot test', actor) RETURNING id INTO ws;
  INSERT INTO public.workspace_members(workspace_id, user_id, role) VALUES (ws, actor, 'owner') ON CONFLICT DO NOTHING;
  INSERT INTO public.projects(workspace_id, name, project_key, created_by)
    VALUES (ws, 'Screenshot test', actor::text, actor) RETURNING id INTO project;
  INSERT INTO public.taxonomy_events(project_id, technical_name, created_by)
    VALUES (project, 'purchase', actor) RETURNING id INTO event;

  ASSERT (SELECT trigger_screenshots FROM public.taxonomy_events WHERE id = event) = '[]'::jsonb,
    '기본값은 빈 배열이어야 함';

  -- "동시에" 두 이미지가 추가되는 상황을 순차 호출 두 번으로 흉내낸다.
  -- read-modify-write였다면 두 번째 호출이 첫 번째를 덮어썼을 것이다.
  PERFORM public.append_taxonomy_event_screenshot(event, 'a.png');
  PERFORM public.append_taxonomy_event_screenshot(event, 'b.png');
  SELECT trigger_screenshots INTO shots FROM public.taxonomy_events WHERE id = event;
  ASSERT shots = '["a.png", "b.png"]'::jsonb, '두 번의 append가 둘 다 남아야 함, got: ' || shots::text;

  PERFORM public.remove_taxonomy_event_screenshot(event, 'a.png');
  SELECT trigger_screenshots INTO shots FROM public.taxonomy_events WHERE id = event;
  ASSERT shots = '["b.png"]'::jsonb, 'remove는 지정한 경로만 지워야 함, got: ' || shots::text;

  -- 순서 보장 확인: 가운데 원소를 지워도 남은 원소들의 업로드 순서가 유지되는지.
  -- (ORDER BY 없이 jsonb_agg만 썼다면 우연히 순서가 맞을 뿐이라, 이 케이스가 실제 검증이 됨)
  -- 뒤의 RLS 테스트가 이 event의 최종 상태(["b.png"])에 의존하므로, 별도 이벤트에서 확인한다.
  DECLARE
    order_event uuid;
    order_shots jsonb;
  BEGIN
    INSERT INTO public.taxonomy_events(project_id, technical_name, created_by)
      VALUES (project, 'order_check', actor) RETURNING id INTO order_event;
    PERFORM public.append_taxonomy_event_screenshot(order_event, 'x1.png');
    PERFORM public.append_taxonomy_event_screenshot(order_event, 'x2.png');
    PERFORM public.append_taxonomy_event_screenshot(order_event, 'x3.png');
    PERFORM public.remove_taxonomy_event_screenshot(order_event, 'x2.png');
    SELECT trigger_screenshots INTO order_shots FROM public.taxonomy_events WHERE id = order_event;
    ASSERT order_shots = '["x1.png", "x3.png"]'::jsonb,
      '가운데 원소를 지워도 남은 원소들의 업로드 순서가 유지돼야 함, got: ' || order_shots::text;
  END;

  -- RLS 거부 테스트를 위해 편집 권한이 없는(can_edit_ws가 허용하지 않는 'viewer') 멤버를 준비한다.
  INSERT INTO public.profiles(id, display_name) VALUES (viewer, '뷰어 테스트');
  INSERT INTO public.workspace_members(workspace_id, user_id, role) VALUES (ws, viewer, 'viewer') ON CONFLICT DO NOTHING;
  PERFORM set_config('test.event', event::text, true);
  PERFORM set_config('test.viewer', viewer::text, true);
  PERFORM set_config('test.actor', actor::text, true);
END;
$$;

-- 편집 권한이 없는 'viewer' 사용자로 전환해 RLS가 실제로 두 함수 모두를 막는지 확인한다.
--
-- 주의: te_update 정책은 UPDATE에 USING과 WITH CHECK가 동일한 조건(can_edit_ws)이다.
-- UPDATE에서 USING은 "이 행이 갱신 대상으로 보이는가"를 거르는 필터라서, USING이
-- 거짓이면 그 행은 애초에 갱신 후보에서 조용히 제외될 뿐 에러가 나지 않는다(INSERT의
-- WITH CHECK 위반과 달리 insufficient_privilege가 발생하지 않음 — Task 1의
-- vrt_insert 테스트는 INSERT라 이 필터가 없어서 에러가 났던 것과 다르다). 따라서 여기서는
-- "예외가 난다"가 아니라 "0행이 갱신되어 함수가 NULL을 반환하고 기존 배열이 그대로다"를
-- 확인한다.
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  shots jsonb;
  result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', current_setting('test.viewer'), true);

  SELECT public.append_taxonomy_event_screenshot(current_setting('test.event')::uuid, 'c.png') INTO result;
  ASSERT result IS NULL, '권한 없는 append는 갱신 대상 행이 없어 NULL을 반환해야 함, got: ' || coalesce(result::text, 'NULL');

  SELECT public.remove_taxonomy_event_screenshot(current_setting('test.event')::uuid, 'b.png') INTO result;
  ASSERT result IS NULL, '권한 없는 remove는 갱신 대상 행이 없어 NULL을 반환해야 함, got: ' || coalesce(result::text, 'NULL');

  -- 이후 검증이 있을 경우를 대비해 JWT claim을 원래 액터로 되돌려 둔다.
  PERFORM set_config('request.jwt.claim.sub', current_setting('test.actor'), true);

  SELECT trigger_screenshots INTO shots FROM public.taxonomy_events
    WHERE id = current_setting('test.event')::uuid;
  ASSERT shots = '["b.png"]'::jsonb, '권한 없는 호출은 기존 상태에 영향을 주면 안 됨, got: ' || shots::text;
END;
$$;
ROLLBACK;
