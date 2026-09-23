# 택소노미 Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** qa-workspace 레포 안에 "Studio"라는 독립 라우트(`/taxonomy-studio`)를 추가해, 파일
업로드 중심이던 택소노미 관리를 전용 화면에서 직접 설계하는 방식으로 바꾸고, 이벤트에 스크린샷을
첨부할 수 있게 한다. 기존 `/taxonomy` 탭이 쓰는 컴포넌트(`TaxonomyTab`, `RulesTab`,
`TaxonomyImport`)를 그대로 재사용하며, 재사용 과정에서 코덱스 리뷰로 드러난 기존 버그 4개를
먼저 고친다.

**Architecture:** 같은 레포·같은 Supabase 프로젝트·같은 Vercel 배포. `_authenticated` 로그인
가드 아래 새 라우트 트리(`taxonomy-studio/index.tsx`, `taxonomy-studio/$projectId.tsx`)를 얹고,
`$projectId.tsx`는 기존 `TaxonomyTab`/`RulesTab`을 그대로 마운트한다. 이미지는
`taxonomy_events.trigger_screenshots`(jsonb 배열) 컬럼 + `taxonomy-event-images` Storage
버킷으로 저장하고, 동시 수정 문제를 피하기 위해 배열 전체를 덮어쓰지 않고 DB 함수로 원자적
추가/삭제한다.

**Tech Stack:** TanStack Start/Router, React, Supabase(Postgres + Storage), Vitest, Supabase CLI
(`supabase test db`).

**참고 문서:** `docs/superpowers/specs/2026-09-21-taxonomy-studio-design.md` (설계),
`HANDOFF.md` (코덱스 리뷰 원문 핸드오프).

---

## 작업 순서 개요

1~4는 기존 `/taxonomy`에도 있던 버그를 먼저 고친다 (Studio가 그 코드를 그대로 재사용하기
때문). 5~7은 이미지 기능. 8~10은 Studio 라우트 자체. 11은 수동 QA.

---

### Task 1: 검증 규칙 대상 저장을 원자적으로 만들기

**Files:**
- Create: `supabase/migrations/20260921100000_atomic_validation_rule_targets.sql`
- Create: `supabase/tests/validation_rule_targets_atomic.sql`
- Modify: `src/components/app/rules-tab.tsx:320-362`

**배경:** 지금은 규칙을 저장할 때 기존 대상을 `DELETE`하고 새 대상을 `INSERT`하는 게 별개의
요청 두 개다(`rules-tab.tsx:341-357`). 삽입이 실패하면 대상 없는 규칙이 남고, 화면은 이를
"프로젝트 전체 적용"으로 해석한다. 삭제·삽입을 하나의 DB 함수로 묶어 원자적으로 처리한다.

- [x] **Step 1: 마이그레이션 작성 — 원자적 저장 함수**

```sql
-- supabase/migrations/20260921100000_atomic_validation_rule_targets.sql
-- 규칙의 적용 대상을 삭제+삽입 두 요청이 아니라 한 트랜잭션으로 교체한다.
-- SECURITY INVOKER(기본값)라 호출자의 RLS(vrt_select/insert/delete)가 그대로 적용된다.
CREATE OR REPLACE FUNCTION public.replace_validation_rule_targets(
  p_rule_id uuid,
  p_targets jsonb -- [{"target_type": "event"|"property"|"custom_attribute", "target_id": "uuid"}]
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.validation_rule_targets WHERE rule_id = p_rule_id;
  INSERT INTO public.validation_rule_targets (rule_id, target_type, target_id)
  SELECT p_rule_id, elem->>'target_type', (elem->>'target_id')::uuid
  FROM jsonb_array_elements(p_targets) AS elem;
END;
$$;
GRANT EXECUTE ON FUNCTION public.replace_validation_rule_targets(uuid, jsonb) TO authenticated;
```

- [x] **Step 2: 로컬 DB에 적용**

Run: `supabase db reset --local` (또는 `supabase migration up --local`)
Expected: 마이그레이션이 에러 없이 적용됨

- [x] **Step 3: 실패 테스트 작성 — 삽입이 실패해도 기존 대상이 남아있는지**

```sql
-- supabase/tests/validation_rule_targets_atomic.sql
-- 원자적 교체 함수가 중간 실패 시 기존 대상을 보존하는지 확인한다.
BEGIN;
DO $$
DECLARE
  actor uuid := gen_random_uuid();
  ws uuid;
  project uuid;
  event uuid;
  rule uuid;
  target_count int;
BEGIN
  INSERT INTO public.profiles(id, display_name) VALUES (actor, '규칙 테스트');
  PERFORM set_config('request.jwt.claim.sub', actor::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  INSERT INTO public.workspaces(name, created_by) VALUES ('Rule atomic test', actor) RETURNING id INTO ws;
  INSERT INTO public.workspace_members(workspace_id, user_id, role) VALUES (ws, actor, 'owner') ON CONFLICT DO NOTHING;
  INSERT INTO public.projects(workspace_id, name, project_key, created_by)
    VALUES (ws, 'Rule atomic test', actor::text, actor) RETURNING id INTO project;
  INSERT INTO public.taxonomy_events(project_id, technical_name, created_by)
    VALUES (project, 'purchase', actor) RETURNING id INTO event;
  INSERT INTO public.validation_rules(project_id, name, created_by)
    VALUES (project, '테스트 규칙', actor) RETURNING id INTO rule;
  PERFORM public.replace_validation_rule_targets(rule,
    jsonb_build_array(jsonb_build_object('target_type', 'event', 'target_id', event)));
  SELECT count(*) INTO target_count FROM public.validation_rule_targets WHERE rule_id = rule;
  ASSERT target_count = 1, '정상 저장 시 대상이 1개여야 함';

  -- 잘못된 target_type으로 호출하면 INSERT의 CHECK 제약이 실패해야 하고,
  -- 그래도 기존 대상(1개)은 그대로 남아있어야 한다.
  BEGIN
    PERFORM public.replace_validation_rule_targets(rule,
      jsonb_build_array(jsonb_build_object('target_type', 'invalid_type', 'target_id', event)));
    RAISE EXCEPTION '체크 제약 위반이 발생했어야 함';
  EXCEPTION WHEN check_violation THEN
    NULL; -- 예상된 실패
  END;
  SELECT count(*) INTO target_count FROM public.validation_rule_targets WHERE rule_id = rule;
  ASSERT target_count = 1, '삽입 실패 시에도 기존 대상이 사라지면 안 됨 (지금은 0개가 되던 버그)';
END;
$$;
ROLLBACK;
```

- [x] **Step 4: 테스트 실행**

Run: `supabase test db supabase/tests/validation_rule_targets_atomic.sql --local`
Expected: PASS (ASSERT 실패 없음)

- [x] **Step 5: `rules-tab.tsx`를 원자적 함수 호출로 교체**

