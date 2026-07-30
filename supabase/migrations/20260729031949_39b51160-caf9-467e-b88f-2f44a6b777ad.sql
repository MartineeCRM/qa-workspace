CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  display_name text NOT NULL DEFAULT '',
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  description text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT ALL ON public.workspaces TO service_role;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_workspaces_updated BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','admin','editor','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);
CREATE INDEX idx_ws_members_user ON public.workspace_members(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;
GRANT ALL ON public.workspace_members TO service_role;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.ws_role(_ws uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.workspace_members WHERE workspace_id = _ws AND user_id = auth.uid();
$$;
CREATE OR REPLACE FUNCTION public.is_ws_member(_ws uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = _ws AND user_id = auth.uid());
$$;
CREATE OR REPLACE FUNCTION public.can_admin_ws(_ws uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = _ws AND user_id = auth.uid() AND role IN ('owner','admin'));
$$;
CREATE OR REPLACE FUNCTION public.can_edit_ws(_ws uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = _ws AND user_id = auth.uid() AND role IN ('owner','admin','editor'));
$$;

CREATE OR REPLACE FUNCTION public.tg_workspace_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_workspace_owner AFTER INSERT ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.tg_workspace_owner();

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  description text,
  project_key text NOT NULL CHECK (length(btrim(project_key)) > 0),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (workspace_id, project_key)
);
CREATE INDEX idx_projects_ws ON public.projects(workspace_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.ws_of_project(_p uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT workspace_id FROM public.projects WHERE id = _p;
$$;

CREATE TABLE public.tracking_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  description text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE INDEX idx_contracts_project ON public.tracking_contracts(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracking_contracts TO authenticated;
GRANT ALL ON public.tracking_contracts TO service_role;
ALTER TABLE public.tracking_contracts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_contracts_updated BEFORE UPDATE ON public.tracking_contracts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.project_of_contract(_c uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT project_id FROM public.tracking_contracts WHERE id = _c;
$$;
CREATE OR REPLACE FUNCTION public.ws_of_contract(_c uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.workspace_id FROM public.tracking_contracts c JOIN public.projects p ON p.id = c.project_id WHERE c.id = _c;
$$;

CREATE TABLE public.contract_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_contract_id uuid NOT NULL REFERENCES public.tracking_contracts(id) ON DELETE CASCADE,
  version_label text NOT NULL CHECK (length(btrim(version_label)) > 0),
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','deprecated')),
  based_on_version_id uuid REFERENCES public.contract_versions(id) ON DELETE SET NULL,
  published_at timestamptz,
  published_by uuid REFERENCES public.profiles(id),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tracking_contract_id, version_label)
);
CREATE INDEX idx_versions_contract ON public.contract_versions(tracking_contract_id);
CREATE INDEX idx_versions_status ON public.contract_versions(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_versions TO authenticated;
GRANT ALL ON public.contract_versions TO service_role;
ALTER TABLE public.contract_versions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_versions_updated BEFORE UPDATE ON public.contract_versions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.ws_of_version(_v uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.workspace_id FROM public.contract_versions v
  JOIN public.tracking_contracts c ON c.id = v.tracking_contract_id
  JOIN public.projects p ON p.id = c.project_id WHERE v.id = _v;
$$;
CREATE OR REPLACE FUNCTION public.version_status(_v uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT status FROM public.contract_versions WHERE id = _v;
$$;

CREATE OR REPLACE FUNCTION public.tg_version_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status = 'deprecated' THEN
    RAISE EXCEPTION 'Deprecated contract versions are read-only';
  END IF;
  IF OLD.status = 'published' THEN
    IF NEW.status = 'draft' THEN RAISE EXCEPTION 'A published contract version cannot return to draft'; END IF;
    IF NEW.version_label IS DISTINCT FROM OLD.version_label
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.tracking_contract_id IS DISTINCT FROM OLD.tracking_contract_id
       OR NEW.based_on_version_id IS DISTINCT FROM OLD.based_on_version_id THEN
      RAISE EXCEPTION 'A published contract version cannot be edited';
    END IF;
  END IF;
  IF OLD.status = 'draft' AND NEW.status = 'deprecated' THEN
    RAISE EXCEPTION 'A draft must be published before it can be deprecated';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_version_immutable BEFORE UPDATE ON public.contract_versions FOR EACH ROW EXECUTE FUNCTION public.tg_version_immutable();

CREATE OR REPLACE FUNCTION public.tg_version_delete_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'Only draft contract versions can be deleted'; END IF;
  RETURN OLD;
END; $$;
CREATE TRIGGER trg_version_delete_guard BEFORE DELETE ON public.contract_versions FOR EACH ROW EXECUTE FUNCTION public.tg_version_delete_guard();

CREATE TABLE public.tracking_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version_id uuid NOT NULL REFERENCES public.contract_versions(id) ON DELETE CASCADE,
  parent_definition_id uuid REFERENCES public.tracking_definitions(id) ON DELETE CASCADE,
  definition_type text NOT NULL CHECK (definition_type IN ('event','event_property','user_attribute')),
  technical_name text NOT NULL CHECK (length(btrim(technical_name)) > 0),
  display_name text,
  description text,
  data_type text CHECK (data_type IN ('string','number','integer','boolean','datetime','array','object')),
  is_required boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  trigger_description text,
  example_value jsonb,
  allowed_values jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_def_parent CHECK (
    (definition_type = 'event_property' AND parent_definition_id IS NOT NULL)
    OR (definition_type IN ('event','user_attribute') AND parent_definition_id IS NULL)
  )
);
CREATE INDEX idx_defs_version ON public.tracking_definitions(contract_version_id);
CREATE INDEX idx_defs_parent ON public.tracking_definitions(parent_definition_id);
CREATE INDEX idx_defs_type ON public.tracking_definitions(definition_type);
CREATE INDEX idx_defs_techname ON public.tracking_definitions(technical_name);
CREATE UNIQUE INDEX uq_defs_event_name ON public.tracking_definitions(contract_version_id, technical_name) WHERE definition_type = 'event';
CREATE UNIQUE INDEX uq_defs_userattr_name ON public.tracking_definitions(contract_version_id, technical_name) WHERE definition_type = 'user_attribute';
CREATE UNIQUE INDEX uq_defs_prop_name ON public.tracking_definitions(parent_definition_id, technical_name) WHERE definition_type = 'event_property';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracking_definitions TO authenticated;
GRANT ALL ON public.tracking_definitions TO service_role;
ALTER TABLE public.tracking_definitions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_defs_updated BEFORE UPDATE ON public.tracking_definitions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.tg_def_integrity() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE parent_type text; parent_version uuid;
BEGIN
  IF NEW.parent_definition_id IS NOT NULL THEN
    SELECT definition_type, contract_version_id INTO parent_type, parent_version
      FROM public.tracking_definitions WHERE id = NEW.parent_definition_id;
    IF parent_type IS DISTINCT FROM 'event' THEN
      RAISE EXCEPTION 'An event property must reference an event as its parent';
    END IF;
    IF parent_version IS DISTINCT FROM NEW.contract_version_id THEN
      RAISE EXCEPTION 'Parent event must belong to the same contract version';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_def_integrity BEFORE INSERT OR UPDATE ON public.tracking_definitions FOR EACH ROW EXECUTE FUNCTION public.tg_def_integrity();

CREATE TABLE public.validation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_version_id uuid NOT NULL REFERENCES public.contract_versions(id) ON DELETE CASCADE,
  tracking_definition_id uuid REFERENCES public.tracking_definitions(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  description text,
  rule_type text NOT NULL CHECK (rule_type IN ('required_collection','required_value','data_type','allowed_values','numeric_range','string_pattern','event_attribute_consistency','cross_event_consistency','temporal_consistency','custom')),
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('critical','warning','info')),
  pass_condition_type text NOT NULL DEFAULT 'all_records' CHECK (pass_condition_type IN ('all_records','minimum_pass_rate','maximum_failure_count')),
  minimum_pass_rate numeric CHECK (minimum_pass_rate IS NULL OR (minimum_pass_rate >= 0 AND minimum_pass_rate <= 100)),
  maximum_failure_count integer CHECK (maximum_failure_count IS NULL OR maximum_failure_count >= 0),
  rule_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_enabled boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_rule_threshold CHECK (
    (pass_condition_type = 'all_records' AND minimum_pass_rate IS NULL AND maximum_failure_count IS NULL)
    OR (pass_condition_type = 'minimum_pass_rate' AND minimum_pass_rate IS NOT NULL AND maximum_failure_count IS NULL)
    OR (pass_condition_type = 'maximum_failure_count' AND maximum_failure_count IS NOT NULL AND minimum_pass_rate IS NULL)
  )
);
CREATE INDEX idx_rules_version ON public.validation_rules(contract_version_id);
CREATE INDEX idx_rules_def ON public.validation_rules(tracking_definition_id);
CREATE INDEX idx_rules_type ON public.validation_rules(rule_type);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.validation_rules TO authenticated;
GRANT ALL ON public.validation_rules TO service_role;
ALTER TABLE public.validation_rules ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_rules_updated BEFORE UPDATE ON public.validation_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.tg_require_draft_version() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v uuid; st text;
BEGIN
  IF TG_OP = 'DELETE' THEN v := OLD.contract_version_id; ELSE v := NEW.contract_version_id; END IF;
  SELECT status INTO st FROM public.contract_versions WHERE id = v;
  IF st IS NOT NULL AND st <> 'draft' THEN
    RAISE EXCEPTION 'This contract version is % and is read-only', st;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_defs_draft_only BEFORE INSERT OR UPDATE OR DELETE ON public.tracking_definitions FOR EACH ROW EXECUTE FUNCTION public.tg_require_draft_version();
CREATE TRIGGER trg_rules_draft_only BEFORE INSERT OR UPDATE OR DELETE ON public.validation_rules FOR EACH ROW EXECUTE FUNCTION public.tg_require_draft_version();

CREATE TABLE public.qa_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  description text,
  applied_contract_version_id uuid NOT NULL REFERENCES public.contract_versions(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','archived')),
  environment text NOT NULL DEFAULT 'development' CHECK (environment IN ('development','staging','production')),
  platform text NOT NULL DEFAULT 'other' CHECK (platform IN ('ios','android','mobile_web','desktop_web','server','other')),
  app_version text,
  target_start_at timestamptz,
  target_end_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT chk_round_period CHECK (target_start_at IS NULL OR target_end_at IS NULL OR target_end_at >= target_start_at)
);
CREATE INDEX idx_rounds_project ON public.qa_rounds(project_id);
CREATE INDEX idx_rounds_version ON public.qa_rounds(applied_contract_version_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_rounds TO authenticated;
GRANT ALL ON public.qa_rounds TO service_role;
ALTER TABLE public.qa_rounds ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_rounds_updated BEFORE UPDATE ON public.qa_rounds FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.tg_round_integrity() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE st text; arch timestamptz;
BEGIN
  SELECT status INTO st FROM public.contract_versions WHERE id = NEW.applied_contract_version_id;
  IF NEW.status = 'ready' AND st <> 'published' THEN
    RAISE EXCEPTION 'A QA round can only be ready when it applies a published contract version';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT archived_at INTO arch FROM public.projects WHERE id = NEW.project_id;
    IF arch IS NOT NULL THEN RAISE EXCEPTION 'Cannot create records inside an archived project'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_round_integrity BEFORE INSERT OR UPDATE ON public.qa_rounds FOR EACH ROW EXECUTE FUNCTION public.tg_round_integrity();

CREATE OR REPLACE FUNCTION public.tg_contract_parent_active() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE arch timestamptz;
BEGIN
  SELECT archived_at INTO arch FROM public.projects WHERE id = NEW.project_id;
  IF arch IS NOT NULL THEN RAISE EXCEPTION 'Cannot create records inside an archived project'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_contract_parent_active BEFORE INSERT ON public.tracking_contracts FOR EACH ROW EXECUTE FUNCTION public.tg_contract_parent_active();

CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES public.profiles(id),
  entity_type text NOT NULL,
  entity_id uuid,
  action_type text NOT NULL,
  summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_ws ON public.activity_logs(workspace_id, created_at DESC);
CREATE INDEX idx_activity_project ON public.activity_logs(project_id, created_at DESC);
GRANT SELECT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.tg_log_activity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ws uuid; _proj uuid; _entity text; _action text; _summary text; _id uuid; _name text;
BEGIN
  _entity := TG_TABLE_NAME;
  _action := lower(TG_OP);
  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - 'updated_at') = (to_jsonb(OLD) - 'updated_at') THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'workspaces' THEN
    _ws := NEW.id; _id := NEW.id; _name := NEW.name;
  ELSIF TG_TABLE_NAME = 'projects' THEN
    _ws := NEW.workspace_id; _proj := NEW.id; _id := NEW.id; _name := NEW.name;
  ELSIF TG_TABLE_NAME = 'tracking_contracts' THEN
    _ws := public.ws_of_contract(NEW.id); _proj := NEW.project_id; _id := NEW.id; _name := NEW.name;
  ELSIF TG_TABLE_NAME = 'contract_versions' THEN
    _ws := public.ws_of_version(NEW.id); _proj := public.project_of_contract(NEW.tracking_contract_id);
    _id := NEW.id; _name := NEW.version_label;
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN _action := NEW.status; END IF;
  ELSIF TG_TABLE_NAME = 'tracking_definitions' THEN
    _ws := public.ws_of_version(NEW.contract_version_id);
    SELECT p.id INTO _proj FROM public.contract_versions v JOIN public.tracking_contracts c ON c.id=v.tracking_contract_id JOIN public.projects p ON p.id=c.project_id WHERE v.id=NEW.contract_version_id;
    _id := NEW.id; _name := NEW.technical_name;
  ELSIF TG_TABLE_NAME = 'validation_rules' THEN
    _ws := public.ws_of_version(NEW.contract_version_id);
    SELECT p.id INTO _proj FROM public.contract_versions v JOIN public.tracking_contracts c ON c.id=v.tracking_contract_id JOIN public.projects p ON p.id=c.project_id WHERE v.id=NEW.contract_version_id;
    _id := NEW.id; _name := NEW.name;
  ELSIF TG_TABLE_NAME = 'qa_rounds' THEN
    _ws := public.ws_of_project(NEW.project_id); _proj := NEW.project_id; _id := NEW.id; _name := NEW.name;
  END IF;
  IF _ws IS NULL THEN RETURN NEW; END IF;
  _summary := initcap(replace(_entity,'_',' ')) || ' "' || COALESCE(_name,'') || '" ' || _action;
  INSERT INTO public.activity_logs (workspace_id, project_id, actor_user_id, entity_type, entity_id, action_type, summary)
  VALUES (_ws, _proj, auth.uid(), _entity, _id, _action, _summary);
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_log_workspaces AFTER INSERT OR UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.tg_log_activity();
CREATE TRIGGER trg_log_projects AFTER INSERT OR UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.tg_log_activity();
CREATE TRIGGER trg_log_contracts AFTER INSERT OR UPDATE ON public.tracking_contracts FOR EACH ROW EXECUTE FUNCTION public.tg_log_activity();
CREATE TRIGGER trg_log_versions AFTER INSERT OR UPDATE ON public.contract_versions FOR EACH ROW EXECUTE FUNCTION public.tg_log_activity();
CREATE TRIGGER trg_log_defs AFTER INSERT OR UPDATE ON public.tracking_definitions FOR EACH ROW EXECUTE FUNCTION public.tg_log_activity();
CREATE TRIGGER trg_log_rules AFTER INSERT OR UPDATE ON public.validation_rules FOR EACH ROW EXECUTE FUNCTION public.tg_log_activity();
CREATE TRIGGER trg_log_rounds AFTER INSERT OR UPDATE ON public.qa_rounds FOR EACH ROW EXECUTE FUNCTION public.tg_log_activity();

CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_insert ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY ws_select ON public.workspaces FOR SELECT TO authenticated USING (public.is_ws_member(id));
CREATE POLICY ws_insert ON public.workspaces FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY ws_update ON public.workspaces FOR UPDATE TO authenticated USING (public.can_admin_ws(id)) WITH CHECK (public.can_admin_ws(id));
CREATE POLICY ws_delete ON public.workspaces FOR DELETE TO authenticated USING (public.ws_role(id) = 'owner');

CREATE POLICY wsm_select ON public.workspace_members FOR SELECT TO authenticated USING (public.is_ws_member(workspace_id));
CREATE POLICY wsm_insert ON public.workspace_members FOR INSERT TO authenticated WITH CHECK (public.can_admin_ws(workspace_id));
CREATE POLICY wsm_update ON public.workspace_members FOR UPDATE TO authenticated USING (public.can_admin_ws(workspace_id)) WITH CHECK (public.can_admin_ws(workspace_id));
CREATE POLICY wsm_delete ON public.workspace_members FOR DELETE TO authenticated USING (public.can_admin_ws(workspace_id));

CREATE POLICY proj_select ON public.projects FOR SELECT TO authenticated USING (public.is_ws_member(workspace_id));
CREATE POLICY proj_insert ON public.projects FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(workspace_id) AND created_by = auth.uid());
CREATE POLICY proj_update ON public.projects FOR UPDATE TO authenticated USING (public.can_edit_ws(workspace_id)) WITH CHECK (public.can_edit_ws(workspace_id));
CREATE POLICY proj_delete ON public.projects FOR DELETE TO authenticated USING (public.can_admin_ws(workspace_id));

CREATE POLICY tc_select ON public.tracking_contracts FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project(project_id)));
CREATE POLICY tc_insert ON public.tracking_contracts FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)) AND created_by = auth.uid());
CREATE POLICY tc_update ON public.tracking_contracts FOR UPDATE TO authenticated USING (public.can_edit_ws(public.ws_of_project(project_id))) WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)));
CREATE POLICY tc_delete ON public.tracking_contracts FOR DELETE TO authenticated USING (public.can_admin_ws(public.ws_of_project(project_id)));

