# 개요 탭 커버리지 재설계 (방향 B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `개요` 탭의 QA 환경별 커버리지·팔로업 이슈 목록이 legacy `qa_item_status` 스냅샷 대신 새 라운드/세션/체크리스트 스키마(`qa_rounds` → `qa_sessions` → `qa_round_checklist_items` → `qa_checklist_item_results`)를 직접 읽어 실시간으로 갱신되게 만든다.

**Architecture:** 프로젝트의 모든 라운드를 한 번의 중첩 Supabase 쿼리로 가져와 평평한 행(row) 배열로 변환하고, 순수 함수로 "환경별 가장 최근 라운드"만 골라 커버리지 숫자와 팔로업 이슈를 계산한다. `ProjectOverview`는 이 새 훅/함수로 갈아끼우고, 더 이상 아무도 안 쓰는 `qa_item_status` 관련 프론트엔드 코드(타입/훅/함수)는 이 작업에서 함께 삭제한다. Supabase의 `qa_item_status` 테이블 자체(DB 마이그레이션)는 이번 범위에 포함하지 않는다 — 별도 후속 작업.

**Tech Stack:** React + TanStack Query + Supabase(PostgREST), Vitest.

**⚠️ 이 계획에서 새로 내린 설계 결정 (HANDOFF.md에는 없던 내용):** 새 스키마는 이벤트·커스텀 속성 단위로만 체크리스트 항목을 만든다 — 프로퍼티(`property`)는 부모 이벤트의 구조 검증에 뭉쳐 판정되고, 개별 프로�티별 pass/fail 레코드가 없다. 그래서 이 계획은 **QA 환경별 커버리지 바(bar)의 분모를 "활성 이벤트 + 활성 커스텀 속성"으로 좁힌다** — 기존엔 프로퍼티까지 포함한 전체 택소노미 항목이 분모였다. 화면 최상단 "전체 커버리지 항목" Stat도 같은 분모로 맞춰서(Task 3) 화면 안에서 숫자가 서로 어긋나 보이지 않게 한다. "이벤트"/"속성" 두 Stat(택소노미 규모 자체를 보여주는 카드)은 이 변경과 무관하니 그대로 둔다.

---

### Task 1: 순수 커버리지 계산 함수 추가 (`qa-workflow.ts`)

**Files:**
- Modify: `src/lib/qa-workflow.ts`
- Test: `src/lib/qa-workflow.test.ts`

- [ ] **Step 1: 실패하는 테스트부터 작성**

`src/lib/qa-workflow.test.ts` 파일 맨 위 import에 아래를 추가:

```ts
import {
  checklistCoverageIssues,
  checklistTargetKey,
  environmentChecklistCoverage,
  flattenChecklistCoverageRounds,
  latestRoundChecklistRows,
  type ChecklistCoverageRow,
} from "@/lib/qa-workflow";
import type { CoverageItem } from "@/lib/queries";
```

파일 끝에 아래 테스트 블록을 추가:

