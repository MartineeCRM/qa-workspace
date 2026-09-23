ALTER TABLE public.taxonomy_events
  ADD COLUMN trigger_screenshots jsonb NOT NULL DEFAULT '[]'::jsonb;
-- Storage 오브젝트 경로 문자열의 배열. 표시 순서 = 배열 순서(업로드 순).

-- SECURITY INVOKER(기본값)라 내부 UPDATE는 호출자의 RLS(te_update — can_edit_ws)를 그대로 통과한다.
CREATE OR REPLACE FUNCTION public.append_taxonomy_event_screenshot(
  p_event_id uuid, p_path text
) RETURNS jsonb
LANGUAGE sql SET search_path = public AS $$
  UPDATE public.taxonomy_events
  SET trigger_screenshots = trigger_screenshots || to_jsonb(p_path)
  WHERE id = p_event_id
  RETURNING trigger_screenshots;
$$;
GRANT EXECUTE ON FUNCTION public.append_taxonomy_event_screenshot(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_taxonomy_event_screenshot(
  p_event_id uuid, p_path text
) RETURNS jsonb
LANGUAGE sql SET search_path = public AS $$
  UPDATE public.taxonomy_events
  SET trigger_screenshots = (
    SELECT coalesce(jsonb_agg(elem), '[]'::jsonb)
    FROM jsonb_array_elements_text(trigger_screenshots) AS elem
    WHERE elem <> p_path
  )
  WHERE id = p_event_id
  RETURNING trigger_screenshots;
$$;
GRANT EXECUTE ON FUNCTION public.remove_taxonomy_event_screenshot(uuid, text) TO authenticated;
