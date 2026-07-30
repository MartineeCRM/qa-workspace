-- Drop old contract/round model
DROP TABLE IF EXISTS public.validation_rules CASCADE;
DROP TABLE IF EXISTS public.tracking_definitions CASCADE;
DROP TABLE IF EXISTS public.qa_rounds CASCADE;
DROP TABLE IF EXISTS public.contract_versions CASCADE;
DROP TABLE IF EXISTS public.tracking_contracts CASCADE;

DROP FUNCTION IF EXISTS public.publish_contract_version(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.deprecate_contract_version(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.duplicate_contract_version(uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.version_status(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.ws_of_version(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.ws_of_contract(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.project_of_contract(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.tg_version_immutable() CASCADE;
DROP FUNCTION IF EXISTS public.tg_require_draft_version() CASCADE;
DROP FUNCTION IF EXISTS public.tg_version_delete_guard() CASCADE;
DROP FUNCTION IF EXISTS public.tg_def_integrity() CASCADE;
DROP FUNCTION IF EXISTS public.tg_round_integrity() CASCADE;
DROP FUNCTION IF EXISTS public.tg_contract_parent_active() CASCADE;
DROP FUNCTION IF EXISTS public.tg_log_activity() CASCADE;

-- ============ Taxonomy: events ============
CREATE TABLE public.taxonomy_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  technical_name text NOT NULL,
  display_name text,
  description text,
  trigger_description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX taxonomy_events_name_uq ON public.taxonomy_events (project_id, technical_name);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.taxonomy_events TO authenticated;
GRANT ALL ON public.taxonomy_events TO service_role;
ALTER TABLE public.taxonomy_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY te_select ON public.taxonomy_events FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project(project_id)));
CREATE POLICY te_insert ON public.taxonomy_events FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)) AND created_by = auth.uid());
CREATE POLICY te_update ON public.taxonomy_events FOR UPDATE TO authenticated USING (public.can_edit_ws(public.ws_of_project(project_id))) WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)));
CREATE POLICY te_delete ON public.taxonomy_events FOR DELETE TO authenticated USING (public.can_edit_ws(public.ws_of_project(project_id)));

-- ============ Taxonomy: attributes ============
CREATE TABLE public.taxonomy_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.taxonomy_events(id) ON DELETE CASCADE,
  technical_name text NOT NULL,
  display_name text,
  description text,
  data_type text NOT NULL DEFAULT 'string',
  is_required boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  example_value jsonb,
  allowed_values jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX taxonomy_attributes_event_name_uq ON public.taxonomy_attributes (event_id, technical_name) WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX taxonomy_attributes_user_name_uq ON public.taxonomy_attributes (project_id, technical_name) WHERE event_id IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.taxonomy_attributes TO authenticated;
GRANT ALL ON public.taxonomy_attributes TO service_role;
ALTER TABLE public.taxonomy_attributes ENABLE ROW LEVEL SECURITY;
CREATE POLICY ta_select ON public.taxonomy_attributes FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project(project_id)));
CREATE POLICY ta_insert ON public.taxonomy_attributes FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)) AND created_by = auth.uid());
CREATE POLICY ta_update ON public.taxonomy_attributes FOR UPDATE TO authenticated USING (public.can_edit_ws(public.ws_of_project(project_id))) WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)));
CREATE POLICY ta_delete ON public.taxonomy_attributes FOR DELETE TO authenticated USING (public.can_edit_ws(public.ws_of_project(project_id)));

CREATE OR REPLACE FUNCTION public.tg_attribute_project_match()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE p uuid;
BEGIN
  IF NEW.event_id IS NOT NULL THEN
    SELECT project_id INTO p FROM public.taxonomy_events WHERE id = NEW.event_id;
    IF p IS DISTINCT FROM NEW.project_id THEN
      RAISE EXCEPTION 'Attribute must belong to the same project as its event';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER taxonomy_attributes_project_match BEFORE INSERT OR UPDATE ON public.taxonomy_attributes
FOR EACH ROW EXECUTE FUNCTION public.tg_attribute_project_match();

