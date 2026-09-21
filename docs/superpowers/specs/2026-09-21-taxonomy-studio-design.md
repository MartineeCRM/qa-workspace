# 택소노미 Studio — 설계

## 배경

지금 qa-workspace의 택소노미는 대부분 파일(CSV/JSON/YAML) 업로드로 채워진다. 택소노미를
처음부터 제대로 설계하는 전용 화면을 만들고, 거기서 이미지 첨부·일괄 수정·검증 규칙 설정까지
지원하자는 아이디어에서 출발했다.

브레인스토밍 결과, 이건 새 제품이 아니라 **지금 qa-workspace 레포 안에 새 라우트를 하나
추가하는 일**로 정리됐다. 별도 레포·별도 DB로 분리하면 이미 존재하는 기능(같은 이름
프로퍼티를 여러 이벤트에 한번에 반영하는 로직 등)을 두 곳에서 유지보수해야 해서, 그 비용이
분리로 얻는 이득보다 크다고 판단했다.

## 범위

- **대상 사용자**: Martinee 내부팀만 (고객사 직접 접근 아님)
- **위치**: 같은 레포, 같은 Supabase 프로젝트, 같은 Vercel 배포. `/share/$token`처럼 워크스페이스
  사이드바 바깥의 독립된 라우트로 만들되, 인증은 기존 `/_authenticated` 가드를 그대로 쓴다
  (고객 포털용 커스텀 헤더를 새로 만들 필요 없음).
- **이름**: "Studio" — qa-workspace 쪽 링크 문구는 "Studio에서 편집"으로 통일한다.

## 아키텍처

새 라우트 2개, 기존 컴포넌트 재사용:

```
src/routes/_authenticated/taxonomy-studio/
  index.tsx        # 워크스페이스 → 프로젝트 선택 화면 (진입점)
  $projectId.tsx    # 기존 TaxonomyPage와 같은 구성 (TaxonomyTab + RulesTab)
```

- `index.tsx`: 기존 `useProjects(workspaceId)` 등 워크스페이스/프로젝트 조회 훅을 그대로 써서
  내가 접근 권한 있는 프로젝트 목록을 보여주고, 고르면 `$projectId`로 이동한다. qa-workspace를
  거치지 않고 `/taxonomy-studio`로 바로 들어올 수 있다.
- `$projectId.tsx`: 지금 `/taxonomy` 라우트가 쓰는 `TaxonomyTab`, `RulesTab`, `TaxonomyImport`
  컴포넌트를 **그대로 import**한다. 구조·규칙·파일 업로드(마이그레이션용) 기능을 새로 만들지
  않는다 — sibling-cascade 일괄 수정 로직도 여기 포함되어 그대로 따라온다.
- 별도 sync 파이프라인 없음. 두 라우트가 같은 테이블을 직접 읽고 쓰므로 한쪽에서 고치면 다른
  쪽에도 즉시 반영된다.

## 데이터 모델 변경

새 테이블은 만들지 않는다. `taxonomy_events`에 컬럼 하나만 추가한다:

```sql
alter table public.taxonomy_events
  add column trigger_screenshots jsonb not null default '[]'::jsonb;
  -- Storage 오브젝트 경로 문자열의 배열. 표시 순서 = 배열 순서(업로드 순).
  -- 별도 정렬 컬럼은 만들지 않는다 — 재정렬 UI가 실제로 필요해지면 그때 추가한다.
```

기존 `te_select`/`te_update` RLS 정책이 컬럼 단위가 아니라 row 단위라 별도 정책 추가가 필요
없다.

Storage 버킷 하나 신설: `taxonomy-event-images`
- 경로 규칙: `{project_id}/{event_id}/{uuid}-{filename}`
- RLS는 기존 `is_ws_member(ws_of_project(...))` / `can_edit_ws(...)` 헬퍼를 그대로 재사용해
  경로의 `project_id` 세그먼트로 멤버십을 확인한다 (읽기: 멤버, 쓰기/삭제: edit 권한).

## 기능 범위

1. **이벤트·프로퍼티·어트리뷰트 CRUD** — `TaxonomyTab` 그대로, 같은 이름 프로퍼티 일괄 수정
   포함.
2. **검증 규칙 설정** — `RulesTab` 그대로 (`validation_rules` / `validation_rule_targets`).
3. **이벤트 이미지 첨부 (신규)** — `EventDialog`에 여러 장 업로드/삭제 UI를 추가한다. 이벤트
   전용이며 (프로퍼티·어트리뷰트엔 안 붙음), "어느 화면에서 무슨 액션으로 발생하는 이벤트인지"
   설명하는 용도. 이 컴포넌트는 qa-workspace `/taxonomy`와 Studio 양쪽에서 같이 쓰이므로, 한
   군데 추가로 두 화면 모두에서 이미지 첨부가 가능해진다.
4. **파일 업로드(CSV/JSON/YAML) 마이그레이션** — `TaxonomyImport` 그대로, 초기 이관용으로
   Studio에도 유지한다.

## 상호 링킹

- qa-workspace `/taxonomy` 페이지 헤더에 "Studio에서 편집" 버튼 추가 → 같은 `projectId`로
  `/taxonomy-studio/$projectId` 딥링크.
- Studio `$projectId` 페이지에 "QA 현황 보기" 버튼 추가 → 같은 프로젝트의 qa-workspace
  `/taxonomy` (또는 프로젝트 홈)로 돌아가는 링크.

## 권한

새 권한 체계를 만들지 않는다. 기존 `canEdit(role)` (owner/admin/editor)를 그대로 적용한다 —
멤버가 아니면 애초에 프로젝트 선택 화면에 안 뜬다.

## 범위 밖 (이번엔 안 함)

- 별도 레포/별도 Vercel 프로젝트로 분리
- 별도 DB + sync/export API
- 고객사(클라이언트) 직접 접근
- 이미지 재정렬 UI, 프로퍼티·어트리뷰트 이미지 첨부
- 새로운 권한 모델

## 테스트 관점

- `trigger_screenshots` 컬럼 추가는 마이그레이션 테스트(`supabase/tests/`)에 기본값 `[]`
  확인 케이스 추가.
- Storage 버킷 RLS는 "다른 프로젝트 멤버가 남의 프로젝트 이미지 경로에 못 쓴다"는 케이스를
  수동으로 한 번 확인 (기존 RLS 헬퍼 재사용이라 새 정책 로직은 아님).
- `$projectId.tsx`가 `TaxonomyTab`/`RulesTab`을 그대로 마운트하므로, 기존 `taxonomy-tab`
  관련 테스트가 회귀 없이 통과하는지만 확인하면 된다 (새 컴포넌트 테스트 불필요).
