CREATE OR REPLACE FUNCTION public.project_of_discussion(discussion_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT qr.project_id
  FROM public.qa_discussions qd
  JOIN public.qa_checklist_item_results qcir ON qcir.id = qd.checklist_item_result_id
  JOIN public.qa_round_checklist_items qrci ON qrci.id = qcir.checklist_item_id
  JOIN public.qa_sessions qs ON qs.id = qrci.qa_session_id
  JOIN public.qa_rounds qr ON qr.id = qs.qa_round_id
  WHERE qd.id = discussion_id
$$;

CREATE OR REPLACE FUNCTION public.is_project_member(input_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_members
    WHERE project_members.project_id = input_project_id
      AND project_members.user_id = auth.uid()
  )
$$;

GRANT EXECUTE ON FUNCTION public.project_of_discussion(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_member(uuid) TO authenticated;

CREATE POLICY qd_project_member_select ON public.qa_discussions
FOR SELECT TO authenticated
USING (public.is_project_member(public.project_of_discussion(id)));

CREATE POLICY qdc_project_member_select ON public.qa_discussion_comments
FOR SELECT TO authenticated
USING (public.is_project_member(public.project_of_discussion(discussion_id)));

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.qa_discussions;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.qa_discussion_comments;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END
$$;
