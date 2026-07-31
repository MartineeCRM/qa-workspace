# Taxonomy/QA 스키마 재구성 + 검증 워크플로우 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `taxonomy_attributes`를 이벤트/유저 스코프로 분리하고, `qa_stages`를 `qa_environments`로 개명하고, QA 라운드(체크리스트 → 이벤트로그/attribute 스냅샷 수집 → 3단계 판정 → 사람 검토 → 논의) 전체 워크플로우를 신규 스키마로 구축한 뒤, 기존 프론트엔드가 새 스키마에서 정상 동작하도록 맞추고, 새 워크플로우를 최소 UI로 로컬호스트에서 확인 가능하게 만든다.

**Architecture:** Supabase Postgres 마이그레이션을 순서대로 적용(개명 → 분리 → 재구성 → 신규 테이블), 기존 RLS 패턴(`ws_of_project`/`is_ws_member`/`can_edit_ws`/`can_admin_ws`)을 그대로 재사용한다. 프론트엔드는 `src/lib/queries.ts`의 손으로 작성된 타입/훅이 기준이므로(생성된 `types.ts`는 참고용, `db`는 `as any`) 여기부터 고친다. AI 판정과 외부 attribute API 호출은 이번 단계에서는 스텁 함수로 구현하고(실제 API 키가 없으므로), 사람이 넣는 임시 값으로 동작을 확인할 수 있게 한다.

**Tech Stack:** TanStack Start (React, TanStack Query), Supabase (Postgres/RLS), 기존 저장소 규약(`supabase/migrations/*.sql`, `npx supabase db push --db-url ...`).

---

## Before you start

- 이 작업은 별도 워크트리 `.worktrees/taxonomy-qa-redesign` (브랜치 `feature/taxonomy-qa-redesign`)에서 진행한다. 이미 생성/`npm install` 완료, `npx tsc --noEmit` 베이스라인 통과 확인됨.
- DB 비밀번호가 필요하면 기존 파일-핸드오프 패턴(`/tmp/qa_workspace_db_pass.txt`, 절대 채팅에 값 노출 금지)을 그대로 쓴다.
- 마이그레이션 파일명은 `supabase/migrations/`에 있는 기존 파일들보다 뒤 타임스탬프를 쓴다(예: `20260730040000_...`). 실제 실행 시 `date -u +%Y%m%d%H%M%S`로 새 타임스탬프를 생성해 파일명 충돌을 피한다 — 아래 태스크의 파일명은 예시이며, 실제로는 태스크 순서대로 1분씩 증가시켜 적용한다.
- 각 마이그레이션 태스크는 `npx supabase db push --db-url "$(cat /path/to/pooler-url-with-pass)"` 로 라이브 DB에 실제 반영하고, 실패 시 `npx supabase migration repair`로 대응한다(기존 세션에서 확립된 패턴).

---

### Task 1: `qa_stages` → `qa_environments` 개명 (테이블 + 참조 컬럼 전부)

**Files:**
- Create: `supabase/migrations/20260730040000_rename_qa_stages_to_environments.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
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
```

- [ ] **Step 2: 라이브 DB에 push**

Run: `npx supabase db push --db-url "$(cat /tmp/qa_workspace_db_pass_url.txt)"`
Expected: 마이그레이션 적용 성공, `qa_environments` 테이블 존재 확인.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/20260730040000_rename_qa_stages_to_environments.sql
git commit -m "Rename qa_stages to qa_environments and cascade FK column renames"
```

---

### Task 2: `taxonomy_categories` 신규 + `taxonomy_events.category_id`

**Files:**
- Create: `supabase/migrations/20260730040100_add_taxonomy_categories.sql`

- [ ] **Step 1: 마이그레이션 작성**

```sql
CREATE TABLE public.taxonomy_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX taxonomy_categories_name_uq ON public.taxonomy_categories (project_id, name);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.taxonomy_categories TO authenticated;
GRANT ALL ON public.taxonomy_categories TO service_role;
ALTER TABLE public.taxonomy_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY tc_select ON public.taxonomy_categories FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project(project_id)));
CREATE POLICY tc_insert ON public.taxonomy_categories FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)) AND created_by = auth.uid());
CREATE POLICY tc_update ON public.taxonomy_categories FOR UPDATE TO authenticated USING (public.can_edit_ws(public.ws_of_project(project_id))) WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)));
CREATE POLICY tc_delete ON public.taxonomy_categories FOR DELETE TO authenticated USING (public.can_edit_ws(public.ws_of_project(project_id)));
CREATE TRIGGER trg_taxonomy_categories_updated BEFORE UPDATE ON public.taxonomy_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_taxonomy_categories_log AFTER INSERT OR UPDATE ON public.taxonomy_categories FOR EACH ROW EXECUTE FUNCTION public.tg_log_activity();

ALTER TABLE public.taxonomy_events ADD COLUMN category_id uuid REFERENCES public.taxonomy_categories(id) ON DELETE SET NULL;
```

- [ ] **Step 2: push + 커밋**

Run: `npx supabase db push --db-url "$(cat /tmp/qa_workspace_db_pass_url.txt)"`

```bash
git add supabase/migrations/20260730040100_add_taxonomy_categories.sql
git commit -m "Add taxonomy_categories and taxonomy_events.category_id"
```

---

### Task 3: `taxonomy_attributes` 분리 → `taxonomy_event_properties` + `taxonomy_custom_attributes`

**Files:**
- Create: `supabase/migrations/20260730040200_split_taxonomy_attributes.sql`

- [ ] **Step 1: 마이그레이션 작성 (신규 테이블 + 데이터 이관 + 참조 갱신 + 구 테이블 제거)**

```sql
CREATE TABLE public.taxonomy_event_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.taxonomy_events(id) ON DELETE CASCADE,
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
CREATE UNIQUE INDEX taxonomy_event_properties_name_uq ON public.taxonomy_event_properties (event_id, technical_name);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.taxonomy_event_properties TO authenticated;
GRANT ALL ON public.taxonomy_event_properties TO service_role;
ALTER TABLE public.taxonomy_event_properties ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.taxonomy_custom_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
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
CREATE UNIQUE INDEX taxonomy_custom_attributes_name_uq ON public.taxonomy_custom_attributes (project_id, technical_name);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.taxonomy_custom_attributes TO authenticated;
GRANT ALL ON public.taxonomy_custom_attributes TO service_role;
ALTER TABLE public.taxonomy_custom_attributes ENABLE ROW LEVEL SECURITY;

