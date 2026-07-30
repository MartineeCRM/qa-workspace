# Tracking Taxonomy / QA 스키마 재구성 + 검증 워크플로우 설계

- 날짜: 2026-07-30
- 상태: 승인됨 (구현 계획 단계로 진행)

## 배경

현재 스키마는 `workspaces → projects → taxonomy_events/taxonomy_attributes → validation_rules → qa_stages → qa_uploads/qa_analysis_runs/qa_item_status` 구조다. `taxonomy_attributes`는 이벤트-스코프와 유저-스코프 속성이 하나의 테이블에 섞여 있고(`event_id`가 nullable), `qa_stages`는 QA *환경*(개발/운영)을 의미하는데 이번에 도입하려는 "이벤트 여정 그룹핑" 개념과 이름이 충돌한다.

또한 고객사(마티니 팀)의 실제 QA 업무는 다음을 필요로 한다:
- 테스터가 앱에서 수행한 행동이 Braze로 명세(taxonomy)에 맞게 로그가 들어오는지 검증
- 이벤트 발생이 특정 유저 attribute의 변화를 유발하는 경우, 그 인과관계도 검증
- 클라이언트의 attribute 조회 API는 "현재 상태"만 제공하고 히스토리가 없으므로, QA 세션 중 시점별로 attribute 상태를 스냅샷으로 캡처해서 비교해야 함
- 이 모든 판정을 AI가 근거와 함께 자동으로 수행하되, 사람이 검토/수정할 수 있어야 함
- 애매하거나 오류로 판단된 항목은 논의(discussion)로 넘어가고, 논의 종결 히스토리가 남아야 함
- 진행률을 이벤트/attribute 단위로 집계해서 보여줘야 함
- 검증은 차수(라운드) 단위로 진행되며, 1차는 전체 검증, 이후 차수는 이전 차수의 실패/미수집/논의중 항목만 자동 승계

이 문서는 taxonomy 스키마 재구성과, 이 QA 검증 워크플로우 전체(체크리스트 → 실행 로그/스냅샷 수집 → AI 판정 → 사람 검토 → 논의 → 차수 승계 → 진행률)를 함께 설계한다.

## 목표

- `taxonomy_attributes`를 이벤트-스코프(`taxonomy_event_properties`)와 유저-스코프(`taxonomy_custom_attributes`)로 분리한다.
- 이벤트를 사용자 여정 단위로 그룹핑하는 `taxonomy_categories`를 새로 도입한다.
- `qa_stages`(QA 환경 개념)를 `qa_environments`로 개명해 새 taxonomy 그룹핑 개념과의 혼동을 없앤다.
- QA 세션("차수", `qa_rounds`) 동안 발생한 이벤트 로그(`qa_run_events`)와 attribute 스냅샷(`qa_attribute_snapshots`)을 시간순으로 수집한다.
- 차수마다 검증할 이벤트/attribute를 체크리스트(`qa_round_checklist_items`)로 선정하고, 3단계 평가 모델(수집여부 → 구조 검증 → AI 정성 판단)로 판정한다.
- 판정 결과에 근거(로그/스냅샷)와 이유를 함께 기록하고, 사람이 덮어쓸 수 있게 한다.
- 오류·애매 항목을 논의 스레드로 관리하고 종결 히스토리를 남긴다.
- 차수 간 실패/미수집/미종결 항목을 자동 승계한다.

## 비범위 (Out of scope)

- Workspace 개념 제거/평탄화 (별도 후속 프로젝트로 진행 — `feature/per-user-auth` 브랜치가 이 개념 위에 지어져 있어, 먼저 병합 후 후속 작업으로 분리)
- 다중 이벤트/다중 attribute를 엮는 상관관계 규칙 (예: 여러 `add_to_cart` 이벤트 금액 합 = `cart_total` attribute)
- severity/우선순위 필드
- 기존 `qa_uploads`/`qa_analysis_runs`(CSV 커버리지 체크) 기능 자체의 변경 — 이번 재구성과 무관하게 로직은 그대로 두되, 참조하는 테이블명이 바뀌는 만큼 컬럼/FK는 따라간다.

## 스키마 변경 사항

### 1. Taxonomy 구조