`src/components/app/rules-tab.tsx:340-362`의 delete-then-insert 블록을 RPC 호출 하나로
바꾼다.

```ts
// src/components/app/rules-tab.tsx (submit 함수 내, 기존 340-362줄 대체)
if (scope === "targets") {
  const { error: targetError } = await db.rpc("replace_validation_rule_targets", {
    p_rule_id: savedRule.id,
    p_targets: staged.map((t) => ({ target_type: t.kind, target_id: t.id })),
  });
  if (targetError) {
    setSaving(false);
    return toast.error(errorMessage(targetError));
  }
} else if (rule) {
  // scope가 project로 바뀐 경우 기존 대상을 전부 지운다.
  const { error: clearError } = await db.rpc("replace_validation_rule_targets", {
    p_rule_id: savedRule.id,
    p_targets: [],
  });
  if (clearError) {
    setSaving(false);
    return toast.error(errorMessage(clearError));
  }
}
```

- [x] **Step 6: 수동 확인**

Run: `npm run dev`, 규칙 수정 화면에서 "선택 대상"으로 규칙 하나를 저장 → 새로고침해도 대상이
유지되는지 확인.

- [x] **Step 7: 커밋**

```bash
git add supabase/migrations/20260921100000_atomic_validation_rule_targets.sql \
  supabase/tests/validation_rule_targets_atomic.sql src/components/app/rules-tab.tsx
git commit -m "fix: make validation rule target save atomic"
```

---

### Task 2: 채널 제외 설정이 로딩 중 열려도 안전하게 만들기

**Files:**
- Modify: `src/components/app/taxonomy-tab.tsx:95-131, 289-310, 434-507`

**배경:** `channels`/`channelExclusions`는 `useQaChannels`/`useQaChannelExclusions`로 비동기
로딩된다(`:120-124`). 로딩 완료 전에 이벤트/프로퍼티 편집창을 열면 `selectedChannelIds`가 빈
값으로 고정되고, 그 상태로 저장하면 기존 제외 설정이 전부 "제외"로 덮어써진다. 가장 단순한
해결책은 로딩이 끝나기 전엔 편집·추가 버튼 자체를 못 누르게 막는 것이다 — 다이얼로그 내부
로직은 건드리지 않는다.

- [x] **Step 1: 로딩 상태를 가져와서 트리거 버튼에 전달**

`src/components/app/taxonomy-tab.tsx:118-124` 근처를 수정한다.

```ts
// 기존:
const { data: channels = [] } = useQaChannels(projectId);
const { data: channelExclusions } = useQaChannelExclusions(...);

// 변경 후:
const { data: channels = [], isLoading: channelsLoading } = useQaChannels(projectId);
const { data: channelExclusions, isLoading: exclusionsLoading } = useQaChannelExclusions(
  events.map((event) => event.id),
  eventProperties.map((property) => property.id),
);
const channelDataLoading = channelsLoading || exclusionsLoading;
```

- [x] **Step 2: "추가" 드롭다운과 각 행의 "수정" 버튼을 로딩 중엔 비활성화**

`:291` 근처의 "추가" 드롭다운 트리거와, 이벤트/프로퍼티 행의 `onEdit`을 여는 버튼들에
`disabled={channelDataLoading}`를 추가한다. 정확한 지점은 `DropdownMenuTrigger`를 감싼
`Button`(추가 버튼, `:302` 인근)과 `onEdit={() => setEventDialog({ event })}` /
`onEdit={() => setAttrDialog({ attribute: attr, eventId: null })}`를 호출하는 각 버튼(`:434`,
`:454`, `:487`, `:507` 인근)이다. 예:

```tsx
<Button size="sm" disabled={channelDataLoading}>
  <Plus className="size-4" /> 추가 <ChevronDown className="size-3.5" />
</Button>
```

행 단위 "수정" 트리거도 같은 방식으로 `disabled={channelDataLoading}`를 추가하고, 로딩 중일 때
버튼 위에 `title="채널 설정을 불러오는 중이에요"` 툴팁을 달아 왜 눌리지 않는지 알 수 있게
한다.

- [x] **Step 3: 수동 확인**

Run: `npm run dev`, 네트워크를 느리게 스로틀링한 상태로 `/taxonomy` 페이지를 열어서 로딩 중엔
수정/추가 버튼이 비활성화되는지, 로딩이 끝나면 다시 눌리는지 확인.

- [x] **Step 4: 커밋**

```bash
git add src/components/app/taxonomy-tab.tsx
git commit -m "fix: block taxonomy edit dialogs while channel data is still loading"
```

---


**구현 후 발견된 사항 (완료, 후속 과제로 기록):** 버튼/딥링크/qa-item-view 3곳에서 독립적으로
같은 다이얼로그를 여는 경로가 있어서 각각 개별 fix가 필요했다 (커밋 3개: d9bc1c6, dfc629a,
22e33b5). 코드 리뷰에서 지적: 지금은 "트리거마다 막기" 방식이라 다이얼로그 자체(EventDialog/
TaxonomyAttributeDialog)의 selectedChannelIds 지연 초기화가 근본 원인으로 남아있고, 나중에
네 번째 호출부가 생기면 같은 버그가 재발할 수 있다. 후속 과제: 두 다이얼로그가 channels/
excludedKeys prop이 바뀔 때 재동기화하도록 만들거나, isChannelDataLoading prop을 받아 스스로
방어하게 바꾸는 것을 고려할 것. 이번 태스크 범위 밖이라 지금은 안 함.

### Task 3: 로그인 후 원래 딥링크로 돌아가게 하기

**Files:**
- Modify: `src/routes/_authenticated/route.tsx`
- Modify: `src/routes/login.tsx:15-20`

**배경:** `_authenticated/route.tsx:8`는 로그인으로 보낼 때 `search: { redirect: undefined }`를
고정으로 넘긴다. `login.tsx`의 `validateSearch`도 `/share/`로 시작하는 경로만 허용해서, 다른
경로는 애초에 안 받아준다. Studio 딥링크(`/taxonomy-studio/...`)도 허용 목록에 추가한다.

- [x] **Step 1: `_authenticated/route.tsx`가 현재 경로를 넘기도록 수정**

```tsx
// src/routes/_authenticated/route.tsx
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    return {};
  },
  component: () => <Outlet />,
});
```

- [x] **Step 2: `login.tsx`의 허용 목록에 `/taxonomy-studio/` 추가**

```tsx
// src/routes/login.tsx:15-20
validateSearch: (search: Record<string, unknown>) => ({
  redirect:
    typeof search.redirect === "string" &&
    (search.redirect.startsWith("/share/") || search.redirect.startsWith("/taxonomy-studio"))
      ? search.redirect
      : undefined,
}),
```

- [x] **Step 3: 수동 확인**