```ts
describe("flattenChecklistCoverageRounds", () => {
  it("flattens nested rounds/sessions/items/results into rows", () => {
    const raw = [
      {
        id: "round-1",
        qa_environment_id: "env-1",
        round_number: 1,
        qa_sessions: [
          {
            id: "session-1",
            qa_round_checklist_items: [
              {
                id: "item-1",
                target_type: "event" as const,
                target_id: "ev-1",
                disposition: "unresolved" as const,
                qa_checklist_item_results: [
                  { final_status: "passed" as const, updated_at: "2026-08-01T00:00:00Z" },
                ],
              },
              {
                id: "item-2",
                target_type: "custom_attribute" as const,
                target_id: "attr-1",
                disposition: "unresolved" as const,
                qa_checklist_item_results: [],
              },
            ],
          },
        ],
      },
    ];

    expect(flattenChecklistCoverageRounds(raw)).toEqual([
      {
        qa_environment_id: "env-1",
        qa_round_id: "round-1",
        round_number: 1,
        qa_session_id: "session-1",
        checklist_item_id: "item-1",
        target_type: "event",
        target_id: "ev-1",
        disposition: "unresolved",
        final_status: "passed",
        result_updated_at: "2026-08-01T00:00:00Z",
      },
      {
        qa_environment_id: "env-1",
        qa_round_id: "round-1",
        round_number: 1,
        qa_session_id: "session-1",
        checklist_item_id: "item-2",
        target_type: "custom_attribute",
        target_id: "attr-1",
        disposition: "unresolved",
        final_status: null,
        result_updated_at: null,
      },
    ]);
  });
});

describe("checklistTargetKey", () => {
  it("prefixes event targets with 'event:'", () => {
    expect(checklistTargetKey({ target_type: "event", target_id: "ev-1" })).toBe("event:ev-1");
  });

  it("prefixes custom_attribute targets with 'attribute:' to match CoverageItem.key", () => {
    expect(checklistTargetKey({ target_type: "custom_attribute", target_id: "attr-1" })).toBe(
      "attribute:attr-1",
    );
  });
});

function row(overrides: Partial<ChecklistCoverageRow>): ChecklistCoverageRow {
  return {
    qa_environment_id: "env-1",
    qa_round_id: "round-1",
    round_number: 1,
    qa_session_id: "session-1",
    checklist_item_id: "item-1",
    target_type: "event",
    target_id: "ev-1",
    disposition: "unresolved",
    final_status: null,
    result_updated_at: null,
    ...overrides,
  };
}

describe("latestRoundChecklistRows", () => {
  it("only returns rows from the highest round_number for that environment", () => {
    const rows = [
      row({ round_number: 1, checklist_item_id: "old", final_status: "failed" }),
      row({ round_number: 2, checklist_item_id: "new", final_status: "passed" }),
    ];
    const result = latestRoundChecklistRows(rows, "env-1");
    expect(result.map((r) => r.checklist_item_id)).toEqual(["new"]);
  });

  it("ignores rows from other environments", () => {
    const rows = [
      row({ qa_environment_id: "env-2", round_number: 5 }),
      row({ qa_environment_id: "env-1", round_number: 1 }),
    ];
    expect(latestRoundChecklistRows(rows, "env-1")).toHaveLength(1);
  });

  it("returns an empty array when the environment has no rows at all", () => {
    expect(latestRoundChecklistRows([], "env-1")).toEqual([]);
  });

  it("dedupes a target that appears twice in the same round (two sessions), keeping the most recently judged row", () => {
    const rows = [
      row({
        checklist_item_id: "stale",
        qa_session_id: "session-1",
        final_status: "failed",
        result_updated_at: "2026-08-01T00:00:00Z",
      }),
      row({
        checklist_item_id: "fresh",
        qa_session_id: "session-2",
        final_status: "passed",
        result_updated_at: "2026-08-02T00:00:00Z",
      }),
    ];
    const result = latestRoundChecklistRows(rows, "env-1");
    expect(result).toHaveLength(1);
    expect(result[0].checklist_item_id).toBe("fresh");
  });
});

describe("environmentChecklistCoverage", () => {
  const items: CoverageItem[] = [
    { key: "event:ev-1", kind: "event", id: "ev-1", label: "cart_item_added", eventName: null },
    { key: "event:ev-2", kind: "event", id: "ev-2", label: "checkout_started", eventName: null },
    { key: "attribute:attr-1", kind: "attribute", id: "attr-1", label: "email", eventName: null },
  ];

  it("counts passed/failed/not-collected targets from the latest round only", () => {
    const rows = [
      row({ target_type: "event", target_id: "ev-1", final_status: "passed" }),
      row({
        checklist_item_id: "item-2",
        target_type: "event",
        target_id: "ev-2",
        final_status: "failed",
      }),
      row({
        checklist_item_id: "item-3",
        target_type: "custom_attribute",
        target_id: "attr-1",
        final_status: "not_collected",
      }),
    ];
    expect(environmentChecklistCoverage(items, rows, "env-1")).toEqual({
      total: 3,
      verified: 1,
      failed: 1,
      notStarted: 1,
      ratio: 1 / 3,
    });
  });

  it("counts passed_override disposition as verified even when final_status is failed", () => {
    const rows = [
      row({
        target_type: "event",
        target_id: "ev-1",
        disposition: "passed_override",
        final_status: "failed",
      }),
    ];
    const result = environmentChecklistCoverage(items, rows, "env-1");
    expect(result.verified).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("ignores older rounds — a failure two rounds ago doesn't count if the item passed since", () => {
    const rows = [
      row({ round_number: 1, target_type: "event", target_id: "ev-1", final_status: "failed" }),
      row({
        checklist_item_id: "item-2",
        round_number: 2,
        target_type: "event",
        target_id: "ev-1",
        final_status: "passed",
      }),
    ];
    const result = environmentChecklistCoverage(items, rows, "env-1");
    expect(result.verified).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("treats an environment with no rounds at all as fully not-started", () => {
    expect(environmentChecklistCoverage(items, [], "env-1")).toEqual({
      total: 3,
      verified: 0,
      failed: 0,
      notStarted: 3,
      ratio: 0,
    });
  });
});

describe("checklistCoverageIssues", () => {
  it("surfaces unresolved+failed items as 'failed' issues", () => {
    const rows = [row({ disposition: "unresolved", final_status: "failed" })];
    expect(checklistCoverageIssues(rows, ["env-1"])).toEqual([
      {
        itemKey: "event:ev-1",
        environmentId: "env-1",
        roundId: "round-1",
        sessionId: "session-1",
        checklistItemId: "item-1",
        status: "failed",
      },
    ]);
  });

  it("surfaces 'discussing' items regardless of final_status", () => {
    const rows = [row({ disposition: "discussing", final_status: "not_collected" })];
    const result = checklistCoverageIssues(rows, ["env-1"]);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("discussing");
  });

  it("does not surface passed, passed_override, or carried_over items as issues", () => {
    const rows = [
      row({ checklist_item_id: "a", disposition: "unresolved", final_status: "passed" }),
      row({ checklist_item_id: "b", disposition: "passed_override", final_status: "failed" }),
      row({ checklist_item_id: "c", disposition: "carried_over", final_status: "failed" }),
    ];
    expect(checklistCoverageIssues(rows, ["env-1"])).toEqual([]);
  });

  it("only looks at each environment's latest round", () => {
    const rows = [
      row({ round_number: 1, disposition: "unresolved", final_status: "failed" }),
      row({
        checklist_item_id: "item-2",
        round_number: 2,
        disposition: "unresolved",
        final_status: "passed",
      }),
    ];
    expect(checklistCoverageIssues(rows, ["env-1"])).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/lib/qa-workflow.test.ts`
