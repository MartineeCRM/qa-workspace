CREATE POLICY qd_delete ON public.qa_discussions
FOR DELETE TO authenticated USING (
  public.can_edit_ws(public.ws_of_project((
    SELECT qr.project_id
    FROM public.qa_checklist_item_results qcir
    JOIN public.qa_round_checklist_items qrci ON qrci.id = qcir.checklist_item_id
    JOIN public.qa_sessions qs ON qs.id = qrci.qa_session_id
    JOIN public.qa_rounds qr ON qr.id = qs.qa_round_id
    WHERE qcir.id = checklist_item_result_id
  )))
);