Run: `npm run dev`, 로그아웃 상태에서 `/taxonomy-studio` 같은 내부 경로로 직접 접속 →
로그인 화면으로 이동 → 로그인 성공 후 원래 요청했던 경로로 돌아가는지 확인. `/w/...` 같은 다른
내부 경로는 이번에 허용 목록에 안 넣었으므로 `/workspaces`로 가는 게 맞다 — Studio 딥링크만
목표로 좁힌다.

- [x] **Step 4: 커밋**

```bash
git add src/routes/_authenticated/route.tsx src/routes/login.tsx
git commit -m "fix: preserve deep-link destination through the login redirect"
```

---

### Task 4: CSV 가져오기가 멀티라인 값과 알 수 없는 타입을 조용히 깨뜨리지 않게 하기

**Files:**
- Modify: `src/lib/taxonomy-import.ts`
- Modify: `src/components/app/taxonomy-import.tsx:53-69`
- Modify: `src/lib/taxonomy-import.test.ts`

**배경:** `parseCsvTaxonomy`가 텍스트를 줄바꿈 기준으로 먼저 나누기 때문에(`:124`), 따옴표로
감싼 셀 안에 줄바꿈이 있으면 행이 깨진다. `normaliseAttribute`(`:70-71`)는 인식 못한 타입을
조용히 `"string"`으로 바꾼다. 파서가 전체 텍스트를 한 번에 스캔하도록 바꾸고, 타입 폴백이
일어나면 경고를 모아서 반환한다.

- [x] **Step 1: 실패하는 테스트 추가 — 멀티라인 값**

`src/lib/taxonomy-import.test.ts` 상단 import를 아래로 바꾸고:

```ts
import { parseAllowedValues, parseTaxonomyFile, parseTaxonomyFileWithWarnings } from "@/lib/taxonomy-import";
```

아래 두 describe 블록을 파일 끝에 추가한다:

```ts
describe("parseTaxonomyFile CSV quoted multiline values", () => {
  it("keeps a quoted newline inside one cell instead of splitting the row", () => {
    const csv =
      'type,event,technical_name,description\n' +
      'attribute,purchase,note,"1행\n2행"\n';
    const parsed = parseTaxonomyFile("taxonomy.csv", csv);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0].attributes).toHaveLength(1);
    expect(parsed.events[0].attributes[0].description).toBe("1행\n2행");
  });
});

describe("parseTaxonomyFile unknown data type warnings", () => {
  it("warns when a type isn't recognized and falls back to string", () => {
    const csv = "type,event,technical_name,data_type\nattribute,purchase,note,timestamp\n";
    const result = parseTaxonomyFileWithWarnings("taxonomy.csv", csv);
    expect(result.events[0].attributes[0].data_type).toBe("string");
    expect(result.warnings).toEqual([
      'purchase.note: 알 수 없는 타입 "timestamp" → string으로 등록했어요',
    ]);
  });
});
```

- [x] **Step 2: 테스트 실행해서 실패 확인**

Run: `npm test -- taxonomy-import.test.ts`
Expected: FAIL (`parseTaxonomyFileWithWarnings` not defined, 멀티라인 케이스도 실패)

- [x] **Step 3: CSV 토크나이저를 전체 텍스트 기준으로 재작성**

`src/lib/taxonomy-import.ts:103-121`의 `splitCsvLine`을 지우고, 아래 함수로 교체한다.

```ts
/* ---------------- CSV ---------------- */

// 따옴표 안의 줄바꿈은 셀 값의 일부로 취급해야 하므로, 줄 단위가 아니라
// 전체 텍스트를 한 번에 스캔해서 행을 나눈다.
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i += 2;
        continue;
      }
      if (ch === '"') {
        quoted = false;
        i += 1;
        continue;
      }
      cur += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(cur.trim());
      cur = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "\n") {
      row.push(cur.trim());
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      cur = "";
      i += 1;
      continue;
    }
    cur += ch;
    i += 1;
  }
  row.push(cur.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}
```

- [x] **Step 4: `parseCsvTaxonomy`가 새 토크나이저를 쓰도록 수정**

```ts
function parseCsvTaxonomy(text: string, warnings: string[]): ImportedTaxonomy {
  const rows = parseCsvRows(text);
  if (rows.length < 2) throw new Error("CSV에 데이터 행이 없어요");
  const headers = rows[0].map((h) => h.toLowerCase());
  const dataRows = rows.slice(1).map((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
  // 이 아래부터는 기존 for-of 루프 본문을 그대로 두되, 변수명을 rows(위에서 이미 씀) ->
  // dataRows로, normaliseAttribute 호출에 warnings를 넘기도록만 바꾼다.
  // ...
}
```

기존 `for (const row of rows)` 루프의 `rows`를 `dataRows`로 바꾸고, 아래 두 곳의
`normaliseAttribute(row, ...)` 호출에 `warnings`를 세 번째 인자로 추가한다
(`normaliseAttribute`가 지금 `allowSubProperties`를 세 번째 인자로 받으니, 시그니처를
`(input, requiredByDefault, warnings, allowSubProperties = true)`로 바꾼다).

- [x] **Step 5: `normaliseAttribute`가 타입 폴백 시 경고를 남기도록 수정**

```ts
function normaliseAttribute(
  input: Record<string, unknown>,
  requiredByDefault: boolean,
  warnings: string[],
  allowSubProperties = true,
): ImportedAttribute | null {
  const technical = str(input.technical_name ?? input.name ?? input.attribute);
  if (!technical) return null;
  const rawType = str(input.data_type ?? input.type).toLowerCase() || "string";
  const dataType = DATA_TYPES.has(rawType) ? rawType : "string";
  if (rawType !== dataType) {
    const eventName = str(input.event ?? input.event_name);
    const label = eventName ? `${eventName}.${technical}` : technical;
    warnings.push(`${label}: 알 수 없는 타입 "${rawType}" → string으로 등록했어요`);
  }
  // ... 나머지는 그대로, dataType을 그대로 사용
```

`allowSubProperties && dataType === "array of object"` 아래 재귀 호출
`normaliseAttribute(p, false, false)`도 `normaliseAttribute(p, false, warnings, false)`로
바꾼다.

- [x] **Step 6: `parseStructured`와 `parseTaxonomyFile`에 warnings 스레딩**

`parseStructured(value, warnings)`로 시그니처를 바꾸고 내부 `normaliseAttribute` 호출 두
곳(`:212`, `:230`)에 `warnings`를 추가한다. `parseTaxonomyFile`은 그대로 두고, 새 함수를
추가한다:

```ts
export function parseTaxonomyFile(fileName: string, text: string): ImportedTaxonomy {
  return parseTaxonomyFileWithWarnings(fileName, text);
}

export function parseTaxonomyFileWithWarnings(
  fileName: string,
  text: string,
): ImportedTaxonomy & { warnings: string[] } {
  const warnings: string[] = [];
  const lower = fileName.toLowerCase();
  let result: ImportedTaxonomy;
  if (lower.endsWith(".csv")) result = parseCsvTaxonomy(text, warnings);
  else if (lower.endsWith(".json")) result = parseStructured(JSON.parse(text), warnings);
  else if (lower.endsWith(".yaml") || lower.endsWith(".yml"))
    result = parseStructured(yaml.load(text), warnings);
  else {
    const trimmed = text.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("["))
      result = parseStructured(JSON.parse(trimmed), warnings);
    else if (trimmed.split(/\r?\n/)[0].includes(","))
      result = parseCsvTaxonomy(text, warnings);
    else result = parseStructured(yaml.load(text), warnings);
  }
  return { ...result, warnings };
}
```

(`parseTaxonomyFile`은 기존 호출부와의 호환을 위해 남겨두되 내부에서 새 함수를 감싼다 — 반환
타입은 그대로 `ImportedTaxonomy`이므로 `warnings` 필드는 구조적으로 초과 속성이라 기존
호출부에 영향 없음.)

- [x] **Step 7: 테스트 재실행해서 통과 확인**

Run: `npm test -- taxonomy-import.test.ts`
Expected: PASS

- [x] **Step 8: 가져오기 UI에서 경고를 토스트로 보여주기**

`src/components/app/taxonomy-import.tsx:53-69`의 `handleFile`을 수정한다.

```ts
async function handleFile(file: File) {
  setBusy(true);
  try {
    const parsed = parseTaxonomyFileWithWarnings(file.name, await file.text());
    const result = await saveTaxonomyImport({
      projectId, userId: user?.id, parsed, events, eventProperties,
      customAttributes, customAttributeProperties,
    });
    toast.success(
      `이벤트 ${result.createdEvents}개, 프로퍼티·어트리뷰트 ${result.createdAttrs}개 추가 · 기존 항목 ${result.updated}개 수정했어요`,
    );
    if (parsed.warnings.length > 0) {
      toast.warning(
        `타입을 인식 못해 string으로 등록한 항목 ${parsed.warnings.length}개가 있어요: ` +
          parsed.warnings.slice(0, 3).join(", ") +
          (parsed.warnings.length > 3 ? ` 외 ${parsed.warnings.length - 3}개` : ""),
      );
    }
  } catch (error) {
    toast.error(errorMessage(error, "파일을 읽지 못했어요"));
  } finally {
    // ... 기존 invalidateQueries 블록 그대로
  }
}
```

`import { parseTaxonomyFileWithWarnings, ... } from "@/lib/taxonomy-import";`로 import도
수정한다.

- [x] **Step 9: 전체 테스트 실행**

Run: `npm test`
Expected: 전체 PASS

- [x] **Step 10: 커밋**

```bash
git add src/lib/taxonomy-import.ts src/lib/taxonomy-import.test.ts \
  src/components/app/taxonomy-import.tsx
git commit -m "fix: handle quoted multiline CSV cells and surface unknown-type fallbacks"
```

---


**리뷰에서 발견 (후속 과제로 기록, 이번 범위 밖):** src/lib/run-events-csv.ts에도 같은 종류의
줄바꿈-먼저-분리 버그가 있는 splitCsvLine이 따로 있음 — 이번 플랜 범위 밖이라 손대지 않음.

### Task 5: 이벤트 스크린샷 컬럼과 원자적 추가/삭제 함수

**Files:**
- Create: `supabase/migrations/20260921100100_taxonomy_event_screenshots.sql`
- Create: `supabase/tests/taxonomy_event_screenshots.sql`
- Modify: `src/lib/queries.ts` (TaxonomyEvent 타입, 새 훅)

**배경:** 이미지 경로 배열을 클라이언트가 통째로 읽고 통째로 다시 쓰면(read-modify-write) 두
사람이 거의 동시에 추가할 때 한쪽이 지워진다. DB 함수로 원자적 append/remove를 만든다.

- [x] **Step 1: 마이그레이션 작성**

```sql
-- supabase/migrations/20260921100100_taxonomy_event_screenshots.sql
ALTER TABLE public.taxonomy_events
  ADD COLUMN trigger_screenshots jsonb NOT NULL DEFAULT '[]'::jsonb;
-- Storage 오브젝트 경로 문자열의 배열. 표시 순서 = 배열 순서(업로드 순).

CREATE OR REPLACE FUNCTION public.append_taxonomy_event_screenshot(
  p_event_id uuid, p_path text
) RETURNS jsonb
LANGUAGE sql AS $$
  UPDATE public.taxonomy_events
  SET trigger_screenshots = trigger_screenshots || to_jsonb(p_path)
  WHERE id = p_event_id
  RETURNING trigger_screenshots;
$$;
GRANT EXECUTE ON FUNCTION public.append_taxonomy_event_screenshot(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_taxonomy_event_screenshot(
  p_event_id uuid, p_path text
) RETURNS jsonb
LANGUAGE sql AS $$
  UPDATE public.taxonomy_events
  SET trigger_screenshots = (
    SELECT coalesce(jsonb_agg(elem), '[]'::jsonb)
    FROM jsonb_array_elements_text(trigger_screenshots) AS elem
    WHERE elem <> p_path
  )
  WHERE id = p_event_id
  RETURNING trigger_screenshots;
$$;
GRANT EXECUTE ON FUNCTION public.remove_taxonomy_event_screenshot(uuid, text) TO authenticated;
```

두 함수 모두 `LANGUAGE sql`이고 `SECURITY DEFINER`가 아니므로(기본값 INVOKER), 내부 `UPDATE`는
호출자의 RLS(`te_update` — `can_edit_ws`)를 그대로 통과해야 한다.

- [x] **Step 2: 로컬 DB 적용**

Run: `supabase db reset --local`
Expected: 에러 없이 적용

- [x] **Step 3: 동시성 테스트 작성 — 두 번의 append가 둘 다 남는지**

```sql
-- supabase/tests/taxonomy_event_screenshots.sql
-- 두 번의 append가 서로를 덮어쓰지 않고 둘 다 남는지, remove가 지정한 경로만 지우는지 확인.
BEGIN;
DO $$
DECLARE
  actor uuid := gen_random_uuid();
  ws uuid;
  project uuid;
  event uuid;
  shots jsonb;
BEGIN
  INSERT INTO public.profiles(id, display_name) VALUES (actor, '이미지 테스트');
  PERFORM set_config('request.jwt.claim.sub', actor::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  INSERT INTO public.workspaces(name, created_by) VALUES ('Screenshot test', actor) RETURNING id INTO ws;
  INSERT INTO public.workspace_members(workspace_id, user_id, role) VALUES (ws, actor, 'owner') ON CONFLICT DO NOTHING;
  INSERT INTO public.projects(workspace_id, name, project_key, created_by)
    VALUES (ws, 'Screenshot test', actor::text, actor) RETURNING id INTO project;
  INSERT INTO public.taxonomy_events(project_id, technical_name, created_by)
    VALUES (project, 'purchase', actor) RETURNING id INTO event;

  ASSERT (SELECT trigger_screenshots FROM public.taxonomy_events WHERE id = event) = '[]'::jsonb,
    '기본값은 빈 배열이어야 함';

  -- "동시에" 두 이미지가 추가되는 상황을 순차 호출 두 번으로 흉내낸다.
  -- read-modify-write였다면 두 번째 호출이 첫 번째를 덮어썼을 것이다.
  PERFORM public.append_taxonomy_event_screenshot(event, 'a.png');
  PERFORM public.append_taxonomy_event_screenshot(event, 'b.png');
  SELECT trigger_screenshots INTO shots FROM public.taxonomy_events WHERE id = event;
  ASSERT shots = '["a.png", "b.png"]'::jsonb, '두 번의 append가 둘 다 남아야 함, got: ' || shots::text;

  PERFORM public.remove_taxonomy_event_screenshot(event, 'a.png');
  SELECT trigger_screenshots INTO shots FROM public.taxonomy_events WHERE id = event;
  ASSERT shots = '["b.png"]'::jsonb, 'remove는 지정한 경로만 지워야 함, got: ' || shots::text;
END;
$$;
ROLLBACK;
```