Expected: FAIL — `flattenChecklistCoverageRounds`, `checklistTargetKey`, `latestRoundChecklistRows`, `environmentChecklistCoverage`, `checklistCoverageIssues`가 `@/lib/qa-workflow`에 없다는 에러.

- [ ] **Step 3: 구현 작성**

`src/lib/qa-workflow.ts` 맨 위 import 블록을 아래로 교체 (기존 `QaAttributeSnapshot, QaRunEvent` import에 `ChecklistDisposition` 추가):

```ts
import type { ChecklistDisposition, QaAttributeSnapshot, QaRunEvent } from "@/lib/qa-rounds-queries";
import type { CoverageItem, EnvironmentCoverage } from "@/lib/queries";
```

파일 끝(기존 `previousChecklistItemId` 함수 뒤)에 아래를 추가:

```ts
/* ---------------- Checklist-based environment coverage ----------------
 * Direction B of the 2026-08-03 overview rewrite: coverage reads directly from
 * qa_rounds → qa_sessions → qa_round_checklist_items → qa_checklist_item_results
 * instead of the frozen qa_item_status snapshot table. Only each environment's
 * highest round_number is considered — carried-over items live on in the next
 * round, so summing across all rounds would double-count history.
 */

export type ChecklistCoverageRow = {
  qa_environment_id: string;
  qa_round_id: string;
  round_number: number;
  qa_session_id: string;
  checklist_item_id: string;
  target_type: "event" | "custom_attribute";
  target_id: string;
  disposition: ChecklistDisposition;
  final_status: "passed" | "failed" | "not_collected" | null;
  result_updated_at: string | null;
};

type RawChecklistItemResult = { final_status: "passed" | "failed" | "not_collected"; updated_at: string };
type RawChecklistItem = {
  id: string;
  target_type: "event" | "custom_attribute";
  target_id: string;
  disposition: ChecklistDisposition;
  qa_checklist_item_results: RawChecklistItemResult[];
};
type RawSession = { id: string; qa_round_checklist_items: RawChecklistItem[] };
type RawRound = {
  id: string;
  qa_environment_id: string;
  round_number: number;
  qa_sessions: RawSession[];
};

export function flattenChecklistCoverageRounds(rounds: RawRound[]): ChecklistCoverageRow[] {
  const rows: ChecklistCoverageRow[] = [];
  for (const round of rounds) {
    for (const session of round.qa_sessions ?? []) {
      for (const item of session.qa_round_checklist_items ?? []) {
        const result = item.qa_checklist_item_results?.[0];
        rows.push({
          qa_environment_id: round.qa_environment_id,
          qa_round_id: round.id,
          round_number: round.round_number,
          qa_session_id: session.id,
          checklist_item_id: item.id,
          target_type: item.target_type,
          target_id: item.target_id,
          disposition: item.disposition,
          final_status: result?.final_status ?? null,
          result_updated_at: result?.updated_at ?? null,
        });
      }
    }
  }
  return rows;
}

// Matches CoverageItem.key from queries.ts ("event:<id>" / "attribute:<id>") so
// the two can be joined by a plain Map lookup.
export function checklistTargetKey(row: { target_type: "event" | "custom_attribute"; target_id: string }): string {
  return row.target_type === "event" ? `event:${row.target_id}` : `attribute:${row.target_id}`;
}

export function latestRoundChecklistRows(
  rows: ChecklistCoverageRow[],
  environmentId: string,
): ChecklistCoverageRow[] {
  const envRows = rows.filter((r) => r.qa_environment_id === environmentId);
  if (envRows.length === 0) return [];
  const latestRoundNumber = Math.max(...envRows.map((r) => r.round_number));
  const latestRows = envRows.filter((r) => r.round_number === latestRoundNumber);

  // A target can end up in two sessions of the same round (e.g. added again by
  // mistake) — keep only the most recently judged row so a stale duplicate can't
  // shadow a fresher pass/fail.
  const byTarget = new Map<string, ChecklistCoverageRow>();
  for (const current of latestRows) {
    const key = checklistTargetKey(current);
    const existing = byTarget.get(key);
    if (!existing || (current.result_updated_at ?? "") > (existing.result_updated_at ?? "")) {
      byTarget.set(key, current);
    }
  }
  return [...byTarget.values()];
}

export function environmentChecklistCoverage(
  items: CoverageItem[],
  rows: ChecklistCoverageRow[],
  environmentId: string,
): EnvironmentCoverage {
  const byKey = new Map(
    latestRoundChecklistRows(rows, environmentId).map((r) => [checklistTargetKey(r), r]),
  );
  let verified = 0;
  let failed = 0;
  for (const item of items) {
    const current = byKey.get(item.key);
    if (!current) continue;
    if (current.disposition === "passed_override" || current.final_status === "passed") verified += 1;
    else if (current.final_status === "failed") failed += 1;
  }
  const total = items.length;
  return {
    total,
    verified,
    failed,
    notStarted: total - verified - failed,
    ratio: total === 0 ? 0 : verified / total,
  };
}

export type ChecklistCoverageIssue = {
  itemKey: string;
  environmentId: string;
  roundId: string;
  sessionId: string;
  checklistItemId: string;
  status: "failed" | "discussing";
};

export function checklistCoverageIssues(
  rows: ChecklistCoverageRow[],
  environmentIds: string[],
): ChecklistCoverageIssue[] {
  const issues: ChecklistCoverageIssue[] = [];
  for (const environmentId of environmentIds) {
    for (const current of latestRoundChecklistRows(rows, environmentId)) {
      let status: "failed" | "discussing" | null = null;
      if (current.disposition === "discussing") status = "discussing";
      else if (current.disposition === "unresolved" && current.final_status === "failed") status = "failed";
      if (!status) continue;
      issues.push({
        itemKey: checklistTargetKey(current),
        environmentId,
        roundId: current.qa_round_id,
        sessionId: current.qa_session_id,
        checklistItemId: current.checklist_item_id,
        status,
      });
    }
  }
  return issues;
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/lib/qa-workflow.test.ts`
Expected: PASS — all new `describe` blocks green, plus the pre-existing `deriveSessionStep`/`buildMergedTimeline`/`nextChecklistItemId`/`previousChecklistItemId` tests still green.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/qa-workflow.ts src/lib/qa-workflow.test.ts
git commit -m "feat: add checklist-based environment coverage calculations"
```

---

### Task 2: 프로젝트 단위 체크리스트 커버리지 훅 추가 (`qa-rounds-queries.ts`)

**Files:**
- Modify: `src/lib/qa-rounds-queries.ts`

- [ ] **Step 1: 훅 추가**

`src/lib/qa-rounds-queries.ts` 맨 위 import에 `flattenChecklistCoverageRounds`를 추가:

```ts
import { flattenChecklistCoverageRounds, type ChecklistCoverageRow } from "@/lib/qa-workflow";
```

파일 끝(`useChecklistItemRoundHistory` 함수 뒤)에 아래 훅을 추가:

```ts
export function useProjectChecklistCoverageRows(projectId: string) {
  return useQuery({
    queryKey: ["project-checklist-coverage", projectId],
    enabled: Boolean(projectId),
    queryFn: async (): Promise<ChecklistCoverageRow[]> => {
      const { data, error } = await db
        .from("qa_rounds")
        .select(
          "id, qa_environment_id, round_number, qa_sessions(id, qa_round_checklist_items(id, target_type, target_id, disposition, qa_checklist_item_results(final_status, updated_at)))",
        )
        .eq("project_id", projectId);
      if (error) throw error;
      return flattenChecklistCoverageRounds(data ?? []);
    },
  });
}
```

주의: 이 파일은 `qa-workflow.ts`가 이미 `@/lib/qa-rounds-queries`에서 타입을 import하고 있다(순환 참조 없음 — `qa-workflow.ts`는 타입만 가져오고, 여기서 추가하는 건 `qa-workflow.ts`의 함수/타입이라 방향이 반대). TypeScript의 `import type`은 런타임 순환에 안 걸리니 문제없다.

- [ ] **Step 2: 타입체크로 검증** (이 훅은 순수 함수가 아니라 Supabase 호출이라 단위테스트 대상이 아님 — 이 레포의 다른 `use*` 훅들과 동일한 컨벤션. 실제 동작 확인은 Task 4의 브라우저 검증에서 한다.)

Run: `npx tsc --noEmit`
Expected: 에러 없음 (이 시점엔 아직 `index.tsx`가 옛 임포트를 쓰고 있어도 무관 — Task 2까지는 추가만 했지 아무것도 안 지웠음).

- [ ] **Step 3: 커밋**

```bash
git add src/lib/qa-rounds-queries.ts
git commit -m "feat: add useProjectChecklistCoverageRows hook"
```

---

### Task 3: `ProjectOverview`를 새 데이터소스로 전환 (`index.tsx`)

**Files:**
- Modify: `src/routes/_authenticated/w/$wsId/p/$projectId/index.tsx`

- [ ] **Step 1: import 교체**

`src/routes/_authenticated/w/$wsId/p/$projectId/index.tsx:7-20`의 기존 import 블록:

```ts
import {
  buildCoverageItems,
  environmentCoverage,
  statusKey,
  useActivity,
  useEnvironments,
  useProject,
  useProjectItemStatuses,
  useRules,
  useTaxonomyCustomAttributes,
  useTaxonomyEventProperties,
  useTaxonomyEvents,
  type QaEnvironment,
} from "@/lib/queries";
```

를 아래로 교체:

```ts
import {
  buildCoverageItems,
  useActivity,
  useEnvironments,
  useProject,
  useRules,
  useTaxonomyCustomAttributes,
  useTaxonomyEventProperties,
  useTaxonomyEvents,
  type QaEnvironment,
} from "@/lib/queries";
import { useProjectChecklistCoverageRows } from "@/lib/qa-rounds-queries";
import { checklistCoverageIssues, environmentChecklistCoverage } from "@/lib/qa-workflow";
```

- [ ] **Step 2: 데이터 훅과 파생 값 교체**

`index.tsx:52` (`const { data: statuses = [] } = useProjectItemStatuses(projectId);`) 를:

```ts
  const { data: coverageRows = [] } = useProjectChecklistCoverageRows(projectId);
