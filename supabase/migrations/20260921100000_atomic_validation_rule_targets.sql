-- 규칙의 적용 대상을 삭제+삽입 두 요청이 아니라 한 트랜잭션으로 교체한다.
-- SECURITY INVOKER(기본값)라 호출자의 RLS(vrt_select/insert/delete)가 그대로 적용된다.
CREATE OR REPLACE FUNCTION public.replace_validation_rule_targets(
  p_rule_id uuid,
  p_targets jsonb -- [{"target_type": "event"|"property"|"custom_attribute", "target_id": "uuid"}]
) RETURNS void
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  DELETE FROM public.validation_rule_targets WHERE rule_id = p_rule_id;
  INSERT INTO public.validation_rule_targets (rule_id, target_type, target_id)
  SELECT p_rule_id, elem->>'target_type', (elem->>'target_id')::uuid
  FROM jsonb_array_elements(p_targets) AS elem;
END;
$$;
GRANT EXECUTE ON FUNCTION public.replace_validation_rule_targets(uuid, jsonb) TO authenticated;
