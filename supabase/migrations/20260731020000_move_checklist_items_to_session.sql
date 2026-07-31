-- Checklist items move from round-scoped to session-scoped: a tester now picks
-- verification targets per session ("이번 세션엔 이것만 검증할게"), not once for the whole round.
-- Safe to do as a hard rename: no checklist items or results exist yet in production.

ALTER TABLE public.qa_round_checklist_items DROP CONSTRAINT qa_round_checklist_items_qa_round_id_fkey;
DROP INDEX public.qa_round_checklist_items_uq;

ALTER TABLE public.qa_round_checklist_items RENAME COLUMN qa_round_id TO qa_session_id;
ALTER TABLE public.qa_round_checklist_items
  ADD CONSTRAINT qa_round_checklist_items_qa_session_id_fkey
  FOREIGN KEY (qa_session_id) REFERENCES public.qa_sessions(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX qa_round_checklist_items_uq ON public.qa_round_checklist_items (qa_session_id, target_type, target_id);

DROP POLICY qrci_select ON public.qa_round_checklist_items;
DROP POLICY qrci_insert ON public.qa_round_checklist_items;
DROP POLICY qrci_delete ON public.qa_round_checklist_items;

CREATE POLICY qrci_select ON public.qa_round_checklist_items FOR SELECT TO authenticated USING (
  public.is_ws_member(public.ws_of_project((SELECT qr.project_id FROM public.qa_rounds qr JOIN public.qa_sessions qs ON qs.qa_round_id = qr.id WHERE qs.id = qa_session_id)))
);
CREATE POLICY qrci_insert ON public.qa_round_checklist_items FOR INSERT TO authenticated WITH CHECK (
  public.can_edit_ws(public.ws_of_project((SELECT qr.project_id FROM public.qa_rounds qr JOIN public.qa_sessions qs ON qs.qa_round_id = qr.id WHERE qs.id = qa_session_id)))
);
CREATE POLICY qrci_delete ON public.qa_round_checklist_items FOR DELETE TO authenticated USING (
  public.can_edit_ws(public.ws_of_project((SELECT qr.project_id FROM public.qa_rounds qr JOIN public.qa_sessions qs ON qs.qa_round_id = qr.id WHERE qs.id = qa_session_id)))
);

-- Dependent RLS policies resolved project_id by reading qa_round_checklist_items.qa_round_id directly;
-- rewrite them to go through the new qa_session_id -> qa_sessions -> qa_rounds chain.
DROP POLICY qcir_select ON public.qa_checklist_item_results;
DROP POLICY qcir_insert ON public.qa_checklist_item_results;
DROP POLICY qcir_update ON public.qa_checklist_item_results;

CREATE POLICY qcir_select ON public.qa_checklist_item_results FOR SELECT TO authenticated USING (
  public.is_ws_member(public.ws_of_project((
    SELECT qr.project_id FROM public.qa_rounds qr
    JOIN public.qa_sessions qs ON qs.qa_round_id = qr.id
    JOIN public.qa_round_checklist_items qrci ON qrci.qa_session_id = qs.id
    WHERE qrci.id = checklist_item_id
  )))
);
CREATE POLICY qcir_insert ON public.qa_checklist_item_results FOR INSERT TO authenticated WITH CHECK (
  public.can_edit_ws(public.ws_of_project((
    SELECT qr.project_id FROM public.qa_rounds qr
    JOIN public.qa_sessions qs ON qs.qa_round_id = qr.id
    JOIN public.qa_round_checklist_items qrci ON qrci.qa_session_id = qs.id
    WHERE qrci.id = checklist_item_id
  )))
);
CREATE POLICY qcir_update ON public.qa_checklist_item_results FOR UPDATE TO authenticated USING (
  public.can_edit_ws(public.ws_of_project((
    SELECT qr.project_id FROM public.qa_rounds qr
    JOIN public.qa_sessions qs ON qs.qa_round_id = qr.id
    JOIN public.qa_round_checklist_items qrci ON qrci.qa_session_id = qs.id
    WHERE qrci.id = checklist_item_id
  )))
) WITH CHECK (
  public.can_edit_ws(public.ws_of_project((
    SELECT qr.project_id FROM public.qa_rounds qr
    JOIN public.qa_sessions qs ON qs.qa_round_id = qr.id
    JOIN public.qa_round_checklist_items qrci ON qrci.qa_session_id = qs.id
    WHERE qrci.id = checklist_item_id
  )))
);

DROP POLICY qd_select ON public.qa_discussions;
DROP POLICY qd_insert ON public.qa_discussions;
DROP POLICY qd_update ON public.qa_discussions;

CREATE POLICY qd_select ON public.qa_discussions FOR SELECT TO authenticated USING (
  public.is_ws_member(public.ws_of_project((
    SELECT qr.project_id FROM public.qa_rounds qr
    JOIN public.qa_sessions qs ON qs.qa_round_id = qr.id
    JOIN public.qa_round_checklist_items qrci ON qrci.qa_session_id = qs.id
    JOIN public.qa_checklist_item_results qcir ON qcir.checklist_item_id = qrci.id
    WHERE qcir.id = checklist_item_result_id
  )))
);
CREATE POLICY qd_insert ON public.qa_discussions FOR INSERT TO authenticated WITH CHECK (
  public.can_edit_ws(public.ws_of_project((
    SELECT qr.project_id FROM public.qa_rounds qr
    JOIN public.qa_sessions qs ON qs.qa_round_id = qr.id
    JOIN public.qa_round_checklist_items qrci ON qrci.qa_session_id = qs.id
    JOIN public.qa_checklist_item_results qcir ON qcir.checklist_item_id = qrci.id
    WHERE qcir.id = checklist_item_result_id
  ))) AND created_by = auth.uid()
);
CREATE POLICY qd_update ON public.qa_discussions FOR UPDATE TO authenticated USING (
  public.can_edit_ws(public.ws_of_project((
    SELECT qr.project_id FROM public.qa_rounds qr
    JOIN public.qa_sessions qs ON qs.qa_round_id = qr.id
    JOIN public.qa_round_checklist_items qrci ON qrci.qa_session_id = qs.id
    JOIN public.qa_checklist_item_results qcir ON qcir.checklist_item_id = qrci.id
    WHERE qcir.id = checklist_item_result_id
  )))
) WITH CHECK (true);

DROP POLICY qdc_select ON public.qa_discussion_comments;

CREATE POLICY qdc_select ON public.qa_discussion_comments FOR SELECT TO authenticated USING (
  public.is_ws_member(public.ws_of_project((
    SELECT qr.project_id FROM public.qa_rounds qr
    JOIN public.qa_sessions qs ON qs.qa_round_id = qr.id
    JOIN public.qa_round_checklist_items qrci ON qrci.qa_session_id = qs.id
    JOIN public.qa_checklist_item_results qcir ON qcir.checklist_item_id = qrci.id
    JOIN public.qa_discussions qd ON qd.checklist_item_result_id = qcir.id
    WHERE qd.id = discussion_id
  )))
);