CREATE POLICY cv_select ON public.contract_versions FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_contract(tracking_contract_id)));
CREATE POLICY cv_insert ON public.contract_versions FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_contract(tracking_contract_id)) AND created_by = auth.uid() AND status = 'draft');
CREATE POLICY cv_update ON public.contract_versions FOR UPDATE TO authenticated USING (public.can_edit_ws(public.ws_of_contract(tracking_contract_id))) WITH CHECK (public.can_edit_ws(public.ws_of_contract(tracking_contract_id)));
CREATE POLICY cv_delete ON public.contract_versions FOR DELETE TO authenticated USING (public.can_edit_ws(public.ws_of_contract(tracking_contract_id)));

CREATE POLICY td_select ON public.tracking_definitions FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_version(contract_version_id)));
CREATE POLICY td_insert ON public.tracking_definitions FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_version(contract_version_id)) AND public.version_status(contract_version_id) = 'draft' AND created_by = auth.uid());
CREATE POLICY td_update ON public.tracking_definitions FOR UPDATE TO authenticated USING (public.can_edit_ws(public.ws_of_version(contract_version_id)) AND public.version_status(contract_version_id) = 'draft') WITH CHECK (public.can_edit_ws(public.ws_of_version(contract_version_id)) AND public.version_status(contract_version_id) = 'draft');
CREATE POLICY td_delete ON public.tracking_definitions FOR DELETE TO authenticated USING (public.can_edit_ws(public.ws_of_version(contract_version_id)) AND public.version_status(contract_version_id) = 'draft');

