CREATE OR REPLACE FUNCTION public.tg_default_qa_stages()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.qa_stages (project_id, slug, name, description, sort_order) VALUES
    (NEW.id, 'dev', '개발 QA', '개발 환경에서 수집되는 로그를 검증해요.', 1),
    (NEW.id, 'prod', '운영 QA', '실제 운영 트래픽 기준으로 검증해요.', 2)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $function$;