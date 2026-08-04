GRANT UPDATE ON public.qa_discussion_comments TO authenticated;

CREATE POLICY qdc_update ON public.qa_discussion_comments
FOR UPDATE TO authenticated
USING (
  author_id = auth.uid()
  AND public.can_edit_ws(public.ws_of_project((
    SELECT qr.project_id
    FROM public.qa_discussions qd
    JOIN public.qa_checklist_item_results qcir ON qcir.id = qd.checklist_item_result_id
    JOIN public.qa_round_checklist_items qrci ON qrci.id = qcir.checklist_item_id
    JOIN public.qa_sessions qs ON qs.id = qrci.qa_session_id
    JOIN public.qa_rounds qr ON qr.id = qs.qa_round_id
    WHERE qd.id = discussion_id
  )))
)
WITH CHECK (
  author_id = auth.uid()
  AND public.can_edit_ws(public.ws_of_project((
    SELECT qr.project_id
    FROM public.qa_discussions qd
    JOIN public.qa_checklist_item_results qcir ON qcir.id = qd.checklist_item_result_id
    JOIN public.qa_round_checklist_items qrci ON qrci.id = qcir.checklist_item_id
    JOIN public.qa_sessions qs ON qs.id = qrci.qa_session_id
    JOIN public.qa_rounds qr ON qr.id = qs.qa_round_id
    WHERE qd.id = discussion_id
  )))
);