-- ============ Validation rules (taxonomy-owned) ============
CREATE TABLE public.validation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.taxonomy_events(id) ON DELETE CASCADE,
  attribute_id uuid REFERENCES public.taxonomy_attributes(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  rule_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  pass_condition_type text NOT NULL DEFAULT 'all_records',
  minimum_pass_rate numeric,
  maximum_failure_count integer,
  rule_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_enabled boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.validation_rules TO authenticated;
GRANT ALL ON public.validation_rules TO service_role;
ALTER TABLE public.validation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY vr_select ON public.validation_rules FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project(project_id)));
CREATE POLICY vr_insert ON public.validation_rules FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)) AND created_by = auth.uid());
CREATE POLICY vr_update ON public.validation_rules FOR UPDATE TO authenticated USING (public.can_edit_ws(public.ws_of_project(project_id))) WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)));
CREATE POLICY vr_delete ON public.validation_rules FOR DELETE TO authenticated USING (public.can_edit_ws(public.ws_of_project(project_id)));

-- ============ QA stages ============
CREATE TABLE public.qa_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX qa_stages_slug_uq ON public.qa_stages (project_id, slug);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_stages TO authenticated;
GRANT ALL ON public.qa_stages TO service_role;
ALTER TABLE public.qa_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY qs_select ON public.qa_stages FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project(project_id)));
CREATE POLICY qs_insert ON public.qa_stages FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)));
CREATE POLICY qs_update ON public.qa_stages FOR UPDATE TO authenticated USING (public.can_edit_ws(public.ws_of_project(project_id))) WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)));
CREATE POLICY qs_delete ON public.qa_stages FOR DELETE TO authenticated USING (public.can_admin_ws(public.ws_of_project(project_id)));

-- ============ CSV uploads ============
CREATE TABLE public.qa_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.qa_stages(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  row_count integer NOT NULL DEFAULT 0,
  notes text,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_uploads TO authenticated;
GRANT ALL ON public.qa_uploads TO service_role;
ALTER TABLE public.qa_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY qu_select ON public.qa_uploads FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project(project_id)));
CREATE POLICY qu_insert ON public.qa_uploads FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)) AND uploaded_by = auth.uid());
CREATE POLICY qu_update ON public.qa_uploads FOR UPDATE TO authenticated USING (public.can_edit_ws(public.ws_of_project(project_id))) WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)));
CREATE POLICY qu_delete ON public.qa_uploads FOR DELETE TO authenticated USING (public.can_edit_ws(public.ws_of_project(project_id)));

-- ============ Analysis runs ============
CREATE TABLE public.qa_analysis_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.qa_stages(id) ON DELETE CASCADE,
  upload_id uuid REFERENCES public.qa_uploads(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'completed',
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_analysis_runs TO authenticated;
GRANT ALL ON public.qa_analysis_runs TO service_role;
ALTER TABLE public.qa_analysis_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY qar_select ON public.qa_analysis_runs FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project(project_id)));
CREATE POLICY qar_insert ON public.qa_analysis_runs FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)) AND created_by = auth.uid());
CREATE POLICY qar_update ON public.qa_analysis_runs FOR UPDATE TO authenticated USING (public.can_edit_ws(public.ws_of_project(project_id))) WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)));
CREATE POLICY qar_delete ON public.qa_analysis_runs FOR DELETE TO authenticated USING (public.can_edit_ws(public.ws_of_project(project_id)));

-- ============ Per-item validation status ============
CREATE TABLE public.qa_item_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.qa_stages(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.taxonomy_events(id) ON DELETE CASCADE,
  attribute_id uuid REFERENCES public.taxonomy_attributes(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_started',
  notes text,
  last_run_id uuid REFERENCES public.qa_analysis_runs(id) ON DELETE SET NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qa_item_status_target_chk CHECK (num_nonnulls(event_id, attribute_id) = 1),
  CONSTRAINT qa_item_status_status_chk CHECK (status IN ('not_started','verified','failed','blocked'))
);
CREATE UNIQUE INDEX qa_item_status_event_uq ON public.qa_item_status (stage_id, event_id) WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX qa_item_status_attr_uq ON public.qa_item_status (stage_id, attribute_id) WHERE attribute_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_item_status TO authenticated;
GRANT ALL ON public.qa_item_status TO service_role;
ALTER TABLE public.qa_item_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY qis_select ON public.qa_item_status FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project(project_id)));
CREATE POLICY qis_insert ON public.qa_item_status FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)));
CREATE POLICY qis_update ON public.qa_item_status FOR UPDATE TO authenticated USING (public.can_edit_ws(public.ws_of_project(project_id))) WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)));
CREATE POLICY qis_delete ON public.qa_item_status FOR DELETE TO authenticated USING (public.can_edit_ws(public.ws_of_project(project_id)));