```

로 교체.

`index.tsx:55-72`의 아래 블록:

```ts
  const items = buildCoverageItems(events, eventProperties, customAttributes);
  const activeEvents = events.filter((e) => e.is_active).length;
  const activeAttributes = items.length - activeEvents;

  const itemByKey = new Map(items.map((i) => [i.key, i]));
  const environmentById = new Map(stages.map((s) => [s.id, s]));
  const issues = statuses
    .filter((s) => s.status === "failed" || s.status === "blocked")
    .map((s) => ({
      id: s.id,
      stage: environmentById.get(s.qa_environment_id),
      item: itemByKey.get(statusKey(s)),
      status: s.status,
      notes: s.notes,
      updatedAt: s.updated_at,
    }))
    .filter((i) => i.stage && i.item)
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "failed" ? -1 : 1));
```

를 아래로 교체:

```ts
  const items = buildCoverageItems(events, eventProperties, customAttributes);
  const activeEvents = events.filter((e) => e.is_active).length;
  const activeAttributes = items.length - activeEvents;

  // The new round/session workflow only judges events and custom attributes —
  // a property's pass/fail is folded into its parent event's structural check,
  // there's no per-property result row. So the checklist-backed coverage bars
  // (and the matching "전체 커버리지 항목" stat below) use a narrower item set
  // than the full taxonomy-size stats above.
  const checklistItems = items.filter((i) => i.kind !== "property");
  const itemByKey = new Map(checklistItems.map((i) => [i.key, i]));
  const environmentById = new Map(stages.map((s) => [s.id, s]));
  const issues = checklistCoverageIssues(
    coverageRows,
    stages.map((s) => s.id),
  )
    .map((issue) => ({
      id: issue.checklistItemId,
      stage: environmentById.get(issue.environmentId),
      item: itemByKey.get(issue.itemKey),
      status: issue.status,
      roundId: issue.roundId,
      sessionId: issue.sessionId,
      checklistItemId: issue.checklistItemId,
    }))
    .filter((i) => i.stage && i.item)
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "failed" ? -1 : 1));
```

- [ ] **Step 3: Stat 카드 분모 맞추기**

`index.tsx:80-84`:

```tsx
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={ListTree} label="이벤트" value={activeEvents} />
        <Stat icon={Layers} label="속성" value={activeAttributes} />
        <Stat icon={ShieldCheck} label="전체 커버리지 항목" value={items.length} />
      </div>