-- 데이터 이관
INSERT INTO public.taxonomy_event_properties
  (id, event_id, technical_name, display_name, description, data_type, is_required, is_active, example_value, allowed_values, sort_order, created_by, created_at, updated_at)
SELECT id, event_id, technical_name, display_name, description, data_type, is_required, is_active, example_value, allowed_values, sort_order, created_by, created_at, updated_at
FROM public.taxonomy_attributes WHERE event_id IS NOT NULL;

INSERT INTO public.taxonomy_custom_attributes
  (id, project_id, technical_name, display_name, description, data_type, is_required, is_active, example_value, allowed_values, sort_order, created_by, created_at, updated_at)
SELECT id, project_id, technical_name, display_name, description, data_type, is_required, is_active, example_value, allowed_values, sort_order, created_by, created_at, updated_at
FROM public.taxonomy_attributes WHERE event_id IS NULL;

-- RLS 정책 (분리된 두 테이블 모두 event_id/project_id 경로로 ws_of_project 유도)
CREATE POLICY tep_select ON public.taxonomy_event_properties FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project((SELECT project_id FROM public.taxonomy_events WHERE id = event_id))));
CREATE POLICY tep_insert ON public.taxonomy_event_properties FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.taxonomy_events WHERE id = event_id))) AND created_by = auth.uid());
CREATE POLICY tep_update ON public.taxonomy_event_properties FOR UPDATE TO authenticated USING (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.taxonomy_events WHERE id = event_id)))) WITH CHECK (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.taxonomy_events WHERE id = event_id))));
CREATE POLICY tep_delete ON public.taxonomy_event_properties FOR DELETE TO authenticated USING (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.taxonomy_events WHERE id = event_id))));

CREATE POLICY tca_select ON public.taxonomy_custom_attributes FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project(project_id)));
CREATE POLICY tca_insert ON public.taxonomy_custom_attributes FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)) AND created_by = auth.uid());
CREATE POLICY tca_update ON public.taxonomy_custom_attributes FOR UPDATE TO authenticated USING (public.can_edit_ws(public.ws_of_project(project_id))) WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)));
CREATE POLICY tca_delete ON public.taxonomy_custom_attributes FOR DELETE TO authenticated USING (public.can_edit_ws(public.ws_of_project(project_id)));

CREATE TRIGGER trg_taxonomy_event_properties_updated BEFORE UPDATE ON public.taxonomy_event_properties FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_taxonomy_custom_attributes_updated BEFORE UPDATE ON public.taxonomy_custom_attributes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 주의: validation_rules/qa_item_status가 옛 taxonomy_attributes.id를 참조 중이므로,
-- 이 마이그레이션에서는 taxonomy_attributes를 아직 DROP하지 않는다 (Task 4/5에서 참조 이관 후 DROP).
```

- [ ] **Step 2: push + 커밋**

Run: `npx supabase db push --db-url "$(cat /tmp/qa_workspace_db_pass_url.txt)"`
Expected: 두 신규 테이블 생성, 기존 `taxonomy_attributes` 데이터가 정확히 분배됐는지 `SELECT count(*)`로 대조 확인(구 테이블 count = 두 신규 테이블 count 합).

```bash
git add supabase/migrations/20260730040200_split_taxonomy_attributes.sql
git commit -m "Split taxonomy_attributes into event properties and custom attributes"
```

---

### Task 4: `validation_rules` 재구성 (event_id/property_id/custom_attribute_id + description)

**Files:**
- Create: `supabase/migrations/20260730040300_restructure_validation_rules.sql`

- [ ] **Step 1: 마이그레이션 작성**

```sql
ALTER TABLE public.validation_rules ADD COLUMN property_id uuid REFERENCES public.taxonomy_event_properties(id) ON DELETE CASCADE;
ALTER TABLE public.validation_rules ADD COLUMN custom_attribute_id uuid REFERENCES public.taxonomy_custom_attributes(id) ON DELETE CASCADE;

-- 기존 attribute_id(옛 taxonomy_attributes 참조)를 새 컬럼으로 이관
UPDATE public.validation_rules vr
SET property_id = vr.attribute_id
FROM public.taxonomy_attributes ta
WHERE vr.attribute_id = ta.id AND ta.event_id IS NOT NULL;

UPDATE public.validation_rules vr
SET custom_attribute_id = vr.attribute_id
FROM public.taxonomy_attributes ta
WHERE vr.attribute_id = ta.id AND ta.event_id IS NULL;

-- description 컬럼은 기존 description 그대로 재사용 (이미 존재)
ALTER TABLE public.validation_rules DROP COLUMN attribute_id;
ALTER TABLE public.validation_rules DROP COLUMN rule_type;
ALTER TABLE public.validation_rules DROP COLUMN severity;
ALTER TABLE public.validation_rules DROP COLUMN pass_condition_type;
ALTER TABLE public.validation_rules DROP COLUMN minimum_pass_rate;
ALTER TABLE public.validation_rules DROP COLUMN maximum_failure_count;
ALTER TABLE public.validation_rules DROP COLUMN rule_config;

ALTER TABLE public.validation_rules ADD CONSTRAINT validation_rules_target_chk
  CHECK (NOT (property_id IS NOT NULL AND custom_attribute_id IS NOT NULL));