```sql
taxonomy_categories (
  id, project_id, name, description, sort_order
)

taxonomy_events (
  -- 기존 컬럼 유지
  + category_id  -- nullable FK taxonomy_categories
)

taxonomy_event_properties (
  -- 구 taxonomy_attributes 중 event_id가 not null인 행들
  id, event_id NOT NULL,  -- FK taxonomy_events
  technical_name, data_type, required, allow_empty, enum(allowed_values), description
)

taxonomy_custom_attributes (
  -- 구 taxonomy_attributes 중 event_id가 null이던 행들 (유저 레벨)
  id, project_id,
  technical_name, data_type, required, allow_empty, enum(allowed_values), description
)
```

`taxonomy_attributes`는 마이그레이션 후 제거한다. 기존 데이터는 `event_id IS NOT NULL` → `taxonomy_event_properties`, `event_id IS NULL` → `taxonomy_custom_attributes`로 분배한다.

### 2. QA 환경 개명

```sql
-- qa_stages → qa_environments로 테이블명 변경
-- 참조하는 모든 FK/컬럼(qa_uploads.stage_id, qa_analysis_runs.stage_id, qa_item_status.stage_id 등)도
-- qa_environment_id로 개명해 일관성을 맞춘다.
```

기능(개발 QA/운영 QA 구분, CSV 업로드·커버리지 체크 흐름)은 변경하지 않는다.

### 3. QA 실행 & 데이터 수집 (신규)

```sql
qa_rounds (  -- "차수"
  id, project_id, qa_environment_id,
  round_number int,
  previous_round_id uuid REFERENCES qa_rounds(id),  -- 1차는 null
  started_by, started_at, ended_at
)

qa_run_events (  -- 원본 로그 CSV 업로드 결과 (EVENT_ID/USER_ID/TIME/NAME/PROPERTIES 컬럼)
  id, qa_round_id REFERENCES qa_rounds(id),
  event_id REFERENCES taxonomy_events(id),  -- NAME 매칭 실패 시 null
  raw_event_name text,
  occurred_at timestamptz,
  external_user_id text,  -- 클라이언트 시스템의 실제 유저 ID (Trackspec 계정 아님)
  raw_properties jsonb
)

qa_attribute_snapshots (  -- 외부 API 호출로 시점별 attribute 상태 캡처
  id, qa_round_id REFERENCES qa_rounds(id),
  external_user_id text,
  snapshot_name text,
  status text CHECK (status IN ('requesting','captured','failed')),
  payload jsonb,
  previous_snapshot_id uuid REFERENCES qa_attribute_snapshots(id),
  requested_at timestamptz, captured_at timestamptz
)
```

`qa_run_events`와 `qa_attribute_snapshots`는 `occurred_at`/`captured_at` 기준으로 병합해 하나의 타임라인으로 재구성할 수 있다 — "이 이벤트 이후 이 attribute가 어떻게 바뀌었는가"를 판정하는 근거가 된다.

### 4. 체크리스트 & 차수 승계 (신규)

```sql
qa_round_checklist_items (
  id, qa_round_id REFERENCES qa_rounds(id),
  target_type text CHECK (target_type IN ('event','custom_attribute')),
  target_id uuid  -- taxonomy_events.id 또는 taxonomy_custom_attributes.id
)
```

**자동 구성 규칙:**
- 1차(`previous_round_id IS NULL`): 프로젝트의 모든 `taxonomy_events` + `taxonomy_custom_attributes`를 자동 포함
- N차(N>1): (N-1)차의 `qa_checklist_item_results` 중 `final_status IN ('failed','not_collected')`이거나 연결된 `qa_discussions.status = 'open'`인 항목만 자동 승계

### 5. Validation Rules 재구성

```sql
-- validation_rules 재구성 (기존 event_id/attribute_id 참조 → 아래로 교체)
validation_rules (
  id,
  event_id uuid REFERENCES taxonomy_events(id),            -- nullable
  property_id uuid REFERENCES taxonomy_event_properties(id), -- nullable
  custom_attribute_id uuid REFERENCES taxonomy_custom_attributes(id), -- nullable
  description text,   -- AI가 읽는 정성적 판단 기준 (타입/enum/필수여부는 여기 안 들어감)
  is_enabled boolean
)
CHECK (NOT (property_id IS NOT NULL AND custom_attribute_id IS NOT NULL))
```

**대상 조합 의미:**
| 설정된 컬럼 | 의미 |
|---|---|
| `property_id`만 | 특정 이벤트의 특정 프로퍼티에 대한 정성적 규칙 (이벤트는 property_id로 유도됨) |
| `custom_attribute_id`만 | 유저 attribute에 대한 정성적 규칙 |
| `event_id` + `custom_attribute_id` | "이 이벤트 이후 이 attribute가 이렇게 바뀌어야 한다"는 인과관계 규칙 |
| `event_id`만 | 이벤트 자체에 대한 일반 규칙 |