```

세 번째 Stat의 `value`를 `checklistItems.length`로 교체:

```tsx
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={ListTree} label="이벤트" value={activeEvents} />
        <Stat icon={Layers} label="속성" value={activeAttributes} />
        <Stat icon={ShieldCheck} label="전체 커버리지 항목" value={checklistItems.length} />
      </div>
```

- [ ] **Step 4: 커버리지 바 계산 함수 교체**

`index.tsx:106-107`:

```tsx
            {stages.map((stage: QaEnvironment) => {
              const cov = environmentCoverage(items, statuses, stage.id);
```

를:

```tsx
            {stages.map((stage: QaEnvironment) => {
              const cov = environmentChecklistCoverage(checklistItems, coverageRows, stage.id);
```

로 교체.

- [ ] **Step 5: 이슈 목록 렌더링 부분 갱신**

`index.tsx:147-184`의 이슈 목록 `<ul>` 블록 전체를:

```tsx
            <ul className="divide-y">
              {issues.slice(0, 12).map((issue) => (
                <li key={issue.id} className="px-4 py-2.5">
                  <div className="flex items-start gap-2">
                    <AlertTriangle
                      className={
                        issue.status === "failed"
                          ? "mt-0.5 size-4 text-destructive"
                          : "mt-0.5 size-4 text-muted-foreground"
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/$itemId"
                          params={{
                            wsId,
                            projectId,
                            stageSlug: issue.stage!.slug,
                            roundId: issue.roundId,
                            sessionId: issue.sessionId,
                            itemId: issue.checklistItemId,
                          }}
                          className="mono-token truncate text-sm font-medium hover:underline"
                        >
                          {issue.item!.label}
                        </Link>
                        <Pill>{issue.stage!.name}</Pill>
                        <Pill>{issue.status === "failed" ? "실패" : "논의중"}</Pill>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
              {issues.length > 12 ? (
                <li className="px-4 py-2 text-xs text-muted-foreground">
                  외 {issues.length - 12}건이 더 있어요.
                </li>
              ) : null}
            </ul>
```

로 교체. (기존 `formatDateTime(issue.updatedAt)`/`issue.notes` 줄은 삭제 — 새 스키마의 체크리스트 항목엔 `notes`/`updated_at` 필드가 없다. 근거·타임스탬프는 이제 링크를 타고 들어간 항목 상세 페이지의 "근거 로그"/"라운드 이력" 패널에서 본다.)

이 Step에서 `formatDateTime` import(`index.tsx:21`)가 이 파일 안에서 더 이상 안 쓰이는지 확인 — 안 쓰이면 그 import 줄도 삭제.

- [ ] **Step 6: 타입체크 + 린트**

Run: `npx tsc --noEmit && npx eslint src/routes/_authenticated/w/\$wsId/p/\$projectId/index.tsx`
Expected: 에러 없음.

- [ ] **Step 7: 커밋**

```bash
git add "src/routes/_authenticated/w/\$wsId/p/\$projectId/index.tsx"
git commit -m "feat: rewire project overview onto live checklist coverage"
```

---

### Task 4: 죽은 `qa_item_status` 프론트엔드 코드 삭제 (`queries.ts`)

**Files:**
- Modify: `src/lib/queries.ts`

이 시점에 `index.tsx`가 더 이상 `useProjectItemStatuses`/`statusKey`/`environmentCoverage`/`QaItemStatus`를 쓰지 않으므로(Task 3에서 전환 완료), 그리고 다른 어떤 파일도 이걸 참조하지 않으므로(코드베이스 전체 검색으로 확인됨 — 유일한 소비자가 `index.tsx`였음) 안전하게 지운다. **Supabase의 `qa_item_status` 테이블 자체는 지우지 않는다** — DB 마이그레이션은 별도 후속 작업.

- [ ] **Step 1: `QaItemStatus` 타입과 `useProjectItemStatuses` 훅 삭제**

`src/lib/queries.ts:151-162`의 `QaItemStatus` 타입 정의 전체를 삭제.

`src/lib/queries.ts:435-443`의 `useProjectItemStatuses` 함수 전체를 삭제.

`src/lib/queries.ts:3`:

```ts
import type { ItemStatus, WorkspaceRole } from "@/lib/domain";
```

를 (이제 `ItemStatus`가 이 파일에서 안 쓰이므로):

```ts
import type { WorkspaceRole } from "@/lib/domain";
```

로 교체.

- [ ] **Step 2: `statusKey`와 옛 `environmentCoverage` 삭제**

`src/lib/queries.ts:545-588`의 아래 블록:

```ts
export function statusKey(row: {
  event_id: string | null;
  property_id: string | null;
  custom_attribute_id: string | null;
}) {
  if (row.event_id) return `event:${row.event_id}`;
  if (row.property_id) return `property:${row.property_id}`;
  return `attribute:${row.custom_attribute_id}`;
}

export type EnvironmentCoverage = {
  total: number;
  verified: number;
  failed: number;
  notStarted: number;
  ratio: number;
};

export function environmentCoverage(
  items: CoverageItem[],
  statuses: QaItemStatus[],
  environmentId: string,
): EnvironmentCoverage {
  const map = new Map(
    statuses
      .filter((s) => s.qa_environment_id === environmentId)
      .map((s) => [statusKey(s), s.status]),
  );
  let verified = 0;
  let failed = 0;
  for (const item of items) {
    const st = map.get(item.key);
    if (st === "verified") verified += 1;
    else if (st === "failed") failed += 1;
  }
  const total = items.length;
  return {
    total,
    verified,
    failed,
    notStarted: total - verified - failed,
    ratio: total === 0 ? 0 : verified / total,
  };
}
```

를 아래로 교체 (`EnvironmentCoverage` 타입만 남기고, `statusKey`/`environmentCoverage` 함수는 삭제 — `EnvironmentCoverage` 타입은 `qa-workflow.ts`의 `environmentChecklistCoverage`가 계속 반환 타입으로 쓴다):

```ts
export type EnvironmentCoverage = {
  total: number;
  verified: number;
  failed: number;
  notStarted: number;
  ratio: number;
};
```

- [ ] **Step 3: 전체 테스트 + 타입체크 + 린트**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src`
Expected: 전부 통과. (`npx tsc --noEmit`이 여기서 처음으로 "아무도 안 쓰는 legacy 코드가 삭제됐는데 뭔가 아직 참조 중"이라는 에러를 잡아낼 수 있는 지점 — 만약 에러가 나면 Task 3에서 놓친 참조가 남아있다는 뜻이니 그걸 먼저 고칠 것.)

- [ ] **Step 4: 커밋**

```bash
git add src/lib/queries.ts
git commit -m "chore: remove dead qa_item_status frontend code"
```

---

### Task 5: 브라우저로 실사용 검증 (agent-browser)

**목적:** 지금까지의 변경은 전부 타입체크/유닛테스트만 통과했을 뿐, 실제 Supabase의 중첩 셀렉트 쿼리(`qa_rounds(qa_sessions(qa_round_checklist_items(qa_checklist_item_results)))`)가 진짜로 원하는 모양의 데이터를 돌려주는지, 그리고 화면이 실제로 갱신되는지는 아직 한 번도 확인 안 됐다. 이 Task는 코드 수정이 아니라 검증이다.

**사전 준비:**
- dev 서버가 `http://localhost:8080`에 떠 있는지 확인, 없으면 `npm start`.
- agent-browser 프로필 `qa-workspace-test`로 로그인(계정: yoomin.jeong@martinee.io).
- 테스트 프로젝트: 워크스페이스 "CRM" → "신세계 DF"(SSG_DF).

- [ ] **Step 1: agent-browser로 로그인 후 SSG_DF 프로젝트의 개요 탭으로 이동, 스크린샷**

기존에 저장된 프로필로 로그인:
```
agent-browser auth login qa-workspace-test
```
그 뒤 `http://localhost:8080`을 열고 워크스페이스 "CRM" → 프로젝트 "신세계 DF" → 개요 탭으로 이동해 스크린샷을 찍는다. 브라우저 콘솔에 Supabase 쿼리 에러(예: PostgREST가 3단 중첩 임베드를 거부하는 경우 관계를 못 찾겠다는 400)가 없는지 확인한다.

Expected: 콘솔 에러 없음. "QA 환경별 실시간 커버리지" 패널에 각 환경의 커버리지 바가 렌더링됨. 숫자가 0/0이 아니라 실제 체크리스트 항목 수를 반영함(이 프로젝트에 기존 라운드/세션 데이터가 있다면).

- [ ] **Step 2: 실시간 갱신 확인**

개발 QA 환경의 최신 라운드에서 아직 "미시작"(체크리스트에 없는) 이벤트를 하나 골라 체크리스트에 추가하고 통과 판정을 받게 한 뒤(또는 이미 있는 미해결 항목을 "통과로 처리"), 개요 탭으로 돌아와 새로고침 없이(React Query invalidation으로) 혹은 새로고침 후 커버리지 숫자가 바뀌었는지 확인한다.

Expected: verified 카운트가 1 증가하고 커버리지 바 비율이 갱신됨 — HANDOFF.md에서 지적했던 "라운드를 지워도 개요 숫자가 그대로"인 버그가 재현되지 않고, 반대로 상태 변경이 개요에 실시간 반영됨.

- [ ] **Step 3: 팔로업 이슈 목록의 링크 확인**

"팔로업이 필요한 QA 이슈" 패널에서 실패/논의중 항목이 있다면 클릭해서 해당 체크리스트 항목의 상세 페이지(`/qa/$stageSlug/$roundId/$sessionId/$itemId`)로 정확히 이동하는지 확인한다.

Expected: 링크가 깨지지 않고 올바른 항목 상세 화면으로 이동함 (기존 코드는 스테이지 페이지로만 링크했었는데, 이번 변경으로 항목 상세로 바로 가는 게 실제로 동작하는지가 핵심 확인 포인트).

이 Task는 코드 변경이 없으므로 커밋할 것도 없다 — Step 1~3에서 문제가 발견되면 해당 Task(1~4)로 돌아가 고치고 다시 검증한다.

---

## Self-Review 체크리스트 (계획 작성자가 직접 확인)

- **스펙 커버리지:** HANDOFF.md의 "고쳐야 할 부분"(ProjectOverview의 데이터소스 교체)과 "참고할 기존 코드"(EnvironmentCoverage/CoverageItem/CoverageBar 셰입 유지, 최신 라운드만 보기) 둘 다 Task 1~4에서 다뤄짐. "결정해야 할 것"은 방향 B로 확정, 위 ⚠️ 섹션에 설계 결정 명시.
- **플레이스홀더 스캔:** 없음 — 모든 스텝에 실제 코드/커맨드 포함.
- **타입 일관성:** `ChecklistCoverageRow`/`ChecklistCoverageIssue`/`checklistTargetKey`/`environmentChecklistCoverage`/`checklistCoverageIssues`/`latestRoundChecklistRows`/`flattenChecklistCoverageRounds` 이름이 Task 1(정의)·Task 2(훅에서 사용)·Task 3(컴포넌트에서 사용) 전체에서 동일하게 쓰임.