```

- [ ] **Step 2: push + 커밋**

Run: `npx supabase db push --db-url "$(cat /tmp/qa_workspace_db_pass_url.txt)"`

```bash
git add supabase/migrations/20260730040300_restructure_validation_rules.sql
git commit -m "Restructure validation_rules for the 3-layer qualitative verdict model"
```

---

### Task 5: `qa_item_status` 3-컬럼 패턴으로 확장 + `taxonomy_attributes` 제거

**Files:**
- Create: `supabase/migrations/20260730040400_migrate_qa_item_status_and_drop_taxonomy_attributes.sql`

- [ ] **Step 1: 마이그레이션 작성**

```sql
ALTER TABLE public.qa_item_status ADD COLUMN property_id uuid REFERENCES public.taxonomy_event_properties(id) ON DELETE CASCADE;
ALTER TABLE public.qa_item_status ADD COLUMN custom_attribute_id uuid REFERENCES public.taxonomy_custom_attributes(id) ON DELETE CASCADE;

UPDATE public.qa_item_status qis
SET property_id = qis.attribute_id
FROM public.taxonomy_attributes ta
WHERE qis.attribute_id = ta.id AND ta.event_id IS NOT NULL;

UPDATE public.qa_item_status qis
SET custom_attribute_id = qis.attribute_id
FROM public.taxonomy_attributes ta
WHERE qis.attribute_id = ta.id AND ta.event_id IS NULL;

DROP INDEX IF EXISTS public.qa_item_status_item_uq;
ALTER TABLE public.qa_item_status DROP CONSTRAINT qa_item_status_target_chk;
ALTER TABLE public.qa_item_status DROP COLUMN attribute_id;

ALTER TABLE public.qa_item_status ADD CONSTRAINT qa_item_status_target_chk
  CHECK (num_nonnulls(event_id, property_id, custom_attribute_id) = 1);

CREATE UNIQUE INDEX qa_item_status_item_uq
  ON public.qa_item_status (qa_environment_id, event_id, property_id, custom_attribute_id) NULLS NOT DISTINCT;

DROP TABLE public.taxonomy_attributes;
```

- [ ] **Step 2: push + 커밋**

Run: `npx supabase db push --db-url "$(cat /tmp/qa_workspace_db_pass_url.txt)"`
Expected: `taxonomy_attributes` 더 이상 존재하지 않음, `qa_item_status`에 3개 nullable FK 존재.

```bash
git add supabase/migrations/20260730040400_migrate_qa_item_status_and_drop_taxonomy_attributes.sql
git commit -m "Migrate qa_item_status to 3-column target pattern and drop taxonomy_attributes"
```

---

### Task 6: QA 라운드 실행 테이블 (qa_rounds, qa_run_events, qa_attribute_snapshots)

**Files:**
- Create: `supabase/migrations/20260730040500_add_qa_rounds_and_execution_tables.sql`

- [ ] **Step 1: 마이그레이션 작성**

```sql
CREATE TABLE public.qa_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  qa_environment_id uuid NOT NULL REFERENCES public.qa_environments(id) ON DELETE CASCADE,
  round_number integer NOT NULL,
  previous_round_id uuid REFERENCES public.qa_rounds(id) ON DELETE SET NULL,
  started_by uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE UNIQUE INDEX qa_rounds_env_number_uq ON public.qa_rounds (qa_environment_id, round_number);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_rounds TO authenticated;
GRANT ALL ON public.qa_rounds TO service_role;
ALTER TABLE public.qa_rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY qr_select ON public.qa_rounds FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project(project_id)));
CREATE POLICY qr_insert ON public.qa_rounds FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)) AND started_by = auth.uid());
CREATE POLICY qr_update ON public.qa_rounds FOR UPDATE TO authenticated USING (public.can_edit_ws(public.ws_of_project(project_id))) WITH CHECK (public.can_edit_ws(public.ws_of_project(project_id)));
CREATE POLICY qr_delete ON public.qa_rounds FOR DELETE TO authenticated USING (public.can_admin_ws(public.ws_of_project(project_id)));

CREATE TABLE public.qa_run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qa_round_id uuid NOT NULL REFERENCES public.qa_rounds(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.taxonomy_events(id) ON DELETE SET NULL,
  raw_event_name text NOT NULL,
  occurred_at timestamptz NOT NULL,
  external_user_id text NOT NULL,
  raw_properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX qa_run_events_round_idx ON public.qa_run_events (qa_round_id, occurred_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_run_events TO authenticated;
GRANT ALL ON public.qa_run_events TO service_role;
ALTER TABLE public.qa_run_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY qre_select ON public.qa_run_events FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = qa_round_id))));
CREATE POLICY qre_insert ON public.qa_run_events FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = qa_round_id))));
CREATE POLICY qre_delete ON public.qa_run_events FOR DELETE TO authenticated USING (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = qa_round_id))));

