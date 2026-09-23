-- 권한 경계는 프로젝트가 아니라 워크스페이스 단위임을 확인한다:
--   - 같은 워크스페이스의 다른 프로젝트 멤버는 읽을 수 있지만, 다른 워크스페이스 사람은 못 읽는다.
--   - 읽기(is_ws_member)와 쓰기(can_edit_ws)는 서로 다른 권한 함수라서, 워크스페이스 멤버라도
--     'viewer' 역할은 읽을 수는 있지만 INSERT/DELETE는 막혀야 한다.
--
-- 이 스크립트를 실행하는 연결 롤(postgres)은 RLS를 우회하므로, 앞부분의 픽스처 준비는
-- 그 상태로 하고, 정책이 실제로 적용되는지 확인하는 부분은 Task 1/5와 동일한 관례대로
-- `SET LOCAL ROLE authenticated;`로 전환한 뒤 request.jwt.claim.sub만 바꿔가며 검증한다.
-- (SET LOCAL ROLE 없이 request.jwt.claim.sub만 바꿔서 SELECT하면, 우회 롤 그대로라 정책이
-- 전혀 걸리지 않고 항상 보이므로 의미 있는 검증이 되지 않는다.)
BEGIN;
DO $$
DECLARE
  member_a uuid := gen_random_uuid();  -- ws1의 owner. project1, project2 둘 다 접근 가능해야 함
  viewer uuid := gen_random_uuid();    -- ws1의 'viewer'. 읽기는 되지만 쓰기는 안 돼야 함
  outsider uuid := gen_random_uuid();  -- 완전히 다른 워크스페이스(ws2)
  ws1 uuid;
  ws2 uuid;
  project1 uuid;
  project2 uuid;
  path1 text;
BEGIN
  INSERT INTO public.profiles(id, display_name) VALUES
    (member_a, 'A'), (viewer, 'Viewer'), (outsider, 'Outsider');
  INSERT INTO public.workspaces(name, created_by) VALUES ('WS1', member_a) RETURNING id INTO ws1;
  INSERT INTO public.workspaces(name, created_by) VALUES ('WS2', outsider) RETURNING id INTO ws2;
  INSERT INTO public.workspace_members(workspace_id, user_id, role) VALUES (ws1, member_a, 'owner') ON CONFLICT DO NOTHING;
  INSERT INTO public.workspace_members(workspace_id, user_id, role) VALUES (ws1, viewer, 'viewer') ON CONFLICT DO NOTHING;
  INSERT INTO public.workspace_members(workspace_id, user_id, role) VALUES (ws2, outsider, 'owner') ON CONFLICT DO NOTHING;
  INSERT INTO public.projects(workspace_id, name, project_key, created_by)
    VALUES (ws1, 'P1', 'p1', member_a) RETURNING id INTO project1;
  INSERT INTO public.projects(workspace_id, name, project_key, created_by)
    VALUES (ws1, 'P2', 'p2', member_a) RETURNING id INTO project2;
  path1 := project1::text || '/some-event-id/photo.png';

  PERFORM set_config('request.jwt.claim.sub', member_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('taxonomy-event-images', path1, member_a);

  PERFORM set_config('test.project1', project1::text, true);
  PERFORM set_config('test.project2', project2::text, true);
  PERFORM set_config('test.path1', path1, true);
  PERFORM set_config('test.member_a', member_a::text, true);
  PERFORM set_config('test.viewer', viewer::text, true);
  PERFORM set_config('test.outsider', outsider::text, true);
END;
$$;

-- 이제부터는 실제로 RLS가 적용되는 authenticated 롤로 전환해서 검증한다.
SET LOCAL ROLE authenticated;

-- member_a: 자기 프로젝트(project1) 이미지를 볼 수 있고, 같은 워크스페이스의 다른
-- 프로젝트(project2) 아래 새로 올린 이미지도 볼 수 있고 만들 수 있어야 한다(워크스페이스 단위 경계).
DO $$
DECLARE
  path2 text;
  can_select_own boolean;
  can_select_sibling_project boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', current_setting('test.member_a'), true);

  SELECT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'taxonomy-event-images' AND name = current_setting('test.path1')
  ) INTO can_select_own;
  ASSERT can_select_own, '자기 프로젝트 이미지는 보여야 함';

  path2 := current_setting('test.project2') || '/other-event-id/photo2.png';
  INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('taxonomy-event-images', path2, current_setting('test.member_a')::uuid);

  SELECT EXISTS (
    SELECT 1 FROM storage.objects WHERE bucket_id = 'taxonomy-event-images' AND name = path2
  ) INTO can_select_sibling_project;
  ASSERT can_select_sibling_project,
    '같은 워크스페이스의 다른 프로젝트(project2) 이미지도 보이고 만들 수 있어야 함';
END;
$$;

-- outsider(완전히 다른 워크스페이스 ws2 소속): project1 이미지를 볼 수 없어야 한다.
DO $$
DECLARE
  can_select_other_ws boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', current_setting('test.outsider'), true);
  SELECT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'taxonomy-event-images' AND name = current_setting('test.path1')
  ) INTO can_select_other_ws;
  ASSERT NOT can_select_other_ws, '다른 워크스페이스 사람은 못 봐야 함';
END;
$$;

-- viewer(ws1 소속, 'viewer' 역할): is_ws_member는 통과하므로 읽기는 되지만,
-- can_edit_ws는 통과하지 못하므로 쓰기(INSERT/DELETE)는 막혀야 한다.
DO $$
DECLARE
  can_select_as_viewer boolean;
  deleted_count int;
  still_exists boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', current_setting('test.viewer'), true);

  SELECT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'taxonomy-event-images' AND name = current_setting('test.path1')
  ) INTO can_select_as_viewer;
  ASSERT can_select_as_viewer, 'viewer도 같은 워크스페이스면 읽을 수 있어야 함(is_ws_member)';

  -- INSERT: WITH CHECK 위반은 (UPDATE의 USING 필터와 달리) 항상 insufficient_privilege
  -- 예외를 던진다 — 이 지점은 Task 1의 vrt_insert 테스트와 같은 INSERT 케이스라 동일한
  -- 예외-포착 패턴이 맞다(Task 5의 UPDATE·NULL-반환 패턴이 아니다).
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner)
      VALUES ('taxonomy-event-images',
        current_setting('test.project1') || '/some-event-id/viewer-upload.png',
        current_setting('test.viewer')::uuid);
    RAISE EXCEPTION '편집 권한이 없는 viewer의 INSERT가 성공해서는 안 됨';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- 예상된 실패 (taxonomy_event_images_insert 정책의 WITH CHECK 위반)
  END;

  -- DELETE: 정책에는 WITH CHECK가 없고 USING만 있다. UPDATE의 USING과 마찬가지로,
  -- USING이 거짓인 행은 "삭제 대상 후보"에서 조용히 걸러질 뿐이라 예외가 나지 않고
  -- 단지 0행이 삭제된다(INSERT의 WITH CHECK 위반과는 다른 시맨틱).
  DELETE FROM storage.objects
    WHERE bucket_id = 'taxonomy-event-images' AND name = current_setting('test.path1');
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  ASSERT deleted_count = 0, 'viewer의 DELETE는 (예외 없이) 0행에 영향을 줘야 함';

  SELECT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'taxonomy-event-images' AND name = current_setting('test.path1')
  ) INTO still_exists;
  ASSERT still_exists, 'viewer의 DELETE 시도 이후에도 원본 객체는 그대로 남아있어야 함';
END;
$$;
ROLLBACK;