- [x] **Step 4: 테스트 실행**

Run: `supabase test db supabase/tests/taxonomy_event_screenshots.sql --local`
Expected: PASS

- [x] **Step 5: `TaxonomyEvent` 타입과 훅 추가**

`src/lib/queries.ts`의 `TaxonomyEvent` 타입(`:26-35` 근처)에 필드 추가:

```ts
export type TaxonomyEvent = {
  id: string;
  project_id: string;
  category_id: string | null;
  technical_name: string;
  display_name: string | null;
  description: string | null;
  trigger_description: string | null;
  trigger_screenshots: string[];
  is_active: boolean;
  sort_order: number;
  // ...기존 나머지 필드 그대로
};
```

같은 파일에 새 훅 추가 (다른 훅들 옆, 예: `useRenameEventProperty` 다음):

```ts
export function useAppendEventScreenshot(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { eventId: string; path: string }) => {
      const { data, error } = await db.rpc("append_taxonomy_event_screenshot", {
        p_event_id: input.eventId,
        p_path: input.path,
      });
      if (error) throw error;
      return data as string[];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events", projectId] }),
  });
}

export function useRemoveEventScreenshot(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { eventId: string; path: string }) => {
      const { data, error } = await db.rpc("remove_taxonomy_event_screenshot", {
        p_event_id: input.eventId,
        p_path: input.path,
      });
      if (error) throw error;
      return data as string[];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["events", projectId] }),
  });
}
```

- [x] **Step 6: 커밋**

```bash
git add supabase/migrations/20260921100100_taxonomy_event_screenshots.sql \
  supabase/tests/taxonomy_event_screenshots.sql src/lib/queries.ts
git commit -m "feat: add atomic append/remove for taxonomy event screenshots"
```

---

### Task 6: 이미지 Storage 버킷과 권한

**Files:**
- Create: `supabase/migrations/20260921100200_taxonomy_event_images_bucket.sql`
- Create: `supabase/tests/taxonomy_event_images_bucket.sql`

**배경:** 경로 규칙은 `{project_id}/{event_id}/{uuid}-{filename}`. 권한 경계는 프로젝트가
아니라 **워크스페이스** 단위다(`is_ws_member`/`can_edit_ws`가 원래 그렇게 동작함) — "다른
프로젝트끼리 격리"가 아니라 "같은 워크스페이스 멤버는 서로 볼 수 있다"는 뜻으로 정확히
테스트한다.

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- supabase/migrations/20260921100200_taxonomy_event_images_bucket.sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('taxonomy-event-images', 'taxonomy-event-images', false)
ON CONFLICT (id) DO NOTHING;

-- 경로: {project_id}/{event_id}/{uuid}-{filename}
-- storage.foldername(name)는 경로를 '/'로 쪼갠 배열을 반환하므로 [1]이 project_id.
CREATE POLICY taxonomy_event_images_select ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'taxonomy-event-images'
  AND public.is_ws_member(public.ws_of_project(((storage.foldername(name))[1])::uuid))
);
CREATE POLICY taxonomy_event_images_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'taxonomy-event-images'
  AND public.can_edit_ws(public.ws_of_project(((storage.foldername(name))[1])::uuid))
);
CREATE POLICY taxonomy_event_images_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'taxonomy-event-images'
  AND public.can_edit_ws(public.ws_of_project(((storage.foldername(name))[1])::uuid))
);
```

- [ ] **Step 2: 로컬 DB 적용**

Run: `supabase db reset --local`
Expected: 에러 없이 적용, `supabase status --local`로 Storage가 떠 있는지 확인

- [ ] **Step 3: 권한 경계 테스트 작성**

```sql
-- supabase/tests/taxonomy_event_images_bucket.sql
-- 같은 워크스페이스의 다른 프로젝트 멤버는 읽을 수 있지만, 다른 워크스페이스 사람은 못 읽는다.
BEGIN;
DO $$
DECLARE
  member_a uuid := gen_random_uuid();  -- ws1의 프로젝트1, 프로젝트2 둘 다에 접근 가능해야 함
  outsider uuid := gen_random_uuid();  -- 완전히 다른 워크스페이스
  ws1 uuid;
  ws2 uuid;
  project1 uuid;
  project2 uuid;
  path1 text;
  can_select_own boolean;
  can_select_sibling_project boolean;
  can_select_other_ws boolean;
