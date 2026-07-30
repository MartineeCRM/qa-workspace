ALTER TABLE public.qa_stages RENAME TO qa_environments;

ALTER INDEX public.qa_stages_pkey RENAME TO qa_environments_pkey;
ALTER INDEX public.qa_stages_slug_uq RENAME TO qa_environments_slug_uq;

ALTER TABLE public.qa_uploads RENAME COLUMN stage_id TO qa_environment_id;
ALTER TABLE public.qa_analysis_runs RENAME COLUMN stage_id TO qa_environment_id;
ALTER TABLE public.qa_item_status RENAME COLUMN stage_id TO qa_environment_id;

DROP POLICY qs_select ON public.qa_environments;
DROP POLICY qs_insert ON public.qa_environments;
DROP POLICY qs_update ON public.qa_environments;
DROP POLICY qs_delete ON public.qa_environments;
CREATE POLICY qe_select ON public.qa_environments FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project(project_id)));
CREATE POLICY qe_insert ON public.qa_environments FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)));
CREATE POLICY qe_update ON public.qa_environments FOR UPDATE TO authenticated USING (public.can_edit_ws(public.ws_of_project(project_id))) WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)));
CREATE POLICY qe_delete ON public.qa_environments FOR DELETE TO authenticated USING (public.can_admin_ws(public.ws_of_project(project_id)));

CREATE OR REPLACE FUNCTION public.tg_default_qa_stages()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.qa_environments (project_id, slug, name, description, sort_order) VALUES
    (NEW.id, 'dev', '개발 QA', '개발 환경에서 수집되는 로그를 검증해요.', 1),
    (NEW.id, 'prod', '운영 QA', '실제 운영 트래픽 기준으로 검증해요.', 2)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $function$;
