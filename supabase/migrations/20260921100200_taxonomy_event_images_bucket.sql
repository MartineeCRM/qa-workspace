INSERT INTO storage.buckets (id, name, public)
VALUES ('taxonomy-event-images', 'taxonomy-event-images', false)
ON CONFLICT (id) DO NOTHING;

-- 경로: {project_id}/{event_id}/{uuid}-{filename}
-- storage.foldername(name)는 경로를 '/'로 쪼갠 배열을 반환하므로 [1]이 project_id.
-- 권한 경계는 프로젝트가 아니라 워크스페이스 단위다: 같은 워크스페이스의 다른 프로젝트
-- 이미지도 멤버라면 볼 수 있고(is_ws_member), 편집 권한이 있는 멤버만 쓸 수 있다(can_edit_ws).
CREATE POLICY taxonomy_event_images_select ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'taxonomy-event-images'
  AND public.is_ws_member(public.ws_of_project(((storage.foldername(name))[1])::uuid))
);
CREATE POLICY taxonomy_event_images_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'taxonomy-event-images'
  AND public.can_edit_ws(public.ws_of_project(((storage.foldername(name))[1])::uuid))
);
CREATE POLICY taxonomy_event_images_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'taxonomy-event-images'
  AND public.can_edit_ws(public.ws_of_project(((storage.foldername(name))[1])::uuid))
);