CREATE POLICY vr_select ON public.validation_rules FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_version(contract_version_id)));
CREATE POLICY vr_insert ON public.validation_rules FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_version(contract_version_id)) AND public.version_status(contract_version_id) = 'draft' AND created_by = auth.uid());
CREATE POLICY vr_update ON public.validation_rules FOR UPDATE TO authenticated USING (public.can_edit_ws(public.ws_of_version(contract_version_id)) AND public.version_status(contract_version_id) = 'draft') WITH CHECK (public.can_edit_ws(public.ws_of_version(contract_version_id)) AND public.version_status(contract_version_id) = 'draft');
CREATE POLICY vr_delete ON public.validation_rules FOR DELETE TO authenticated USING (public.can_edit_ws(public.ws_of_version(contract_version_id)) AND public.version_status(contract_version_id) = 'draft');

CREATE POLICY qr_select ON public.qa_rounds FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project(project_id)));
CREATE POLICY qr_insert ON public.qa_rounds FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)) AND created_by = auth.uid());
CREATE POLICY qr_update ON public.qa_rounds FOR UPDATE TO authenticated USING (public.can_edit_ws(public.ws_of_project(project_id))) WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)));
CREATE POLICY qr_delete ON public.qa_rounds FOR DELETE TO authenticated USING (public.can_admin_ws(public.ws_of_project(project_id)));