`qa_item_status`(기존 CSV 커버리지 체크용)도 동일한 3-컬럼 패턴(`event_id`+`property_id`+`custom_attribute_id`)으로 확장한다 — 단, 이건 AI 판정용이 아니라 기존 존재-여부 체크용으로 그대로 사용된다.

### 6. 판정 결과 — 3단계 평가 모델

```sql
qa_checklist_item_results (
  id, checklist_item_id REFERENCES qa_round_checklist_items(id),
  ai_verdict text CHECK (ai_verdict IN ('passed','failed','not_collected')),
  ai_reasoning text,
  ai_evidence jsonb,          -- 판단에 사용한 qa_run_events/qa_attribute_snapshots 참조
  failed_layer text CHECK (failed_layer IN ('existence','structural','qualitative')), -- failed일 때만
  final_status text CHECK (final_status IN ('passed','failed','not_collected')),  -- 기본값 = ai_verdict
  overridden_by uuid REFERENCES profiles(id),
  overridden_at timestamptz,
  override_reason text
)
```

**평가 순서:**
1. **레이어1 (수집여부)**: 대상 이벤트/attribute가 `qa_run_events`/`qa_attribute_snapshots`에 아예 없으면 `not_collected`로 확정, 이후 레이어 평가 안 함.
2. **레이어2 (구조 검증, 결정론적)**: `taxonomy_event_properties`/`taxonomy_custom_attributes`의 `data_type`/`allowed_values`/`required` 기준으로 타입·enum·필수여부 체크. 실패 시 `failed` + `failed_layer='structural'`로 확정, 레이어3 평가 안 함.
3. **레이어3 (정성적 검증, AI)**: 레이어2를 통과한 경우에만 진행. 연결된 `validation_rules.description`이 있으면 AI가 실제 값/변화의 의미를 판단(예: 상품명 자리에 상품번호가 온 경우). 규칙이 없으면 자동 통과. 실패 시 `failed` + `failed_layer='qualitative'`.

`final_status`는 기본적으로 `ai_verdict`와 같지만, 사람이 검토 후 덮어쓸 수 있다(통과 판정도 나중에 오류로 수정 가능) — 이때 `overridden_by`/`overridden_at`/`override_reason`이 채워진다.

### 7. 프로젝트별 Attribute API 설정 (신규)

`qa_attribute_snapshots` 캡처는 프로젝트마다 다른 서버(클라이언트의 attribute 조회 API)를 호출한다. 호출 시 사용하는 `user_id` 파라미터명도 프로젝트마다 다를 수 있어, 둘 다 프로젝트 설정 화면에서 변경 가능해야 한다.

```sql
project_attribute_api_settings (
  project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  base_url text NOT NULL,
  user_id_param_name text NOT NULL DEFAULT 'user_id',  -- 실제 API가 기대하는 파라미터명 (예: external_id, customer_id 등)
  auth_secret text,   -- API 인증 토큰/키. 평문 저장 금지 원칙에 따라 아래 보안 고려사항 참조
  updated_by uuid REFERENCES profiles(id),
  updated_at timestamptz
)
```

**보안 고려사항:**
- `auth_secret`은 클라이언트에서 직접 SELECT 불가하도록 RLS로 차단하고, 스냅샷 캡처 요청은 이 값을 서버 측 `SECURITY DEFINER` 함수/엣지 함수 안에서만 읽어 외부 API 호출에 사용한다 — UI에는 절대 평문으로 반환하지 않는다.
- 설정 화면에서 값을 표시할 땐 항상 마스킹(`sk-****1234` 형태)하고, 재입력 시에만 새 값으로 교체한다.
- 회사 보안 정책상 이런 인증정보는 코드/마이그레이션에 하드코딩하지 않고, 반드시 이 테이블(또는 Supabase Vault 같은 시크릿 스토어)을 통해서만 다룬다.

### 9. 논의(Discussion) 추적

```sql
qa_discussions (
  id, checklist_item_result_id REFERENCES qa_checklist_item_results(id),
  status text CHECK (status IN ('open','resolved')),
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz
)

qa_discussion_comments (
  id, discussion_id REFERENCES qa_discussions(id),
  author_id uuid REFERENCES profiles(id),
  body text,
  is_resolution boolean,  -- "이래서 종결됨"을 표시하는 코멘트
  created_at timestamptz
)
```