-- ============ updated_at triggers ============
CREATE TRIGGER set_updated_at_te BEFORE UPDATE ON public.taxonomy_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_ta BEFORE UPDATE ON public.taxonomy_attributes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_vr BEFORE UPDATE ON public.validation_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_qs BEFORE UPDATE ON public.qa_stages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_qis BEFORE UPDATE ON public.qa_item_status FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ Default QA stages per project ============
CREATE OR REPLACE FUNCTION public.tg_default_qa_stages()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.qa_stages (project_id, slug, name, description, sort_order) VALUES
    (NEW.id, 'stage', 'Stage QA', 'Validation on the staging environment.', 1),
    (NEW.id, 'verification', 'Verification QA', 'Pre-release verification pass.', 2),
    (NEW.id, 'production', 'Production QA', 'Validation against live production traffic.', 3)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER projects_default_stages AFTER INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION public.tg_default_qa_stages();

INSERT INTO public.qa_stages (project_id, slug, name, description, sort_order)
SELECT p.id, s.slug, s.name, s.description, s.sort_order
FROM public.projects p
CROSS JOIN (VALUES
  ('stage','Stage QA','Validation on the staging environment.',1),
  ('verification','Verification QA','Pre-release verification pass.',2),
  ('production','Production QA','Validation against live production traffic.',3)
) AS s(slug, name, description, sort_order)
ON CONFLICT DO NOTHING;

-- ============ Activity logging ============
CREATE OR REPLACE FUNCTION public.tg_log_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ws uuid; _proj uuid; _action text; _name text; _id uuid;
BEGIN
  _action := lower(TG_OP);
  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - 'updated_at') = (to_jsonb(OLD) - 'updated_at') THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'workspaces' THEN
    _ws := NEW.id; _id := NEW.id; _name := NEW.name;
  ELSIF TG_TABLE_NAME = 'projects' THEN
    _ws := NEW.workspace_id; _proj := NEW.id; _id := NEW.id; _name := NEW.name;
  ELSE
    _ws := public.ws_of_project(NEW.project_id); _proj := NEW.project_id; _id := NEW.id;
    _name := CASE TG_TABLE_NAME
      WHEN 'taxonomy_events' THEN NEW.technical_name
      WHEN 'taxonomy_attributes' THEN NEW.technical_name
      ELSE NEW.name END;
  END IF;
  IF _ws IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.activity_logs (workspace_id, project_id, actor_user_id, entity_type, entity_id, action_type, summary)
  VALUES (_ws, _proj, auth.uid(), TG_TABLE_NAME, _id, _action,
          initcap(replace(TG_TABLE_NAME,'_',' ')) || ' "' || COALESCE(_name,'') || '" ' || _action);
  RETURN NEW;
END; $$;

CREATE TRIGGER log_activity_workspaces AFTER INSERT OR UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.tg_log_activity();
CREATE TRIGGER log_activity_projects AFTER INSERT OR UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.tg_log_activity();
CREATE TRIGGER log_activity_te AFTER INSERT OR UPDATE ON public.taxonomy_events FOR EACH ROW EXECUTE FUNCTION public.tg_log_activity();
CREATE TRIGGER log_activity_ta AFTER INSERT OR UPDATE ON public.taxonomy_attributes FOR EACH ROW EXECUTE FUNCTION public.tg_log_activity();
CREATE TRIGGER log_activity_vr AFTER INSERT OR UPDATE ON public.validation_rules FOR EACH ROW EXECUTE FUNCTION public.tg_log_activity();
CREATE TRIGGER log_activity_qu AFTER INSERT ON public.qa_uploads FOR EACH ROW EXECUTE FUNCTION public.tg_log_activity();

-- Workspace owner trigger (kept)
DROP TRIGGER IF EXISTS workspaces_owner ON public.workspaces;
CREATE TRIGGER workspaces_owner AFTER INSERT ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.tg_workspace_owner();