CREATE TABLE public.qa_attribute_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qa_round_id uuid NOT NULL REFERENCES public.qa_rounds(id) ON DELETE CASCADE,
  external_user_id text NOT NULL,
  snapshot_name text NOT NULL,
  status text NOT NULL DEFAULT 'requesting' CHECK (status IN ('requesting','captured','failed')),
  payload jsonb,
  previous_snapshot_id uuid REFERENCES public.qa_attribute_snapshots(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  captured_at timestamptz
);
CREATE INDEX qa_attribute_snapshots_round_idx ON public.qa_attribute_snapshots (qa_round_id, captured_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_attribute_snapshots TO authenticated;
GRANT ALL ON public.qa_attribute_snapshots TO service_role;
ALTER TABLE public.qa_attribute_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY qas_select ON public.qa_attribute_snapshots FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = qa_round_id))));
CREATE POLICY qas_insert ON public.qa_attribute_snapshots FOR INSERT TO authenticated WITH CHECK (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = qa_round_id))));
CREATE POLICY qas_update ON public.qa_attribute_snapshots FOR UPDATE TO authenticated USING (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = qa_round_id)))) WITH CHECK (public.can_edit_ws(public.ws_of_project((SELECT project_id FROM public.qa_rounds WHERE id = qa_round_id))));
```

- [ ] **Step 2: push + 커밋**

Run: `npx supabase db push --db-url "$(cat /tmp/qa_workspace_db_pass_url.txt)"`

```bash
git add supabase/migrations/20260730040500_add_qa_rounds_and_execution_tables.sql
git commit -m "Add qa_rounds, qa_run_events, qa_attribute_snapshots tables"
```

---

### Task 7: 체크리스트 + 판정 결과 + 논의 테이블

**Files:**
- Create: `supabase/migrations/20260730040600_add_checklist_results_discussions.sql`

- [ ] **Step 1: 마이그레이션 작성**

```sql
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
```

- [ ] **Step 2: push + 커밋**

Run: `npx supabase db push --db-url "$(cat /tmp/qa_workspace_db_pass_url.txt)"`

```bash
git add supabase/migrations/20260730040600_add_checklist_results_discussions.sql
git commit -m "Add checklist, verdict result, and discussion tables"
```

---

### Task 8: 프로젝트별 Attribute API 설정 테이블

**Files:**
- Create: `supabase/migrations/20260730040700_add_project_attribute_api_settings.sql`

- [ ] **Step 1: 마이그레이션 작성**

```sql
CREATE TABLE public.project_attribute_api_settings (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  base_url text NOT NULL,
  user_id_param_name text NOT NULL DEFAULT 'user_id',
  auth_secret text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_attribute_api_settings TO authenticated;
GRANT ALL ON public.project_attribute_api_settings TO service_role;
ALTER TABLE public.project_attribute_api_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY paas_select ON public.project_attribute_api_settings FOR SELECT TO authenticated USING (public.is_ws_member(public.ws_of_project(project_id)));
CREATE POLICY paas_insert ON public.project_attribute_api_settings FOR INSERT TO authenticated WITH CHECK (public.can_admin_ws(public.ws_of_project(project_id)));
CREATE POLICY paas_update ON public.project_attribute_api_settings FOR UPDATE TO authenticated USING (public.can_admin_ws(public.ws_of_project(project_id))) WITH CHECK (public.can_admin_ws(public.ws_of_project(project_id)));

REVOKE SELECT (auth_secret) ON public.project_attribute_api_settings FROM authenticated;
```

`auth_secret`은 컬럼 단위로 SELECT를 막아, 일반 클라이언트 쿼리(`select("*")` 포함)로는 절대 값이 내려오지 않는다. 실제 값을 사용해야 하는 스냅샷 캡처 호출은 이후 태스크에서 `SECURITY DEFINER` RPC로 처리한다(이번 플랜 범위에서는 스텁으로 남겨둔다 — "남은 질문" 참조).

- [ ] **Step 2: push + 커밋**

Run: `npx supabase db push --db-url "$(cat /tmp/qa_workspace_db_pass_url.txt)"`

```bash
git add supabase/migrations/20260730040700_add_project_attribute_api_settings.sql
git commit -m "Add project_attribute_api_settings with column-level secret lockdown"
```

---

### Task 9: 생성된 타입 재생성 + `src/lib/queries.ts` 타입/훅 갱신

**Files:**
- Modify: `src/integrations/supabase/types.ts`
- Modify: `src/lib/queries.ts`

- [ ] **Step 1: types.ts 재생성**

Run: `npx supabase gen types typescript --project-id ninvyceivmjvdkansump --schema public > src/integrations/supabase/types.ts`
Expected: 새 테이블(`qa_environments`, `taxonomy_categories`, `taxonomy_event_properties`, `taxonomy_custom_attributes`, `qa_rounds`, `qa_run_events`, `qa_attribute_snapshots`, `qa_round_checklist_items`, `qa_checklist_item_results`, `qa_discussions`, `qa_discussion_comments`, `project_attribute_api_settings`)가 반영되고 `qa_stages`/`taxonomy_attributes`는 사라짐.

- [ ] **Step 2: `src/lib/queries.ts` 타입 갱신**

`QaStage` 타입(라인 74–83)을 `QaEnvironment`로 이름만 변경(구조 동일). `TaxonomyAttribute` 타입(라인 39–54)을 제거하고 아래 두 타입으로 교체:

```typescript
export type TaxonomyEventProperty = {
  id: string;
  event_id: string;
  technical_name: string;
  display_name: string | null;
  description: string | null;
  data_type: string;
  is_required: boolean;
  is_active: boolean;
  example_value: unknown;
  allowed_values: unknown;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type TaxonomyCustomAttribute = {
  id: string;
  project_id: string;
  technical_name: string;
  display_name: string | null;
  description: string | null;
  data_type: string;
  is_required: boolean;
  is_active: boolean;
  example_value: unknown;
  allowed_values: unknown;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};
```

`ValidationRule` 타입(라인 56–72)에서 `attribute_id: string | null`을 제거하고 `property_id: string | null`, `custom_attribute_id: string | null`, `description: string | null`을 추가(단, `rule_type`/`severity`/`pass_condition_type`/`minimum_pass_rate`/`maximum_failure_count`/`rule_config` 필드는 제거 — DB에서 드롭됐으므로).

`QaItemStatus` 타입(라인 108–118)에서 `attribute_id`를 제거하고 `property_id: string | null`, `custom_attribute_id: string | null`을 추가, `stage_id`를 `qa_environment_id`로 변경.

`QaUpload`/`QaAnalysisRun` 타입의 `stage_id`도 `qa_environment_id`로 변경.

- [ ] **Step 3: 훅 갱신**

`useTaxonomyAttributes` (라인 246–259)를 제거하고 다음 두 훅으로 교체:

```typescript
export function useTaxonomyEventProperties(projectId: string) {
  return useQuery({
    queryKey: ["taxonomy-event-properties", projectId],
    queryFn: async () => {
      const { data, error } = await db
        .from("taxonomy_event_properties")
        .select("*, taxonomy_events!inner(project_id)")
        .eq("taxonomy_events.project_id", projectId)
        .order("sort_order");
      if (error) throw error;
      return data as TaxonomyEventProperty[];
    },
    enabled: !!projectId,
  });
}

export function useTaxonomyCustomAttributes(projectId: string) {
  return useQuery({
    queryKey: ["taxonomy-custom-attributes", projectId],
    queryFn: async () => {
      const { data, error } = await db
        .from("taxonomy_custom_attributes")
        .select("*")
        .eq("project_id", projectId)
        .order("sort_order");
      if (error) throw error;
      return data as TaxonomyCustomAttribute[];
    },
    enabled: !!projectId,
  });
}
```

`useStages` → `useEnvironments`로 이름 변경(내부 `.from("qa_stages")` → `.from("qa_environments")`). `useUploads`/`useRuns`의 `.eq("stage_id", stageId)` → `.eq("qa_environment_id", environmentId)`로 변경, 파라미터명도 `environmentId`로.

`buildCoverageItems`, `statusKey`, `stageCoverage`(→`environmentCoverage`로 이름 변경 권장)는 `attribute_id` 참조를 `property_id`/`custom_attribute_id` 조합으로 갱신 — `statusKey`는 다음으로 교체:

```typescript
export function statusKey(row: { event_id: string | null; property_id: string | null; custom_attribute_id: string | null }) {
  if (row.event_id) return `event:${row.event_id}`;
  if (row.property_id) return `property:${row.property_id}`;
  return `attribute:${row.custom_attribute_id}`;
}
```

- [ ] **Step 4: 검증 및 커밋**

Run: `npx tsc --noEmit`
Expected: 이 시점에서는 다른 컴포넌트 파일들이 아직 옛 타입/훅을 참조해 에러가 날 수 있음 — 그건 다음 태스크에서 고친다. `queries.ts` 자체 내부에서는 타입 에러가 없어야 한다.

```bash
git add src/integrations/supabase/types.ts src/lib/queries.ts
git commit -m "Regenerate types and update queries.ts for split taxonomy tables"
```

---

### Task 10: 컴포넌트 갱신 (환경 매니저, 택소노미 탭, 임포트, 규칙 탭)

**Files:**
- Modify: `src/components/app/stages-manager.tsx`
- Modify: `src/components/app/taxonomy-tab.tsx`
- Modify: `src/components/app/taxonomy-import.tsx`
- Modify: `src/components/app/rules-tab.tsx`

- [ ] **Step 1: `stages-manager.tsx`**

`import type { QaStage }` → `import type { QaEnvironment }`, 모든 `QaStage` 참조를 `QaEnvironment`로, `db.from("qa_stages")` 3곳(라인 72, 84, 100)을 `db.from("qa_environments")`로 치환.

- [ ] **Step 2: `taxonomy-tab.tsx`**

`import { TaxonomyAttribute, TaxonomyEvent }` → `import { TaxonomyEventProperty, TaxonomyCustomAttribute, TaxonomyEvent }`. `attrsByEvent`(라인 71–80)는 이제 `properties` prop(타입 `TaxonomyEventProperty[]`)에서 `p.event_id`로 그룹핑. `userAttributes = attributes.filter((a) => !a.event_id)`(라인 82)는 그냥 `customAttributes` prop을 직접 쓰도록 교체(더 이상 필터링 불필요, 이미 분리된 테이블이므로). `db.from("taxonomy_attributes")` 3곳(라인 101–106 삭제, 480–484 업데이트/삽입)을 대상에 따라 `db.from("taxonomy_event_properties")` 또는 `db.from("taxonomy_custom_attributes")`로 분기. `toggleActive(table, id, value)`(라인 108–116)의 `table` 파라미터 타입을 `"taxonomy_events" | "taxonomy_event_properties" | "taxonomy_custom_attributes"`로 확장, 호출부(라인 192, 224, 248) 갱신.

- [ ] **Step 3: `taxonomy-import.tsx`**

`import { TaxonomyAttribute, TaxonomyEvent }` → `import { TaxonomyEventProperty, TaxonomyCustomAttribute, TaxonomyEvent }`. `existingAttrs`(라인 46–47)를 이벤트 프로퍼티용/커스텀 속성용 두 개의 맵으로 분리. `db.from("taxonomy_attributes").insert(newAttrs...)`(라인 76–78, 이벤트 프로퍼티)를 `db.from("taxonomy_event_properties").insert(...)`로, `db.from("taxonomy_attributes").insert(newUserAttrs...)`(라인 89–91, 유저 속성)를 `db.from("taxonomy_custom_attributes").insert(...)`로 분리 — 후자는 `event_id` 필드 없이 `project_id`만 포함.

- [ ] **Step 4: `rules-tab.tsx`**

`import { TaxonomyAttribute, TaxonomyEvent, ValidationRule }` → `import { TaxonomyEventProperty, TaxonomyCustomAttribute, TaxonomyEvent, ValidationRule }`. `target(rule)`(라인 103–111)이 읽던 `rule.attribute_id`/`attr?.event_id`를 `rule.property_id`(있으면 그 property의 event 조회) 또는 `rule.custom_attribute_id`로 분기. `RuleDialog`의 `targetKey` 처리(라인 280–318)를 `event:<id>` / `property:<id>` / `attribute:<id>` / `none` 네 가지로 확장하고, payload는 `property_id`/`custom_attribute_id`/`event_id`를 조합에 맞게 채운다(둘 다 채우지 않도록 — DB CHECK 제약과 동일한 규칙을 클라이언트에서도 지킨다).

- [ ] **Step 5: 검증**

Run: `npx tsc --noEmit`
Expected: 이 네 파일 관련 에러 사라짐. 남은 에러가 있다면 라우트 파일(다음 태스크)에서 발생하는 것.

- [ ] **Step 6: 커밋**

```bash
git add src/components/app/stages-manager.tsx src/components/app/taxonomy-tab.tsx src/components/app/taxonomy-import.tsx src/components/app/rules-tab.tsx
git commit -m "Update taxonomy/rules components for split attribute tables and qa_environments rename"
```

---

### Task 11: 라우트 갱신 (`qa/$stageSlug.tsx`, 프로젝트 shell, 대시보드, 워크스페이스 인덱스)

**Files:**
- Modify: `src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug.tsx`
- Modify: `src/routes/_authenticated/w/$wsId/p/$projectId/route.tsx`
- Modify: `src/routes/_authenticated/w/$wsId/p/$projectId/index.tsx`
- Modify: `src/routes/_authenticated/w/$wsId/index.tsx`
- Modify: `src/routes/_authenticated/w/$wsId/p/$projectId/taxonomy.tsx`

- [ ] **Step 1: `qa/$stageSlug.tsx`**

`useStages` → `useEnvironments`, `stages` → `environments`, `stage` → `environment`(변수명 일관 변경). `setStatus()`(라인 150–166)의 payload를 `qa_environment_id: environment.id, event_id, property_id, custom_attribute_id`로 확장(대상 종류에 따라 셋 중 하나만 채움). `db.from("qa_item_status").upsert(payload, { onConflict: "qa_environment_id,event_id,property_id,custom_attribute_id" })`로 `onConflict` 문자열도 갱신. `qa_uploads`/`qa_analysis_runs` insert의 `stage_id` 키를 `qa_environment_id`로 변경.

- [ ] **Step 2: `route.tsx`**

`useStages` → `useEnvironments`. "QA 환경 관리" 버튼(라인 86–88)은 라벨이 이미 맞으므로 그대로. `TabLink`(라인 99–107)의 `stageSlug` 파라미터명은 라우트 파일명이 바뀌지 않는 한 유지 가능하나, 일관성을 위해 여기서는 변수명만 `environment.slug`/`environment.name`으로 갱신(라우트 경로 문자열 `/qa/$stageSlug` 자체는 변경하지 않음 — URL 구조 변경은 별도 후속 과제로 남긴다).

- [ ] **Step 3: `index.tsx` (대시보드)**

`useStages` → `useEnvironments`, `stageById` → `environmentById`, `issues` 계산에서 `s.stage_id` → `s.qa_environment_id`. `stageCoverage` 호출을 `environmentCoverage`로 이름 변경(Task 9에서 정의).

- [ ] **Step 4: 워크스페이스 인덱스**

`db.from("taxonomy_attributes")`(라인 72–73)를 `db.from("taxonomy_event_properties")`와 `db.from("taxonomy_custom_attributes")` 두 개의 쿼리로 분리해 카운트를 합산.

- [ ] **Step 5: `taxonomy.tsx`**

`useTaxonomyAttributes` → `useTaxonomyEventProperties` + `useTaxonomyCustomAttributes`로 교체하고 `<TaxonomyTab>`/`<RulesTab>`에 각각 새 props로 전달.

- [ ] **Step 6: routeTree 재생성 + 검증**

Run: `npx tsc --noEmit`
Expected: 전체 컴파일 에러 0.

- [ ] **Step 7: 커밋**

```bash
git add src/routes/_authenticated/w/\$wsId/
git commit -m "Update routes for qa_environments rename and split attribute tables"
```

---

### Task 12: QA 라운드 목록 + 체크리스트 조회 UI (최소 버전)

**Files:**
- Create: `src/lib/qa-rounds-queries.ts`
- Create: `src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/rounds.tsx`

- [ ] **Step 1: 쿼리 훅 작성** (`src/lib/qa-rounds-queries.ts`)

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export type QaRound = {
  id: string;
  project_id: string;
  qa_environment_id: string;
  round_number: number;
  previous_round_id: string | null;
  started_by: string;
  started_at: string;
  ended_at: string | null;
};

export type QaChecklistItem = {
  id: string;
  qa_round_id: string;
  target_type: "event" | "custom_attribute";
  target_id: string;
};

export type QaChecklistItemResult = {
  id: string;
  checklist_item_id: string;
  ai_verdict: "passed" | "failed" | "not_collected" | null;
  ai_reasoning: string | null;
  ai_evidence: unknown;
  failed_layer: "existence" | "structural" | "qualitative" | null;
  final_status: "passed" | "failed" | "not_collected";
  overridden_by: string | null;
  overridden_at: string | null;
  override_reason: string | null;
};

export function useQaRounds(environmentId: string) {
  return useQuery({
    queryKey: ["qa-rounds", environmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from("qa_rounds")
        .select("*")
        .eq("qa_environment_id", environmentId)
        .order("round_number", { ascending: false });
      if (error) throw error;
      return data as QaRound[];
    },
    enabled: !!environmentId,
  });
}

export function useQaChecklistItems(roundId: string) {
  return useQuery({
    queryKey: ["qa-checklist-items", roundId],
    queryFn: async () => {
      const { data, error } = await db
        .from("qa_round_checklist_items")
        .select("*, qa_checklist_item_results(*)")
        .eq("qa_round_id", roundId);
      if (error) throw error;
      return data as (QaChecklistItem & { qa_checklist_item_results: QaChecklistItemResult[] })[];
    },
    enabled: !!roundId,
  });
}

export function useCreateQaRound(projectId: string, environmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      previousRoundId,
      eventIds,
      customAttributeIds,
    }: {
      userId: string;
      previousRoundId: string | null;
      eventIds: string[];
      customAttributeIds: string[];
    }) => {
      const { data: prevRounds, error: countError } = await db
        .from("qa_rounds")
        .select("round_number")
        .eq("qa_environment_id", environmentId)
        .order("round_number", { ascending: false })
        .limit(1);
      if (countError) throw countError;
      const nextNumber = (prevRounds?.[0]?.round_number ?? 0) + 1;

      const { data: round, error: roundError } = await db
        .from("qa_rounds")
        .insert({
          project_id: projectId,
          qa_environment_id: environmentId,
          round_number: nextNumber,
          previous_round_id: previousRoundId,
          started_by: userId,
        })
        .select()
        .single();
      if (roundError) throw roundError;

      const items = [
        ...eventIds.map((id) => ({ qa_round_id: round.id, target_type: "event", target_id: id })),
        ...customAttributeIds.map((id) => ({ qa_round_id: round.id, target_type: "custom_attribute", target_id: id })),
      ];
      if (items.length > 0) {
        const { error: itemsError } = await db.from("qa_round_checklist_items").insert(items);
        if (itemsError) throw itemsError;
      }
      return round as QaRound;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-rounds", environmentId] });
    },
  });
}

export function useOverrideChecklistResult() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      resultId,
      finalStatus,
      overriddenBy,
      overrideReason,
    }: {
      resultId: string;
      finalStatus: "passed" | "failed" | "not_collected";
      overriddenBy: string;
      overrideReason: string;
    }) => {
      const { error } = await db
        .from("qa_checklist_item_results")
        .update({
          final_status: finalStatus,
          overridden_by: overriddenBy,
          overridden_at: new Date().toISOString(),
          override_reason: overrideReason,
        })
        .eq("id", resultId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-checklist-items"] });
    },
  });
}
```

- [ ] **Step 2: 라운드 목록 + 생성 + 체크리스트 표시 라우트 작성** (`rounds.tsx`)

```tsx
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useEnvironments, useTaxonomyEvents, useTaxonomyCustomAttributes } from "@/lib/queries";
import {
  useQaRounds,
  useQaChecklistItems,
  useCreateQaRound,
  useOverrideChecklistResult,
} from "@/lib/qa-rounds-queries";

export const Route = createFileRoute(
  "/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/rounds"
)({
  component: RoundsPage,
});

function RoundsPage() {
  const { wsId, projectId, stageSlug } = useParams({
    from: "/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/rounds",
  });
  const { user } = useAuth();
  const { data: environments } = useEnvironments(projectId);
  const environment = environments?.find((e) => e.slug === stageSlug);
  const { data: events } = useTaxonomyEvents(projectId);
  const { data: customAttributes } = useTaxonomyCustomAttributes(projectId);
  const { data: rounds } = useQaRounds(environment?.id ?? "");
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const activeRoundId = selectedRoundId ?? rounds?.[0]?.id ?? "";
  const { data: checklistItems } = useQaChecklistItems(activeRoundId);
  const createRound = useCreateQaRound(projectId, environment?.id ?? "");
  const override = useOverrideChecklistResult();

  if (!environment) return null;

  const handleCreateRound = () => {
    if (!user) return;
    const latestRound = rounds?.[0];
    const isFirstRound = !latestRound;
    const eventIds = isFirstRound ? (events ?? []).map((e) => e.id) : [];
    const customAttributeIds = isFirstRound ? (customAttributes ?? []).map((a) => a.id) : [];
    createRound.mutate({
      userId: user.id,
      previousRoundId: latestRound?.id ?? null,
      eventIds,
      customAttributeIds,
    });
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{environment.name} QA 라운드</h1>
        <button
          onClick={handleCreateRound}
          disabled={createRound.isPending}
          className="rounded bg-primary px-4 py-2 text-primary-foreground"
        >
          새 라운드 시작
        </button>
      </div>

      <div className="flex gap-2">
        {(rounds ?? []).map((r) => (
          <button
            key={r.id}
            onClick={() => setSelectedRoundId(r.id)}
            className={`rounded border px-3 py-1 ${r.id === activeRoundId ? "bg-muted" : ""}`}
          >
            {r.round_number}차
          </button>
        ))}
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">대상</th>
            <th className="p-2">AI 판정</th>
            <th className="p-2">실패 원인</th>
            <th className="p-2">최종 상태</th>
            <th className="p-2">액션</th>
          </tr>
        </thead>
        <tbody>
          {(checklistItems ?? []).map((item) => {
            const result = item.qa_checklist_item_results?.[0];
            const label =
              item.target_type === "event"
                ? events?.find((e) => e.id === item.target_id)?.technical_name
                : customAttributes?.find((a) => a.id === item.target_id)?.technical_name;
            return (
              <tr key={item.id} className="border-b">
                <td className="p-2">{label ?? item.target_id}</td>
                <td className="p-2">{result?.ai_verdict ?? "미실행"}</td>
                <td className="p-2">{result?.failed_layer ?? "-"}</td>
                <td className="p-2">{result?.final_status ?? "not_collected"}</td>
                <td className="p-2">
                  {result && (
                    <button
                      className="text-sm text-destructive underline"
                      onClick={() =>
                        user &&
                        override.mutate({
                          resultId: result.id,
                          finalStatus: "failed",
                          overriddenBy: user.id,
                          overrideReason: "수동 검토 결과 오류로 재분류",
                        })
                      }
                    >
                      오류로 수정
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: `route.tsx`에 라운드 탭 링크 추가**

`src/routes/_authenticated/w/$wsId/p/$projectId/route.tsx`의 환경별 `TabLink` 옆에, 각 환경에 대해 라운드 페이지로 가는 링크를 추가로 렌더링(예: 기존 스테이지 탭 블록 바로 아래에 `<TabLink to="/w/$wsId/p/$projectId/qa/$stageSlug/rounds" params={{ wsId, projectId, stageSlug: environment.slug }}>{environment.name} 라운드</TabLink>` 형태로).

- [ ] **Step 4: 라우트 트리 재생성**

Run: `npm run dev` 를 백그라운드로 잠깐 띄우면 TanStack Router 플러그인이 `routeTree.gen.ts`를 자동 재생성한다. 재생성 완료 후 dev 서버를 멈추고 `git status`로 `src/routeTree.gen.ts` 변경 확인.

- [ ] **Step 5: 검증 및 커밋**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

```bash
git add src/lib/qa-rounds-queries.ts src/routes/_authenticated/w/\$wsId/p/\$projectId/qa/\$stageSlug/rounds.tsx src/routeTree.gen.ts src/routes/_authenticated/w/\$wsId/p/\$projectId/route.tsx
git commit -m "Add minimal QA rounds/checklist UI"
```

---

### Task 13: 프로젝트 Attribute API 설정 UI (마스킹 포함)

**Files:**
- Modify: `src/routes/_authenticated/w/$wsId/p/$projectId/route.tsx` (설정 진입점) 또는 신규 `src/components/app/attribute-api-settings.tsx`
- Create: `src/components/app/attribute-api-settings.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export function AttributeApiSettings({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["attribute-api-settings", projectId],
    queryFn: async () => {
      const { data, error } = await db
        .from("project_attribute_api_settings")
        .select("project_id, base_url, user_id_param_name, updated_at")
        .eq("project_id", projectId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [baseUrl, setBaseUrl] = useState(data?.base_url ?? "");
  const [paramName, setParamName] = useState(data?.user_id_param_name ?? "user_id");
  const [secretInput, setSecretInput] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        project_id: projectId,
        base_url: baseUrl,
        user_id_param_name: paramName,
        updated_at: new Date().toISOString(),
      };
      if (secretInput) payload.auth_secret = secretInput;
      const { error } = await db
        .from("project_attribute_api_settings")
        .upsert(payload, { onConflict: "project_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      setSecretInput("");
      qc.invalidateQueries({ queryKey: ["attribute-api-settings", projectId] });
    },
  });

  return (
    <div className="space-y-3 rounded border p-4">
      <h3 className="font-medium">Attribute API 설정</h3>
      <label className="block text-sm">
        API 서버 주소
        <input
          className="mt-1 w-full rounded border p-2"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.client.com/attributes"
        />
      </label>
      <label className="block text-sm">
        user_id 파라미터명
        <input
          className="mt-1 w-full rounded border p-2"
          value={paramName}
          onChange={(e) => setParamName(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        인증 토큰 (재입력 시에만 교체됨, 현재 값은 표시되지 않아요)
        <input
          type="password"
          className="mt-1 w-full rounded border p-2"
          value={secretInput}
          onChange={(e) => setSecretInput(e.target.value)}
          placeholder="새 토큰을 입력하세요"
        />
      </label>
      <button
        className="rounded bg-primary px-4 py-2 text-primary-foreground"
        onClick={() => save.mutate()}
        disabled={save.isPending}
      >
        저장
      </button>
    </div>
  );
}
```

- [ ] **Step 2: 설정 화면에 배치**

`src/routes/_authenticated/w/$wsId/p/$projectId/route.tsx`의 프로젝트 설정 진입 지점(기존 "QA 환경 관리" 다이얼로그 옆)에 `<AttributeApiSettings projectId={projectId} />`를 조건부로 렌더링하는 버튼/다이얼로그를 추가한다(기존 `StagesManager` 다이얼로그 열고 닫는 패턴을 그대로 재사용).

- [ ] **Step 3: 검증 및 커밋**

Run: `npx tsc --noEmit`

```bash
git add src/components/app/attribute-api-settings.tsx src/routes/_authenticated/w/\$wsId/p/\$projectId/route.tsx
git commit -m "Add project attribute API settings UI with masked secret input"
```

---

### Task 14: 최종 빌드 검증 + 로컬 서버 확인

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 타입체크**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 2: 빌드**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 3: 린트 (변경 파일만)**

Run: `npx eslint src/lib/queries.ts src/lib/qa-rounds-queries.ts src/components/app/stages-manager.tsx src/components/app/taxonomy-tab.tsx src/components/app/taxonomy-import.tsx src/components/app/rules-tab.tsx src/components/app/attribute-api-settings.tsx`
Expected: 새로 만든 코드에는 에러 없음(리포 전체의 기존 포매팅 에러는 무시).

- [ ] **Step 4: dev 서버로 수동 확인**

Run: `npm run dev`
브라우저로 `http://localhost:8080/w/<wsId>/p/<projectId>/qa/<envSlug>/rounds`에 접속해 "새 라운드 시작" → 1차 체크리스트가 전체 이벤트/attribute로 자동 채워지는지 확인. `project_attribute_api_settings` 저장 후 새로고침 시 `base_url`은 보이고 `auth_secret`은 응답에 아예 없는지 네트워크 탭에서 확인.

- [ ] **Step 5: 커밋 (있다면 남은 변경사항)**

```bash
git status
# 변경 사항 있으면 add + commit
```

---

## 남은 질문 (다음 단계 과제, 이번 플랜 범위 밖)

- **AI 판정 엔진 실제 연동**: 이번 플랜은 `qa_checklist_item_results`를 사람이 수동으로 채우거나 override하는 것까지만 다룬다. 실제로 레이어2(구조 검증)를 자동 계산하는 함수와, 레이어3(AI 정성 판단)을 위한 LLM API 호출은 별도 플랜으로 분리 — API 키/프롬프트 설계가 필요하다.
- **`qa_attribute_snapshots` 실제 캡처 트리거**: `project_attribute_api_settings`에 저장된 `auth_secret`을 사용해 실제로 외부 API를 호출하는 `SECURITY DEFINER` RPC 또는 엣지 함수는 이번 플랜에 포함하지 않는다.
- **CSV 업로드 파서 교체**: `qa_run_events` CSV(EVENT_ID/USER_ID/TIME/NAME/PROPERTIES) 업로드 UI/파서는 이번 플랜에 없다 — 기존 `qa/$stageSlug.tsx`의 커버리지-체크 CSV 업로드와는 별개 기능이므로 후속 태스크로 분리.
- **논의(Discussion) UI**: 스키마만 만들고, 실제 댓글 작성/조회 UI는 이번 플랜 범위 밖.
- **URL 구조**: `qa/$stageSlug` 세그먼트명은 이번에 변경하지 않았다(라우트 파일명 변경은 브레이킹 체인지라 별도 검토 필요).