여러 논의가 동시에 열려 있을 수 있고, 각각 팔로업 코멘트가 쌓인다. `is_resolution=true`인 코멘트가 달리면 `qa_discussions.status`를 `resolved`로 전환 — 이후 언제/어떤 근거로 종결됐는지 영구 기록이 남는다.

### 10. 진행률 집계

별도 테이블 없이 `qa_round_checklist_items` + `qa_checklist_item_results`를 조인한 쿼리/뷰로 계산:
- 차수 전체 진행률: `passed / (passed+failed+not_collected)` 등
- 이벤트별·attribute별 breakdown
- `failed_layer`별 분류(미수집/구조오류/판단오류)
- open discussion 개수

## 기존 스키마와의 관계 요약

| 기존 | 변경 후 |
|---|---|
| `workspaces`, `projects` | 변경 없음 |
| `qa_stages` | → `qa_environments` (개명, 기능 동일) |
| `taxonomy_attributes` | → `taxonomy_event_properties` + `taxonomy_custom_attributes` (분리) |
| (없음) | `taxonomy_categories` (신규) |
| `validation_rules` | 재구성 (event_id/attribute_id → event_id/property_id/custom_attribute_id + description) |
| `qa_item_status` | 컬럼 확장 (동일 3-컬럼 패턴), 기능 동일 |
| `qa_uploads`, `qa_analysis_runs` | 변경 없음 (참조 컬럼명만 qa_environment_id로 개명) |
| (없음) | `qa_rounds`, `qa_run_events`, `qa_attribute_snapshots`, `qa_round_checklist_items`, `qa_checklist_item_results`, `qa_discussions`, `qa_discussion_comments`, `project_attribute_api_settings` (전부 신규) |

## 마이그레이션 순서 고려사항

- 이 스키마 작업은 `feature/per-user-auth` 브랜치와 별개로 진행하되, **먼저 auth 브랜치를 병합한 뒤** 이 작업을 시작한다(라이브 DB에 두 개의 대규모 마이그레이션 세트가 동시에 진행되는 걸 피하기 위함).
- `taxonomy_attributes` 분리 마이그레이션은 기존 데이터가 있으므로 데이터 이관 스크립트가 필요하다(event_id 유무로 분배).
- `qa_stages` → `qa_environments` 개명은 다수의 앱 코드(라우트, 훅, 컴포넌트)가 참조하므로 리네임 범위가 넓다 — 별도 태스크로 분리해 컴파일 에러를 놓치지 않도록 한다.
- RLS 정책은 새 테이블 전부에 workspace_id 기반 접근 통제(`ws_of_project` 등 기존 헬퍼 재사용)를 적용한다.

## 테스트 계획

- 1차 차수 생성 시 프로젝트의 모든 이벤트/attribute가 체크리스트에 자동 포함되는지
- CSV 업로드 시 EVENT_ID/USER_ID/TIME/NAME/PROPERTIES가 `qa_run_events`로 올바르게 파싱되는지, NAME 매칭 실패 시 event_id가 null로 남는지
- attribute 스냅샷 캡처 후 이전 스냅샷과 diff가 되는지
- 레이어1→2→3 순서대로 평가가 중단되는지(레이어1 실패 시 레이어2/3 스킵 등)
- 사람이 `final_status`를 덮어쓰면 override 컬럼들이 채워지는지
- 논의 생성 → 코멘트 추가 → `is_resolution` 코멘트로 종결 → 상태가 `resolved`로 바뀌는지
- 2차 차수 생성 시 1차의 failed/not_collected/open-discussion 항목만 자동 승계되는지
- `qa_stages`→`qa_environments` 개명 후 기존 CSV 커버리지 체크 플로우가 그대로 동작하는지
- 프로젝트별로 다른 `base_url`/`user_id_param_name`을 설정했을 때, 스냅샷 캡처가 그 프로젝트의 설정을 사용하는지, `auth_secret`이 클라이언트로 노출되지 않는지

## 남은 질문 (다음 단계 과제)

- AI 판정을 수행하는 실제 API 연동 방식(어떤 LLM/프롬프트 구조로 근거+이유를 생성할지)은 구현 계획 단계에서 상세화
- 진행률 대시보드 UI 상세 설계는 구현 계획에서 다룸
- Workspace 개념 평탄화는 이 작업과 별개로 auth 브랜치 병합 후 진행
