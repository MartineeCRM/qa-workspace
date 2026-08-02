ALTER TABLE public.qa_round_checklist_items
  ADD COLUMN disposition text NOT NULL DEFAULT 'unresolved'
    CHECK (disposition IN ('unresolved', 'passed_override', 'carried_over', 'discussing')),
  ADD COLUMN carried_from_item_id uuid REFERENCES public.qa_round_checklist_items(id) ON DELETE SET NULL,
  ADD COLUMN assigned_to uuid,
  ADD COLUMN disposed_by uuid,
  ADD COLUMN disposed_at timestamptz;

CREATE INDEX qa_round_checklist_items_carried_from_idx
  ON public.qa_round_checklist_items (carried_from_item_id)
  WHERE carried_from_item_id IS NOT NULL;

-- 처리(disposition) 변경은 UPDATE가 필요한데, 기존엔 SELECT/INSERT/DELETE 정책만 있었다.
CREATE POLICY qrci_update ON public.qa_round_checklist_items FOR UPDATE TO authenticated USING (
  public.can_edit_ws(public.ws_of_project((
    SELECT qr.project_id FROM public.qa_rounds qr
    JOIN public.qa_sessions qs ON qs.qa_round_id = qr.id
    WHERE qs.id = qa_session_id
  )))
) WITH CHECK (
  public.can_edit_ws(public.ws_of_project((
    SELECT qr.project_id FROM public.qa_rounds qr
    JOIN public.qa_sessions qs ON qs.qa_round_id = qr.id
    WHERE qs.id = qa_session_id
  )))
);

-- 논의는 항목당 하나의 스레드만 갖는다(설계상 flat comment list).
ALTER TABLE public.qa_discussions
  ADD CONSTRAINT qa_discussions_result_uq UNIQUE (checklist_item_result_id);
