CREATE TABLE public.qa_round_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qa_round_id uuid NOT NULL REFERENCES public.qa_rounds(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('event','custom_attribute')),
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX qa_round_checklist_items_uq ON public.qa_round_checklist_items (qa_round_id, target_type, target_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_round_checklist_items TO authenticated;
GRANT ALL ON public.qa_round_checklist_items TO service_role;
ALTER TABLE public.qa_round_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY qrci_select ON public.qa_round_checklist_items FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = qa_round_id))));
CREATE POLICY qrci_insert ON public.qa_round_checklist_items FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = qa_round_id))));
CREATE POLICY qrci_delete ON public.qa_round_checklist_items FOR DELETE TO authenticated USING (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = qa_round_id))));

CREATE TABLE public.qa_checklist_item_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_item_id uuid NOT NULL REFERENCES public.qa_round_checklist_items(id) ON DELETE CASCADE,
  ai_verdict text CHECK (ai_verdict IN ('passed','failed','not_collected')),
  ai_reasoning text,
  ai_evidence jsonb,
  failed_layer text CHECK (failed_layer IN ('existence','structural','qualitative')),
  final_status text NOT NULL DEFAULT 'not_collected' CHECK (final_status IN ('passed','failed','not_collected')),
  overridden_by uuid,
  overridden_at timestamptz,
  override_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX qa_checklist_item_results_item_uq ON public.qa_checklist_item_results (checklist_item_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_checklist_item_results TO authenticated;
GRANT ALL ON public.qa_checklist_item_results TO service_role;
ALTER TABLE public.qa_checklist_item_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY qcir_select ON public.qa_checklist_item_results FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = (SELECT qa_round_id FROM public.qa_round_checklist_items WHERE id = checklist_item_id)))));
CREATE POLICY qcir_insert ON public.qa_checklist_item_results FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = (SELECT qa_round_id FROM public.qa_round_checklist_items WHERE id = checklist_item_id)))));
CREATE POLICY qcir_update ON public.qa_checklist_item_results FOR UPDATE TO authenticated USING (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = (SELECT qa_round_id FROM public.qa_round_checklist_items WHERE id = checklist_item_id))))) WITH CHECK (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = (SELECT qa_round_id FROM public.qa_round_checklist_items WHERE id = checklist_item_id)))));
CREATE TRIGGER trg_qcir_updated BEFORE UPDATE ON public.qa_checklist_item_results FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.qa_discussions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_item_result_id uuid NOT NULL REFERENCES public.qa_checklist_item_results(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_discussions TO authenticated;
GRANT ALL ON public.qa_discussions TO service_role;
ALTER TABLE public.qa_discussions ENABLE ROW LEVEL SECURITY;
CREATE POLICY qd_select ON public.qa_discussions FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = (SELECT qa_round_id FROM public.qa_round_checklist_items WHERE id = (SELECT checklist_item_id FROM public.qa_checklist_item_results WHERE id = checklist_item_result_id))))));
CREATE POLICY qd_insert ON public.qa_discussions FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = (SELECT qa_round_id FROM public.qa_round_checklist_items WHERE id = (SELECT checklist_item_id FROM public.qa_checklist_item_results WHERE id = checklist_item_result_id))))) AND created_by = auth.uid());
CREATE POLICY qd_update ON public.qa_discussions FOR UPDATE TO authenticated USING (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = (SELECT qa_round_id FROM public.qa_round_checklist_items WHERE id = (SELECT checklist_item_id FROM public.qa_checklist_item_results WHERE id = checklist_item_result_id)))))) WITH CHECK (true);

CREATE TABLE public.qa_discussion_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discussion_id uuid NOT NULL REFERENCES public.qa_discussions(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  body text NOT NULL CHECK (length(btrim(body)) > 0),
  is_resolution boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.qa_discussion_comments TO authenticated;
GRANT ALL ON public.qa_discussion_comments TO service_role;
ALTER TABLE public.qa_discussion_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY qdc_select ON public.qa_discussion_comments FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = (SELECT qa_round_id FROM public.qa_round_checklist_items WHERE id = (SELECT checklist_item_id FROM public.qa_checklist_item_results WHERE id = (SELECT checklist_item_result_id FROM public.qa_discussions WHERE id = discussion_id)))))));
CREATE POLICY qdc_insert ON public.qa_discussion_comments FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());

CREATE OR REPLACE FUNCTION public.tg_resolve_discussion_on_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_resolution THEN
    UPDATE public.qa_discussions SET status = 'resolved' WHERE id = NEW.discussion_id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_resolve_discussion AFTER INSERT ON public.qa_discussion_comments
FOR EACH ROW EXECUTE FUNCTION public.tg_resolve_discussion_on_comment();