CREATE POLICY al_select ON public.activity_logs FOR SELECT TO authenticated USING (public.is_ws_member(workspace_id));

CREATE OR REPLACE FUNCTION public.ensure_profile(_display_name text DEFAULT NULL)
RETURNS public.profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.profiles (id, display_name)
  VALUES (auth.uid(), COALESCE(NULLIF(btrim(_display_name), ''), 'New user'))
  ON CONFLICT (id) DO UPDATE SET display_name = COALESCE(NULLIF(btrim(_display_name), ''), public.profiles.display_name)
  RETURNING * INTO p;
  RETURN p;
END; $$;
GRANT EXECUTE ON FUNCTION public.ensure_profile(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.publish_contract_version(_version_id uuid)
RETURNS public.contract_versions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.contract_versions;
BEGIN
  SELECT * INTO v FROM public.contract_versions WHERE id = _version_id;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Contract version not found'; END IF;
  IF NOT public.can_edit_ws(public.ws_of_version(_version_id)) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF v.status <> 'draft' THEN RAISE EXCEPTION 'Only a draft can be published'; END IF;
  UPDATE public.contract_versions
     SET status = 'published', published_at = now(), published_by = auth.uid()
   WHERE id = _version_id RETURNING * INTO v;
  RETURN v;
END; $$;
GRANT EXECUTE ON FUNCTION public.publish_contract_version(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.deprecate_contract_version(_version_id uuid)
RETURNS public.contract_versions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.contract_versions;
BEGIN
  SELECT * INTO v FROM public.contract_versions WHERE id = _version_id;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Contract version not found'; END IF;
  IF NOT public.can_edit_ws(public.ws_of_version(_version_id)) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF v.status <> 'published' THEN RAISE EXCEPTION 'Only a published version can be deprecated'; END IF;
  UPDATE public.contract_versions SET status = 'deprecated' WHERE id = _version_id RETURNING * INTO v;
  RETURN v;
END; $$;
GRANT EXECUTE ON FUNCTION public.deprecate_contract_version(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.duplicate_contract_version(_source_version_id uuid, _version_label text, _description text DEFAULT NULL)
RETURNS public.contract_versions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE src public.contract_versions; newv public.contract_versions; r record; map jsonb := '{}'::jsonb; new_id uuid;
BEGIN
  SELECT * INTO src FROM public.contract_versions WHERE id = _source_version_id;
  IF src.id IS NULL THEN RAISE EXCEPTION 'Source version not found'; END IF;
  IF NOT public.can_edit_ws(public.ws_of_version(_source_version_id)) THEN RAISE EXCEPTION 'Not permitted'; END IF;

  INSERT INTO public.contract_versions (tracking_contract_id, version_label, description, status, based_on_version_id, created_by)
  VALUES (src.tracking_contract_id, btrim(_version_label), COALESCE(_description, src.description), 'draft', src.id, auth.uid())
  RETURNING * INTO newv;

  FOR r IN SELECT * FROM public.tracking_definitions WHERE contract_version_id = src.id AND parent_definition_id IS NULL ORDER BY sort_order, created_at LOOP
    INSERT INTO public.tracking_definitions (contract_version_id, parent_definition_id, definition_type, technical_name, display_name, description, data_type, is_required, is_active, trigger_description, example_value, allowed_values, metadata, sort_order, created_by)
    VALUES (newv.id, NULL, r.definition_type, r.technical_name, r.display_name, r.description, r.data_type, r.is_required, r.is_active, r.trigger_description, r.example_value, r.allowed_values, r.metadata, r.sort_order, auth.uid())
    RETURNING id INTO new_id;
    map := map || jsonb_build_object(r.id::text, new_id::text);
  END LOOP;

  FOR r IN SELECT * FROM public.tracking_definitions WHERE contract_version_id = src.id AND parent_definition_id IS NOT NULL ORDER BY sort_order, created_at LOOP
    INSERT INTO public.tracking_definitions (contract_version_id, parent_definition_id, definition_type, technical_name, display_name, description, data_type, is_required, is_active, trigger_description, example_value, allowed_values, metadata, sort_order, created_by)
    VALUES (newv.id, (map ->> r.parent_definition_id::text)::uuid, r.definition_type, r.technical_name, r.display_name, r.description, r.data_type, r.is_required, r.is_active, r.trigger_description, r.example_value, r.allowed_values, r.metadata, r.sort_order, auth.uid())
    RETURNING id INTO new_id;
    map := map || jsonb_build_object(r.id::text, new_id::text);
  END LOOP;

  FOR r IN SELECT * FROM public.validation_rules WHERE contract_version_id = src.id ORDER BY created_at LOOP
    INSERT INTO public.validation_rules (contract_version_id, tracking_definition_id, name, description, rule_type, severity, pass_condition_type, minimum_pass_rate, maximum_failure_count, rule_config, is_enabled, created_by)
    VALUES (newv.id,
            CASE WHEN r.tracking_definition_id IS NULL THEN NULL ELSE (map ->> r.tracking_definition_id::text)::uuid END,
            r.name, r.description, r.rule_type, r.severity, r.pass_condition_type, r.minimum_pass_rate, r.maximum_failure_count, r.rule_config, r.is_enabled, auth.uid());
  END LOOP;

  RETURN newv;
END; $$;
GRANT EXECUTE ON FUNCTION public.duplicate_contract_version(uuid, text, text) TO authenticated;