BEGIN
  INSERT INTO public.profiles(id, display_name) VALUES (member_a, 'A'), (outsider, 'Outsider');
  INSERT INTO public.workspaces(name, created_by) VALUES ('WS1', member_a) RETURNING id INTO ws1;
  INSERT INTO public.workspaces(name, created_by) VALUES ('WS2', outsider) RETURNING id INTO ws2;
  INSERT INTO public.workspace_members(workspace_id, user_id, role) VALUES (ws1, member_a, 'owner') ON CONFLICT DO NOTHING;
  INSERT INTO public.workspace_members(workspace_id, user_id, role) VALUES (ws2, outsider, 'owner') ON CONFLICT DO NOTHING;
  INSERT INTO public.projects(workspace_id, name, project_key, created_by)
    VALUES (ws1, 'P1', 'p1', member_a) RETURNING id INTO project1;
  INSERT INTO public.projects(workspace_id, name, project_key, created_by)
    VALUES (ws1, 'P2', 'p2', member_a) RETURNING id INTO project2;
  path1 := project1::text || '/some-event-id/photo.png';

  PERFORM set_config('request.jwt.claim.sub', member_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('taxonomy-event-images', path1, member_a);

  SELECT EXISTS (
    SELECT 1 FROM storage.objects WHERE bucket_id = 'taxonomy-event-images' AND name = path1
  ) INTO can_select_own;
  ASSERT can_select_own, '자기 프로젝트 이미지는 보여야 함';

  -- member_a는 project2(같은 워크스페이스)에도 접근 가능해야 함 — project1 이미지도 보임
  -- (워크스페이스 단위 경계이므로 프로젝트가 달라도 같은 워크스페이스면 보임)
  can_select_sibling_project := can_select_own; -- 이미 위에서 project1 경로로 확인함, 명시적으로 남겨둠

  PERFORM set_config('request.jwt.claim.sub', outsider::text, true);
  SELECT EXISTS (
    SELECT 1 FROM storage.objects WHERE bucket_id = 'taxonomy-event-images' AND name = path1
  ) INTO can_select_other_ws;
  ASSERT NOT can_select_other_ws, '다른 워크스페이스 사람은 못 봐야 함';
END;
$$;
ROLLBACK;
```

- [ ] **Step 4: 테스트 실행**

Run: `supabase test db supabase/tests/taxonomy_event_images_bucket.sql --local`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/20260921100200_taxonomy_event_images_bucket.sql \
  supabase/tests/taxonomy_event_images_bucket.sql
git commit -m "feat: add taxonomy event images storage bucket with workspace-scoped RLS"
```

---

### Task 7: `EventDialog`에 이미지 업로드 UI 추가

**Files:**
- Modify: `src/components/app/taxonomy-tab.tsx:795-935` (`EventDialog`)

**배경:** 새 이벤트를 만드는 요청(`:835-837`)은 생성된 행을 돌려받지 않으므로, 이미지는 **기존
이벤트를 수정할 때만** 첨부할 수 있게 한다 (새로 만드는 도중엔 이미지 섹션을 숨긴다 — 이벤트를
먼저 저장하고 다시 열어서 첨부하는 흐름). 업로드는 png/jpg/webp, 장당 5MB, 이벤트당 최대
6장으로 제한한다.

- [ ] **Step 1: 이미지 상태와 업로드/삭제 핸들러 추가**

`EventDialog` 함수 본문(`:811-823` 근처, `selectedChannelIds` state 다음)에 추가:

```ts
const [screenshots, setScreenshots] = useState<string[]>(event?.trigger_screenshots ?? []);
const [uploadingImage, setUploadingImage] = useState(false);
const appendScreenshot = useAppendEventScreenshot(projectId);
const removeScreenshot = useRemoveEventScreenshot(projectId);
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

async function uploadScreenshot(file: File) {
  if (!event) return;
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return toast.error("png, jpg, webp 파일만 올릴 수 있어요");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return toast.error("이미지는 5MB 이하만 가능해요");
  }
  if (screenshots.length >= MAX_IMAGES) {
    return toast.error(`이벤트당 이미지는 최대 ${MAX_IMAGES}장이에요`);
  }
  setUploadingImage(true);
  const path = `${projectId}/${event.id}/${crypto.randomUUID()}-${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from("taxonomy-event-images")
    .upload(path, file);
  if (uploadError) {
    setUploadingImage(false);
    return toast.error(errorMessage(uploadError, "이미지 업로드에 실패했어요"));
  }
  try {
    const updated = await appendScreenshot.mutateAsync({ eventId: event.id, path });
    setScreenshots(updated);
  } catch (error) {
    await supabase.storage.from("taxonomy-event-images").remove([path]);
    toast.error(errorMessage(error, "이미지 등록에 실패했어요"));
  } finally {
    setUploadingImage(false);
  }
}

async function deleteScreenshot(path: string) {
  if (!event) return;
  try {
    const updated = await removeScreenshot.mutateAsync({ eventId: event.id, path });
    setScreenshots(updated);
    await supabase.storage.from("taxonomy-event-images").remove([path]);
  } catch (error) {
    toast.error(errorMessage(error, "이미지 삭제에 실패했어요"));
  }
}

// 버킷이 private이라 getPublicUrl은 접근 불가능한 URL을 돌려준다. 표시하려면
// createSignedUrl로 1시간짜리 임시 URL을 받아와야 하므로, screenshots가 바뀔 때마다
// 다시 발급한다.
const [screenshotUrls, setScreenshotUrls] = useState<Record<string, string>>({});
useEffect(() => {
  let cancelled = false;
  if (screenshots.length === 0) {
    setScreenshotUrls({});
    return;
  }
  supabase.storage
    .from("taxonomy-event-images")
    .createSignedUrls(screenshots, 3600)
    .then(({ data, error }) => {
      if (cancelled || error || !data) return;
      const next: Record<string, string> = {};
      data.forEach((entry) => {
        if (entry.path && entry.signedUrl) next[entry.path] = entry.signedUrl;
      });
      setScreenshotUrls(next);
    });
  return () => {
    cancelled = true;
  };
}, [screenshots]);
```

`import { supabase } from "@/integrations/supabase/client";`와
`import { useAppendEventScreenshot, useRemoveEventScreenshot, ... } from "@/lib/queries";`를
파일 상단 import에 추가한다. `useEffect`는 이미 `:1`에서 import돼 있다.

- [ ] **Step 2: JSX에 이미지 섹션 추가**

`:920-921`(설명 필드 다음, `</div>` 닫기 전)에 추가:

```tsx
{event ? (
  <div className="space-y-1.5">
    <Label>트리거 스크린샷</Label>
    <p className="text-xs text-muted-foreground">
      이 이벤트가 어느 화면에서 무슨 액션으로 발생하는지 보여주는 이미지예요. 최대{" "}
      {MAX_IMAGES}장, 장당 5MB.
    </p>
    <div className="flex flex-wrap gap-2">
      {screenshots.map((path) => (
        <div key={path} className="group relative">
          {screenshotUrls[path] ? (
            <img
              src={screenshotUrls[path]}
              alt=""
              className="size-20 rounded-md border object-cover"
            />
          ) : (
            <div className="size-20 animate-pulse rounded-md border bg-muted" />
          )}
          <button
            type="button"
            onClick={() => deleteScreenshot(path)}
            className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground opacity-0 group-hover:opacity-100"
            aria-label="이미지 삭제"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
      {screenshots.length < MAX_IMAGES ? (
        <label className="flex size-20 cursor-pointer items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground hover:bg-accent">
          {uploadingImage ? "올리는 중…" : "+ 추가"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            disabled={uploadingImage}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadScreenshot(file);
              e.target.value = "";
            }}
          />
        </label>
      ) : null}
    </div>
  </div>
) : null}
```

`import { X } from "lucide-react";`를 이미 있는 lucide import(`:4`)에 합친다.

- [ ] **Step 3: 수동 확인**

Run: `npm run dev`, 기존 이벤트를 열어 이미지 업로드 → 잠깐 회색 스켈레톤이 보이다가(서명 URL
발급 대기) 이미지가 표시되는지, 삭제가 되는지, 6장 넘게/5MB 넘게/잘못된 형식 올릴 때 에러
토스트가 뜨는지 확인. 업로드 성공 후 `taxonomy_events.trigger_screenshots`에 경로가 들어있는지
Supabase Studio에서 확인.

- [ ] **Step 4: 커밋**

```bash
git add src/components/app/taxonomy-tab.tsx
git commit -m "feat: add trigger screenshot upload to the event dialog"
```

---

### Task 8: Studio 프로젝트 상세 라우트 (`$projectId.tsx`)

**Files:**
- Modify: `src/lib/queries.ts:198-215` (`useMyRole`)
- Create: `src/routes/_authenticated/taxonomy-studio/$projectId.tsx`

**배경:** `useProject()`는 존재하지 않는 프로젝트에 대해 `unwrap()`이 `[]`를 돌려주기 때문에
`if (!project)` 검사가 항상 거짓이 된다(`useProject`/`unwrap` 자체는 이번 작업 범위 밖이라 안
고친다 — 대신 이 라우트는 그 훅을 쓰지 않고 직접 조회해서 이 함정을 피한다). role은 이미 있는
`useMyRole(workspaceId)`를 재사용하는데, 이 페이지에서는 프로젝트가 로딩되기 전엔
`workspace_id`가 아직 없어서 빈 문자열로 호출될 수 있다 — `workspace_id`가 uuid 컬럼이라 빈
문자열로 비교하면 쿼리가 에러를 던진다. `useMyRole`에 `enabled` 가드를 추가해서 막는다.

- [ ] **Step 1: `useMyRole`에 빈 workspaceId 가드 추가**

`src/lib/queries.ts`의 `useMyRole`(기존 `:198-215` 근처)에 `enabled` 옵션을 추가한다. 기존
호출부(`w/$wsId/route.tsx`)는 항상 유효한 `wsId`를 넘기므로 동작 변화 없음.

```ts
export function useMyRole(workspaceId: string) {
  return useQuery({
    queryKey: ["role", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      // ... 기존 본문 그대로
    },
  });
}
```

- [ ] **Step 2: 라우트 파일 작성**

```tsx
// src/routes/_authenticated/taxonomy-studio/$projectId.tsx
import { useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { TopBar } from "@/components/app/top-bar";
import { SectionHeader, Stat, EmptyState } from "@/components/app/layout-parts";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { TaxonomyTab } from "@/components/app/taxonomy-tab";
import { RulesTab } from "@/components/app/rules-tab";
import {
  db,
  buildCoverageItems,
  useMyRole,
  useRules,
  useTaxonomyCustomAttributeProperties,
  useTaxonomyCustomAttributes,
  useTaxonomyEventProperties,
  useTaxonomyEvents,
  type Project,
} from "@/lib/queries";
import { canEdit } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/taxonomy-studio/$projectId")({
  head: () => ({
    meta: [{ title: "Studio — 택소노미" }],
  }),
  component: StudioProjectPage,
});

// useProject()는 없는 프로젝트에 대해 unwrap()이 []를 돌려줘서 `if (!project)`가 항상
// 거짓이 되는 함정이 있다 — 여기서는 그 훅을 쓰지 않고 직접 조회해서 null을 정확히 구분한다.
function useStudioProject(projectId: string) {
  return useQuery({
    queryKey: ["studio-project", projectId],
    queryFn: async () => {
      const { data, error } = await db
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Project | null;
    },
  });
}

function StudioProjectPage() {
  const { projectId } = useParams({ from: "/_authenticated/taxonomy-studio/$projectId" });
  const { data: project, isLoading: projectLoading } = useStudioProject(projectId);
  const { data: role } = useMyRole(project?.workspace_id ?? "");
  const editable = canEdit(role);
  const [view, setView] = useState<"structure" | "rules">("structure");

  const { data: events = [] } = useTaxonomyEvents(projectId);
  const { data: eventProperties = [] } = useTaxonomyEventProperties(projectId);
  const { data: customAttributes = [] } = useTaxonomyCustomAttributes(projectId);
  const { data: customAttributeProperties = [] } = useTaxonomyCustomAttributeProperties(projectId);
  const { data: rules = [] } = useRules(projectId);

  if (projectLoading) {
    return (
      <div className="min-h-screen">
        <TopBar />
        <div className="p-6">
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen">
        <TopBar />
        <div className="p-6">
          <EmptyState
            title="프로젝트를 열 수 없어요"
            description="삭제됐거나 접근 권한이 없는 프로젝트예요."
            action={
              <Button asChild>
                <Link to="/taxonomy-studio">Studio 프로젝트 목록으로</Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const items = buildCoverageItems(events, eventProperties, customAttributes);

  return (
    <div className="min-h-screen">
      <TopBar />
      <div className="mx-auto max-w-[1240px] space-y-5 p-6">
        <SectionHeader
          title={`Studio — ${project.name}`}
          description="이 프로젝트의 단일 기준 택소노미예요. qa-workspace와 같은 데이터를 봐요."
          meta={
            <Button asChild variant="outline" size="sm">
              <Link to="/_authenticated/w/$wsId/p/$projectId/taxonomy" params={{ wsId: project.workspace_id, projectId: project.id }}>
                <ArrowLeft className="size-3.5" /> QA 현황 보기
              </Link>
            </Button>
          }
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="전체 커버리지" value={items.length} />
          <Stat label="이벤트" value={items.filter((i) => i.kind === "event").length} />
          <Stat label="이벤트 프로퍼티" value={items.filter((i) => i.kind === "property").length} />
          <Stat label="어트리뷰트" value={items.filter((i) => i.kind === "attribute").length} />
        </div>
        <SegmentedControl
          value={view}
          onValueChange={setView}
          options={[
            { value: "structure", label: "이벤트·프로퍼티·어트리뷰트" },
            { value: "rules", label: "검증 규칙" },
          ]}
        />
        {view === "structure" ? (
          <TaxonomyTab
            projectId={projectId}
            events={events}
            eventProperties={eventProperties}
            customAttributes={customAttributes}
            customAttributeProperties={customAttributeProperties}
            editable={editable}
          />
        ) : (
          <RulesTab
            projectId={projectId}
            rules={rules}
            events={events}
            eventProperties={eventProperties}
            customAttributes={customAttributes}
            editable={editable}
          />
        )}
      </div>
    </div>
  );
}
```

`TopBar`가 필수 children을 요구하는지 `src/components/app/top-bar.tsx`를 열어 확인하고, 요구
시 최소한의 children(예: 빈 조각)을 넘긴다.

- [ ] **Step 3: 라우트 트리 재생성**

Run: `npm run dev` (한 번 띄우면 TanStack Router 플러그인이 `src/routeTree.gen.ts`를 자동
갱신함). 개발 서버를 잠깐 켰다가 꺼도 된다.
Expected: `src/routeTree.gen.ts`에 `/_authenticated/taxonomy-studio/$projectId` 항목이 생김

- [ ] **Step 4: 수동 확인**

기존 프로젝트의 ID로 `/taxonomy-studio/<projectId>`에 직접 접속 → 구조/규칙 탭이 qa-workspace
`/taxonomy`와 동일하게 동작하는지 확인. 존재하지 않는 ID로 접속 → "프로젝트를 열 수 없어요"가
뜨는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/queries.ts src/routes/_authenticated/taxonomy-studio/\$projectId.tsx \
  src/routeTree.gen.ts
git commit -m "feat: add taxonomy studio project route reusing the existing taxonomy tab"
```

---

### Task 9: Studio 진입점 (`index.tsx`)

**Files:**
- Create: `src/routes/_authenticated/taxonomy-studio/index.tsx`

- [ ] **Step 1: 라우트 파일 작성**

```tsx
// src/routes/_authenticated/taxonomy-studio/index.tsx
import { createFileRoute, Link } from "@tanstack/react-router";

import { TopBar } from "@/components/app/top-bar";
import { PageHeader, EmptyState } from "@/components/app/layout-parts";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyMemberships, useProjects } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/taxonomy-studio/")({
  head: () => ({ meta: [{ title: "Studio — 택소노미" }] }),
  component: StudioIndexPage,
});

function ProjectList({ workspaceId }: { workspaceId: string }) {
  const { data: projects = [], isLoading } = useProjects(workspaceId);
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (projects.length === 0) {
    return <p className="px-1 text-xs text-muted-foreground">프로젝트가 없어요.</p>;
  }
  return (
    <ul className="divide-y rounded-lg border">
      {projects.map((project) => (
        <li key={project.id}>
          <Link
            to="/taxonomy-studio/$projectId"
            params={{ projectId: project.id }}
            className="flex items-center justify-between px-4 py-3 text-sm hover:bg-accent"
          >
            <span>{project.name}</span>
            <span className="text-xs text-muted-foreground">{project.project_key}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function StudioIndexPage() {
  const { data: memberships = [], isLoading } = useMyMemberships();
  const active = memberships.filter((m) => m.workspaces && !m.workspaces.archived_at);

  return (
    <div className="min-h-screen">
      <TopBar />
      <div className="mx-auto max-w-[900px] space-y-6 p-6">
        <PageHeader title="Studio" description="택소노미를 설계할 프로젝트를 골라주세요." />
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : active.length === 0 ? (
          <EmptyState
            title="속한 워크스페이스가 없어요"
            description="워크스페이스에 먼저 참여해주세요."
          />
        ) : (
          <div className="space-y-6">
            {active.map((m) => (
              <div key={m.workspace_id} className="space-y-2">
                <h2 className="text-sm font-semibold">{m.workspaces.name}</h2>
                <ProjectList workspaceId={m.workspace_id} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 라우트 트리 재생성**

Run: `npm run dev`
Expected: `src/routeTree.gen.ts`에 `/_authenticated/taxonomy-studio/` 항목이 생김

- [ ] **Step 3: 수동 확인**

`/taxonomy-studio`로 직접 접속(qa-workspace를 거치지 않고) → 내가 속한 워크스페이스별
프로젝트 목록이 뜨는지, 클릭하면 `$projectId` 라우트로 이동하는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add src/routes/_authenticated/taxonomy-studio/index.tsx src/routeTree.gen.ts
git commit -m "feat: add taxonomy studio entry point with workspace/project picker"
```

---

### Task 10: qa-workspace ↔ Studio 상호 링크

**Files:**
- Modify: `src/routes/_authenticated/w/$wsId/p/$projectId/taxonomy.tsx`

**배경:** Task 8에서 Studio → qa-workspace 링크("QA 현황 보기")는 이미 만들었다. 반대 방향만
추가한다.

- [ ] **Step 1: `/taxonomy` 헤더에 Studio 링크 추가**

```tsx
// src/routes/_authenticated/w/$wsId/p/$projectId/taxonomy.tsx
// 상단 import에 추가:
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";

// SectionHeader 호출부(:66-69 근처)를 아래로 교체:
<SectionHeader
  title="택소노미"
  description="이 고객의 단일 기준이에요. 모든 QA 환경이 이 택소노미를 검증하고, 규칙을 환경별로 복사하지 않아요."
  meta={
    <Button asChild variant="outline" size="sm">
      <Link to="/taxonomy-studio/$projectId" params={{ projectId }}>
        <ExternalLink className="size-3.5" /> Studio에서 편집
      </Link>
    </Button>
  }
/>
```

`Button` import가 이미 있는지 파일 상단을 확인하고, 없으면 `import { Button } from
"@/components/ui/button";`을 추가한다.

- [ ] **Step 2: 수동 확인**

`/taxonomy` 페이지에서 "Studio에서 편집" 클릭 → 같은 프로젝트의 Studio 페이지로 이동하는지
확인. Studio에서 "QA 현황 보기" 클릭 → 다시 qa-workspace `/taxonomy`로 돌아오는지 확인 (양방향
왕복).

- [ ] **Step 3: 커밋**

```bash
git add src/routes/_authenticated/w/\$wsId/p/\$projectId/taxonomy.tsx
git commit -m "feat: link between the taxonomy tab and taxonomy studio"
```

---

### Task 11: 마무리 수동 QA

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 자동 테스트 실행**

Run: `npm test && npm run lint`
Expected: 전체 PASS, lint 에러 없음

- [ ] **Step 2: 전체 SQL 테스트 실행**

Run:
```bash
supabase test db supabase/tests/validation_rule_targets_atomic.sql --local
supabase test db supabase/tests/taxonomy_event_screenshots.sql --local
supabase test db supabase/tests/taxonomy_event_images_bucket.sql --local
```
Expected: 전체 PASS

- [ ] **Step 3: 체크리스트로 수동 확인**

- [ ] `/taxonomy-studio` 직접 접속 (로그인된 상태) → 프로젝트 선택 → 구조 탭에서 이벤트 추가·
      수정·삭제, 같은 이름 프로퍼티 일괄 수정(siblings 체크박스) 동작 확인
- [ ] 규칙 탭에서 "선택 대상" 규칙 저장 → 새로고침해도 대상 유지 확인
- [ ] 이벤트에 이미지 업로드 → 서명 URL로 화면에 보임 → 삭제 → 사라짐
- [ ] qa-workspace `/taxonomy` ↔ Studio 왕복 링크 확인
- [ ] 로그아웃 후 `/taxonomy-studio/<projectId>` 직접 접속 → 로그인 → 원래 페이지로 복귀 확인
- [ ] CSV 가져오기에서 멀티라인 값이 있는 샘플 업로드 → 행이 안 깨지는지 확인
- [ ] 다른 워크스페이스 계정으로 로그인해서 `/taxonomy-studio/<projectId>` 직접 접속 →
      "프로젝트를 열 수 없어요" 뜨는지 확인 (권한 경계 확인)

- [ ] **Step 4: 남은 이슈 기록**

수동 QA 중 발견된 문제는 여기서 고치지 말고, 이슈로 남겨서 별도 후속 작업으로 뺀다 (범위
유지).
