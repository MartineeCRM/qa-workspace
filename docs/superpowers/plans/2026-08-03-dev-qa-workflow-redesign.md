# 개발 QA 탭 — 라운드 › 세션 › 항목 워크플로우 재구성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `개발 QA`/`운영 QA` 탭(`qa/$stageSlug` 라우트)의 평행한 3탭(라운드/업로드·분석 기록/검증 결과)을, `docs/design-handoff/README.md`(아래 "Design Source"로 인용)에 정의된 라운드 › 세션 › 항목 3단 드릴다운 + 브레드크럼 구조로 재구성한다.

**Design Source:** `/Users/aimed/Downloads/design_handoff_dev_qa_workflow 2/README.md` — 색상·레이아웃·상태 전이·목업 데이터의 기준 문서. 아래 각 태스크는 이 문서의 해당 섹션을 인용한다. HTML 프로토타입(`QA 워크플로우 v3.dc.html`)은 시각 검증용이며 그대로 복사할 코드는 아니다.

**Architecture:** `qa/$stageSlug` 라우트를 레이아웃(`route.tsx`)으로 바꾸고 그 아래에 `$roundId`(라운드) → `$roundId/$sessionId`(세션) → `$roundId/$sessionId/$itemId`(항목) 3단 중첩 라우트를 추가한다. 각 단계는 TanStack Router 파일 기반 라우팅으로 실제 URL을 가지며(항목 페이지는 "공유 가능한 URL" 요구사항 때문에 필수), 상위 `route.tsx`가 데이터를 resolve해서 `Outlet`으로 흘려보낸다. 세션 뷰의 체크리스트/수집/분석/결과 4개 패널은 기존 `qa-rounds-panel.tsx`/`qa-result-panel.tsx`의 쿼리 훅과 판정 로직(`judgeChecklistItem` 등)을 그대로 재사용하고, 레이아웃만 스텝퍼 기반으로 다시 짠다. "처리(disposition)"와 "다음 차수 이월"은 `qa_round_checklist_items`에 새 컬럼을 추가해 구현한다. "논의"는 이미 존재하지만 어디서도 안 쓰이던 `qa_discussions`/`qa_discussion_comments` 테이블을 그대로 wiring한다.

**Tech Stack:** React + TanStack Router(파일 기반 라우팅, `createFileRoute`) + TanStack Query + Supabase(Postgres/RLS) + Tailwind + shadcn/ui + vitest(순수 로직 단위 테스트).

**Scope note (사용자 확인 완료):** 이 라운드/세션 뷰가 제거하는 레거시 `qa_item_status` 기반 코드(상단 "커버리지" 패널, "CSV 올리고 분석하기" 버튼, "업로드·분석 기록"/"검증 결과" 프로젝트 전체 탭)는 프로젝트 "개요" 탭이 보여주는 전체 커버리지 숫자의 **유일한 갱신 경로**였다. 사용자 확인에 따라 레거시 코드는 제거하고, 개요 탭 커버리지는 이번 작업 이후 더 이상 갱신되지 않는 상태로 둔다(별도 "프로젝트 전체 롤업" 프로젝트에서 다룰 사안).

**Simplifications from the design spec (실용적 축소, 각 태스크에서 다시 언급):**
- 항목 뷰의 "이월 대상" 블록에서 라운드 셀렉트는 실제 여러 옵션이 있는 드롭다운이 아니라 "다음 라운드로 이월"을 고정 동작으로 하는 계산된 라벨로 구현한다(README도 목업엔 옵션이 하나뿐).
- "이슈로 내보내기"는 외부 이슈 트래커 연동 없이, 항목의 판정 요약을 클립보드에 복사하는 동작으로 구현한다(README도 이 연동을 "추정" 항목으로만 표시).
- 세션의 진행 "step"은 별도 컬럼으로 저장하지 않고 데이터 존재 여부(`체크리스트 유무`, `ended_at`, `qa_checklist_item_results` 유무)로 그때그때 계산한다.

---

## File Structure

**새로 만들 파일**
- `supabase/migrations/20260803010000_add_checklist_disposition_and_carryover.sql` — 처리/이월/담당자 컬럼 + RLS UPDATE 정책
- `src/lib/qa-workflow.ts` — 순수 로직: 세션 진행 단계 계산, 병합 타임라인 생성, 항목 이전/다음 내비게이션, 라운드 이력(carryover 체인) 조회용 헬퍼
- `src/lib/qa-workflow.test.ts` — 위 순수 로직의 vitest 단위 테스트
- `src/components/app/qa-breadcrumb.tsx` — 브레드크럼
- `src/components/app/qa-round-view.tsx` — 라운드 뷰(세션 카드 그리드 + 라운드 지표)
- `src/components/app/qa-session-view.tsx` — 세션 뷰 셸(헤더 + 스텝퍼 + 패널 스위칭)
- `src/components/app/qa-session-checklist-panel.tsx` — 체크리스트 패널(기존 `ChecklistPanel` 로직 이식 + 출처 배지 + 이월 항목 담기)
- `src/components/app/qa-session-collection-panel.tsx` — 수집 패널(스냅샷 + CSV 업로드 타임라인)
- `src/components/app/qa-session-analysis-panel.tsx` — 분석 패널(병합 데이터셋 테이블)
- `src/components/app/qa-session-results-panel.tsx` — 결과 패널(판정 결과 테이블 + 일괄 이월)
- `src/components/app/qa-item-view.tsx` — 항목 뷰(AI 판정, 근거 로그, 라운드 이력, 처리, 논의, 이전/다음)
- `src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/route.tsx` — 환경 resolve 레이아웃(기존 `$stageSlug.tsx`를 대체)
- `src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/index.tsx` — 최신 라운드로 리다이렉트 / 라운드 없으면 빈 상태
- `src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/route.tsx` — 라운드 resolve 레이아웃
- `src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/index.tsx` — 라운드 뷰 페이지
- `src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/route.tsx` — 세션 resolve 레이아웃
- `src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/index.tsx` — 세션 뷰 페이지
- `src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/$itemId.tsx` — 항목 뷰 페이지

**수정할 파일**
- `src/lib/qa-rounds-queries.ts` — 세션 종료, 처리(disposition), 이월, 논의 쿼리/뮤테이션 추가

**삭제할 파일** (Task 11에서, 다른 모든 태스크가 끝난 뒤)
- `src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug.tsx` (→ `$stageSlug/route.tsx`로 대체)
- `src/components/app/qa-rounds-panel.tsx` (→ `qa-round-view.tsx` + `qa-session-view.tsx` + `qa-session-checklist-panel.tsx` + `qa-session-collection-panel.tsx`로 분해)
- `src/components/app/qa-result-panel.tsx` (→ `qa-session-analysis-panel.tsx` + `qa-session-results-panel.tsx` + `qa-item-view.tsx`로 분해)

---

## Before you start

```bash
cd /Users/aimed/Projects/qa-workspace/.worktrees/dev-qa-workflow-redesign
npm run dev   # http://localhost:8080 (포트는 다를 수 있음, 터미널 출력 확인)
```
로그인은 `yoomin.jeong@martinee.io` / 비밀번호는 사용자에게 직접 물어볼 것 (하드코딩 금지). 테스트 프로젝트는 워크스페이스 "CRM" → 프로젝트 "신세계 DF"(SSG_DF).

---

### Task 1: DB 마이그레이션 — 처리(disposition) · 이월 · 담당자 컬럼

**Files:**
- Create: `supabase/migrations/20260803010000_add_checklist_disposition_and_carryover.sql`

**Why:** `qa_round_checklist_items`엔 지금 체크리스트에 담겼는지 여부만 있고, "통과 처리/다음 차수 이월/논의 중" 같은 처리 상태나 이월 출처를 추적할 컬럼이 없다. `qa_discussions`/`qa_discussion_comments`(논의)는 이미 `20260730040600_add_checklist_results_discussions.sql`에 존재하므로 스키마 변경이 필요 없다.

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
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
```

- [ ] **Step 2: 로컬 Supabase에 적용 (연결돼 있다면)**

Run: `npx supabase db push --dry-run` (연결 안 돼 있으면 스킵하고 다음 태스크에서 실제 쿼리로 검증)
Expected: 에러 없이 위 SQL이 적용 계획에 나타남. 연결이 없다면 이 스텝은 건너뛰고 이후 앱에서 실제 insert/update가 실패하는지로 간접 검증한다(Task 3의 수동 확인에서).

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/20260803010000_add_checklist_disposition_and_carryover.sql
git commit -m "Add disposition, carryover, and assignee columns to qa_round_checklist_items"
```

---

### Task 2: 순수 로직 — 세션 단계, 병합 타임라인, 항목 내비게이션

**Files:**
- Create: `src/lib/qa-workflow.ts`
- Create: `src/lib/qa-workflow.test.ts`

**Why:** 세션의 진행 단계(1~4), 스냅샷+이벤트를 시간순으로 합친 "병합 데이터셋", 항목 뷰의 이전/다음 내비게이션은 여러 컴포넌트(세션 뷰, 분석 패널, 항목 뷰)에서 공유하는 계산이라 컴포넌트 밖의 순수 함수로 뺀다. 이 저장소는 순수 로직만 vitest로 단위 테스트하고 UI는 수동 검증하는 관례를 따른다(`src/lib/checklist-judge.test.ts` 참조).

- [ ] **Step 1: 실패하는 테스트 작성**

```typescript
// src/lib/qa-workflow.test.ts
import { describe, expect, it } from "vitest";
import {
  deriveSessionStep,
  buildMergedTimeline,
  nextChecklistItemId,
  previousChecklistItemId,
} from "@/lib/qa-workflow";
import type { QaAttributeSnapshot, QaRunEvent } from "@/lib/qa-rounds-queries";

describe("deriveSessionStep", () => {
  it("returns 1 when the session has no checklist items", () => {
    expect(deriveSessionStep({ checklistItemCount: 0, endedAt: null, hasResults: false })).toBe(1);
  });

  it("returns 2 when items exist but the session hasn't ended", () => {
    expect(
      deriveSessionStep({ checklistItemCount: 3, endedAt: null, hasResults: false }),
    ).toBe(2);
  });

  it("returns 3 when the session ended but analysis hasn't produced results yet", () => {
    expect(
      deriveSessionStep({
        checklistItemCount: 3,
        endedAt: "2026-08-01T00:00:00Z",
        hasResults: false,
      }),
    ).toBe(3);
  });

  it("returns 4 once results exist", () => {
    expect(
      deriveSessionStep({
        checklistItemCount: 3,
        endedAt: "2026-08-01T00:00:00Z",
        hasResults: true,
      }),
    ).toBe(4);
  });
});

describe("buildMergedTimeline", () => {
  const runEvents: QaRunEvent[] = [
    {
      id: "re1",
      qa_session_id: "s1",
      event_id: "ev1",
      raw_event_name: "cart_item_added",
      occurred_at: "2026-07-31T22:05:18Z",
      external_user_id: "u1",
      raw_properties: { sku: "A-2213", qty: 1 },
    },
  ];
  const snapshots: QaAttributeSnapshot[] = [
    {
      id: "sn1",
      qa_session_id: "s1",
      external_user_id: "u1",
      snapshot_name: "담기 전",
      status: "captured",
      payload: { cart_item_count: 0 },
      previous_snapshot_id: null,
      requested_at: "2026-07-31T22:03:00Z",
      captured_at: "2026-07-31T22:03:11Z",
    },
    {
      id: "sn2",
      qa_session_id: "s1",
      external_user_id: "u1",
      snapshot_name: "담은 후",
      status: "captured",
      payload: { cart_item_count: 1 },
      previous_snapshot_id: "sn1",
      requested_at: "2026-07-31T22:06:40Z",
      captured_at: "2026-07-31T22:06:52Z",
    },
  ];

  it("orders rows chronologically and only emits changed attribute keys per snapshot", () => {
    const rows = buildMergedTimeline(runEvents, snapshots);
    expect(rows.map((r) => r.name)).toEqual(["cart_item_count", "cart_item_added"]);
    expect(rows[0]).toMatchObject({
      source: "snapshot",
      name: "cart_item_count",
      change: "0 → 1",
    });
    expect(rows[1]).toMatchObject({ source: "event", name: "cart_item_added" });
  });

  it("emits no row for the first snapshot (nothing to diff against)", () => {
    const rows = buildMergedTimeline([], [snapshots[0]]);
    expect(rows).toEqual([]);
  });
});

describe("checklist item navigation", () => {
  const ids = ["a", "b", "c"];

  it("wraps around at the end and the start", () => {
    expect(nextChecklistItemId(ids, "c")).toBe("a");
    expect(previousChecklistItemId(ids, "a")).toBe("c");
  });

  it("moves to the adjacent id otherwise", () => {
    expect(nextChecklistItemId(ids, "a")).toBe("b");
    expect(previousChecklistItemId(ids, "c")).toBe("b");
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run src/lib/qa-workflow.test.ts`
Expected: FAIL — `Cannot find module '@/lib/qa-workflow'`

- [ ] **Step 3: 최소 구현 작성**

```typescript
// src/lib/qa-workflow.ts
import type { QaAttributeSnapshot, QaRunEvent } from "@/lib/qa-rounds-queries";

export function deriveSessionStep(input: {
  checklistItemCount: number;
  endedAt: string | null;
  hasResults: boolean;
}): 1 | 2 | 3 | 4 {
  if (input.checklistItemCount === 0) return 1;
  if (!input.endedAt) return 2;
  if (!input.hasResults) return 3;
  return 4;
}

export type MergedTimelineRow = {
  key: string;
  occurredAt: string;
  source: "event" | "snapshot";
  name: string;
  change: string;
};

function formatValue(value: unknown): string {
  if (value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function buildMergedTimeline(
  runEvents: QaRunEvent[],
  snapshots: QaAttributeSnapshot[],
): MergedTimelineRow[] {
  const eventRows: MergedTimelineRow[] = runEvents.map((e) => ({
    key: `event:${e.id}`,
    occurredAt: e.occurred_at,
    source: "event",
    name: e.raw_event_name,
    change: Object.entries(e.raw_properties)
      .map(([k, v]) => `${k}=${formatValue(v)}`)
      .join(", "),
  }));

  const capturedSnapshots = [...snapshots]
    .filter((s) => s.status === "captured" && s.captured_at)
    .sort((a, b) => (a.captured_at ?? "").localeCompare(b.captured_at ?? ""));

  const snapshotRows: MergedTimelineRow[] = [];
  capturedSnapshots.forEach((snapshot, index) => {
    if (index === 0) return; // 첫 스냅샷은 비교 대상이 없어 변화를 낼 수 없다.
    const previous = capturedSnapshots[index - 1];
    const prevPayload = previous.payload ?? {};
    const payload = snapshot.payload ?? {};
    const keys = new Set([...Object.keys(prevPayload), ...Object.keys(payload)]);
    for (const key of keys) {
      const before = prevPayload[key];
      const after = payload[key];
      if (before === after) continue;
      snapshotRows.push({
        key: `snapshot:${snapshot.id}:${key}`,
        occurredAt: snapshot.captured_at as string,
        source: "snapshot",
        name: key,
        change: `${formatValue(before)} → ${formatValue(after)}`,
      });
    }
  });

  return [...snapshotRows, ...eventRows].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

export function nextChecklistItemId(orderedIds: string[], currentId: string): string {
  const index = orderedIds.indexOf(currentId);
  return orderedIds[(index + 1) % orderedIds.length];
}

export function previousChecklistItemId(orderedIds: string[], currentId: string): string {
  const index = orderedIds.indexOf(currentId);
  return orderedIds[(index - 1 + orderedIds.length) % orderedIds.length];
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/qa-workflow.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/qa-workflow.ts src/lib/qa-workflow.test.ts
git commit -m "Add pure logic for session step derivation, merged timeline, and item navigation"
```

---

### Task 3: 쿼리 레이어 — 세션 종료, 처리, 이월, 논의

**Files:**
- Modify: `src/lib/qa-rounds-queries.ts`

**Why:** 처리(disposition) 확정, 다음 차수 이월, 논의 댓글 작성은 지금 쿼리 레이어에 없다. 기존 파일의 패턴(`db = supabase as any`, `useMutation` + `queryClient.invalidateQueries`)을 그대로 따른다.

- [ ] **Step 1: 세션 종료 뮤테이션 추가**

`src/lib/qa-rounds-queries.ts` 끝에 추가:

```typescript
export function useEndQaSession(roundId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await db
        .from("qa_sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-sessions", roundId] });
    },
  });
}
```

- [ ] **Step 2: 처리(disposition) 타입 + 뮤테이션 추가**

```typescript
export type ChecklistDisposition = "unresolved" | "passed_override" | "carried_over" | "discussing";

export type QaChecklistItemWithDisposition = QaChecklistItem & {
  disposition: ChecklistDisposition;
  carried_from_item_id: string | null;
  assigned_to: string | null;
  disposed_by: string | null;
  disposed_at: string | null;
};

export function useSetDisposition(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemId,
      disposition,
      userId,
    }: {
      itemId: string;
      disposition: "passed_override" | "discussing";
      userId: string;
    }) => {
      const { error } = await db
        .from("qa_round_checklist_items")
        .update({ disposition, disposed_by: userId, disposed_at: new Date().toISOString() })
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-checklist-items", sessionId] });
    },
  });
}
```

`useQaChecklistItems`의 반환 타입도 새 컬럼을 포함하도록 갱신한다 (같은 파일, 기존 함수 수정):

```typescript
export function useQaChecklistItems(sessionId: string) {
  return useQuery({
    queryKey: ["qa-checklist-items", sessionId],
    enabled: Boolean(sessionId),
    queryFn: async () => {
      const { data, error } = await db
        .from("qa_round_checklist_items")
        .select("*, qa_checklist_item_results(*)")
        .eq("qa_session_id", sessionId);
      if (error) throw error;
      return data as (QaChecklistItemWithDisposition & {
        qa_checklist_item_results: QaChecklistItemResult[];
      })[];
    },
  });
}
```

- [ ] **Step 3: 일괄/개별 이월 뮤테이션 추가**

```typescript
export function useCarryOverItems(environmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      items,
      userId,
      assigneeId,
    }: {
      items: Array<{ id: string; qa_session_id: string; target_type: "event" | "custom_attribute"; target_id: string }>;
      userId: string;
      assigneeId: string | null;
    }) => {
      if (items.length === 0) return;
      const sessionId = items[0].qa_session_id;

      const { data: session, error: sessionError } = await db
        .from("qa_sessions")
        .select("qa_round_id")
        .eq("id", sessionId)
        .single();
      if (sessionError) throw sessionError;

      const { data: round, error: roundError } = await db
        .from("qa_rounds")
        .select("qa_environment_id, project_id, round_number")
        .eq("id", session.qa_round_id)
        .single();
      if (roundError) throw roundError;

      const { data: existingNextRound, error: nextRoundError } = await db
        .from("qa_rounds")
        .select("id")
        .eq("qa_environment_id", round.qa_environment_id)
        .eq("round_number", round.round_number + 1)
        .maybeSingle();
      if (nextRoundError) throw nextRoundError;

      let nextRoundId: string = existingNextRound?.id;
      if (!nextRoundId) {
        const { data: createdRound, error: createRoundError } = await db
          .from("qa_rounds")
          .insert({
            project_id: round.project_id,
            qa_environment_id: round.qa_environment_id,
            round_number: round.round_number + 1,
            previous_round_id: session.qa_round_id,
            started_by: userId,
          })
          .select()
          .single();
        if (createRoundError) throw createRoundError;
        nextRoundId = createdRound.id;
      }

      const { data: existingNextSession, error: nextSessionError } = await db
        .from("qa_sessions")
        .select("id")
        .eq("qa_round_id", nextRoundId)
        .eq("name", "이월 항목")
        .maybeSingle();
      if (nextSessionError) throw nextSessionError;

      let nextSessionId: string = existingNextSession?.id;
      if (!nextSessionId) {
        const { data: createdSession, error: createSessionError } = await db
          .from("qa_sessions")
          .insert({ qa_round_id: nextRoundId, name: "이월 항목", started_by: userId })
          .select()
          .single();
        if (createSessionError) throw createSessionError;
        nextSessionId = createdSession.id;
      }

      const rows = items.map((item) => ({
        qa_session_id: nextSessionId,
        target_type: item.target_type,
        target_id: item.target_id,
        carried_from_item_id: item.id,
        assigned_to: assigneeId,
      }));
      const { error: insertError } = await db
        .from("qa_round_checklist_items")
        .upsert(rows, { onConflict: "qa_session_id,target_type,target_id", ignoreDuplicates: true });
      if (insertError) throw insertError;

      const { error: dispositionError } = await db
        .from("qa_round_checklist_items")
        .update({
          disposition: "carried_over",
          disposed_by: userId,
          disposed_at: new Date().toISOString(),
        })
        .in(
          "id",
          items.map((i) => i.id),
        );
      if (dispositionError) throw dispositionError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-checklist-items"] });
      qc.invalidateQueries({ queryKey: ["qa-sessions"] });
      qc.invalidateQueries({ queryKey: ["qa-rounds", environmentId] });
    },
  });
}
```

- [ ] **Step 4: 논의 타입 + 쿼리/뮤테이션 추가**

```typescript
export type QaDiscussionComment = {
  id: string;
  discussion_id: string;
  author_id: string;
  body: string;
  is_resolution: boolean;
  created_at: string;
};

export type QaDiscussion = {
  id: string;
  checklist_item_result_id: string;
  status: "open" | "resolved";
  created_by: string;
  created_at: string;
  qa_discussion_comments: QaDiscussionComment[];
};

export function useQaDiscussion(resultId: string) {
  return useQuery({
    queryKey: ["qa-discussion", resultId],
    enabled: Boolean(resultId),
    queryFn: async () => {
      const { data, error } = await db
        .from("qa_discussions")
        .select("*, qa_discussion_comments(*)")
        .eq("checklist_item_result_id", resultId)
        .maybeSingle();
      if (error) throw error;
      return data as QaDiscussion | null;
    },
  });
}

export function useAddDiscussionComment(resultId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      body,
      discussionId,
    }: {
      userId: string;
      body: string;
      discussionId: string | null;
    }) => {
      let id = discussionId;
      if (!id) {
        const { data, error } = await db
          .from("qa_discussions")
          .insert({ checklist_item_result_id: resultId, created_by: userId })
          .select()
          .single();
        if (error) throw error;
        id = data.id;
      }
      const { error: commentError } = await db
        .from("qa_discussion_comments")
        .insert({ discussion_id: id, author_id: userId, body });
      if (commentError) throw commentError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-discussion", resultId] });
    },
  });
}
```

- [ ] **Step 5: 타입체크로 검증**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (아직 아무 컴포넌트도 이 훅들을 안 쓰지만, 파일 자체는 컴파일돼야 한다)

- [ ] **Step 6: 커밋**

```bash
git add src/lib/qa-rounds-queries.ts
git commit -m "Add session-end, disposition, carryover, and discussion queries"
```

---

### Task 4: 브레드크럼 컴포넌트

**Files:**
- Create: `src/components/app/qa-breadcrumb.tsx`

**Design Source:** README "Screens / Views" 상단 공통 브레드크럼 스펙 — "마지막 항목만 `#1c2431/600`, 나머지는 `#8b97a8/400`에 클릭 가능(hover `#2b6a9c`), 구분자 `/`는 `#cbd4de`", "폰트 12.5px, gap 7px, `flex-wrap: wrap`", "뷰 전환 시 `window.scrollTo(0,0)`".

- [ ] **Step 1: 컴포넌트 작성**

```typescript
// src/components/app/qa-breadcrumb.tsx
import { Link } from "@tanstack/react-router";
import { Fragment } from "react";

export type QaBreadcrumbItem = {
  label: string;
  to?: string;
  params?: Record<string, string>;
};

export function QaBreadcrumb({ items }: { items: QaBreadcrumbItem[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-[7px] text-[12.5px]">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <Fragment key={`${item.label}-${index}`}>
            {index > 0 ? <span className="text-[#cbd4de]">/</span> : null}
            {isLast || !item.to ? (
              <span className={isLast ? "font-semibold text-[#1c2431]" : "text-[#8b97a8]"}>
                {item.label}
              </span>
            ) : (
              <Link
                to={item.to}
                params={item.params}
                className="text-[#8b97a8] hover:text-[#2b6a9c]"
              >
                {item.label}
              </Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: 타입체크로 검증**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/components/app/qa-breadcrumb.tsx
git commit -m "Add QA breadcrumb component"
```

---

### Task 5: 라우트 스캐폴드 — `$stageSlug`를 레이아웃으로 전환

**Files:**
- Create: `src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/route.tsx`
- Create: `src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/index.tsx`
- Delete: `src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug.tsx` (아래 Step 1에서 새 위치로 옮기며 삭제)

**Why:** 지금 `$stageSlug.tsx`는 리프 라우트라 자식 라우트를 가질 수 없다. 같은 이름의 폴더로 바꾸고 `route.tsx`(레이아웃) + `index.tsx`(기본 화면)로 분리해야 `$roundId`, `$sessionId`, `$itemId`를 자식으로 추가할 수 있다. 레거시 `qa_item_status` 기반 코드(커버리지 패널, CSV 업로드 버튼, 업로드·분석 기록/검증 결과 탭)는 여기서 전부 제거한다 — 위 "Scope note" 참고.

- [ ] **Step 1: 기존 파일 삭제하고 레이아웃 작성**

```bash
git rm "src/routes/_authenticated/w/\$wsId/p/\$projectId/qa/\$stageSlug.tsx"
mkdir -p "src/routes/_authenticated/w/\$wsId/p/\$projectId/qa/\$stageSlug"
```

```typescript
// src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/route.tsx
import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { EmptyState } from "@/components/app/layout-parts";
import { useEnvironments } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug")({
  head: () => ({
    meta: [
      { title: "QA 환경 — 라운드별 검증 워크플로우" },
      {
        name: "description",
        content: "라운드마다 세션을 나눠 체크리스트를 만들고, 로그를 모아 판정하고, 처리 결과를 이어갑니다.",
      },
    ],
  }),
  component: StageLayout,
});

function StageLayout() {
  const { projectId, stageSlug } = useParams({
    from: "/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug",
  });
  const { data: stages = [] } = useEnvironments(projectId);
  const stage = stages.find((s) => s.slug === stageSlug);

  if (stages.length > 0 && !stage) {
    return (
      <div className="p-6">
        <EmptyState
          title="QA 환경을 찾을 수 없어요"
          description="이 프로젝트에는 없는 환경이에요."
        />
      </div>
    );
  }
  if (!stage) return <div className="p-6" />;

  return (
    <div className="min-w-0" style={{ width: "fit-content", minWidth: "100%" }}>
      <div className="min-w-[640px] space-y-4 px-8 pb-[70px] pt-5">
        <Outlet />
      </div>
    </div>
  );
}
```

`width: fit-content; min-width: 100%`와 내부 `min-w-[640px]`은 README "반응형" 절의 요구사항(래퍼가 뷰포트보다 넓은 콘텐츠를 감쌀 때도 문단 줄바꿈은 유지해야 함, `min-width: max-content` 금지)을 그대로 반영한 것이다.

- [ ] **Step 2: 인덱스 라우트(최신 라운드로 리다이렉트) 작성**

```typescript
// src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/index.tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useEnvironments } from "@/lib/queries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const Route = createFileRoute("/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/")({
  beforeLoad: async ({ params }) => {
    const { data: stages } = await db
      .from("qa_environments")
      .select("id")
      .eq("project_id", params.projectId)
      .eq("slug", params.stageSlug)
      .maybeSingle();
    if (!stages) return;

    const { data: rounds } = await db
      .from("qa_rounds")
      .select("id")
      .eq("qa_environment_id", stages.id)
      .order("round_number", { ascending: false })
      .limit(1);

    if (rounds && rounds[0]) {
      throw redirect({
        to: "/w/$wsId/p/$projectId/qa/$stageSlug/$roundId",
        params: { ...params, roundId: rounds[0].id },
      });
    }
  },
  component: NoRoundsYet,
});

function NoRoundsYet() {
  return null;
}
```

체크리스트를 참고: `useEnvironments`는 이 파일에서 실제로 안 쓰지만(“beforeLoad”가 직접 쿼리), import는 남겨두지 않는다 — lint 에러가 나면 지운다.

- [ ] **Step 3: dev 서버로 라우트 트리 재생성 확인**

Run: `npm run dev` (백그라운드로 띄워둔 채, 아래 스텝들 진행)
Expected: 콘솔에 `routeTree.gen.ts` 재생성 로그, 에러 없음. `/w/.../p/.../qa/dev`로 접속하면 흰 화면(아직 라운드 뷰가 없으니 정상)이어야 하고 콘솔에 라우트 매칭 에러가 없어야 한다.

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "Convert qa/\$stageSlug into a layout route, remove legacy coverage UI"
```

---

### Task 6: 라운드 라우트 + 라운드 뷰

**Files:**
- Create: `src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/route.tsx`
- Create: `src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/index.tsx`
- Create: `src/components/app/qa-round-view.tsx`

**Design Source:** README "1. 라운드 뷰" 전체 — 헤더 행, 라운드 칩 행, 라운드 지표 4장, 세션 카드 그리드, 세션 카드 스펙(진행 바 4칸, 메타, 하단 칩), 빈 카드, 목업 데이터 테이블(s1/s2/s3).

- [ ] **Step 1: 라운드 레이아웃 라우트 작성**

```typescript
// src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/route.tsx
import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { EmptyState } from "@/components/app/layout-parts";
import { useQaRounds } from "@/lib/qa-rounds-queries";
import { useEnvironments } from "@/lib/queries";

export const Route = createFileRoute(
  "/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId",
)({
  component: RoundLayout,
});

function RoundLayout() {
  const { projectId, stageSlug, roundId } = useParams({
    from: "/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId",
  });
  const { data: stages = [] } = useEnvironments(projectId);
  const stage = stages.find((s) => s.slug === stageSlug);
  const { data: rounds = [] } = useQaRounds(stage?.id ?? "");
  const round = rounds.find((r) => r.id === roundId);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [roundId]);

  if (rounds.length > 0 && !round) {
    return (
      <EmptyState title="라운드를 찾을 수 없어요" description="삭제됐거나 잘못된 링크예요." />
    );
  }
  if (!round) return null;

  return <Outlet />;
}
```

- [ ] **Step 2: 라운드 뷰 컴포넌트 작성**

라운드 지표는 이 태스크에서 "세션" 카드 하나만 정확하게 채운다 — `통과`/`미해결 오류`/`다음 차수 이월` 3장은 세션별 체크리스트 결과 집계가 필요한데, 그 집계 훅(`useRoundDispositionSummary`)은 Task 11(결과 패널)에서 판정/처리 개념이 다 갖춰진 뒤에 추가한다. 이 컴포넌트는 Task 11 Step 2에서 그 3장을 추가하도록 다시 수정된다 — 지금은 거짓 숫자(항상 0)를 보여주지 않기 위해 아예 렌더링하지 않는다. 같은 이유로 세션 카드의 하단 칩(오류/미처리/논의 개수)도 Task 11에서 추가한다.

```typescript
// src/components/app/qa-round-view.tsx
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/app/layout-parts";
import { useAuth } from "@/lib/auth";
import {
  useCreateQaRound,
  useCreateQaSession,
  useQaRounds,
  useQaSessions,
  type QaRound,
} from "@/lib/qa-rounds-queries";

function SessionProgressBar({ step }: { step: number }) {
  return (
    <div className="mt-3.5 flex gap-[5px]">
      {[1, 2, 3, 4].map((n) => (
        <div
          key={n}
          className="h-1 flex-1 rounded-full"
          style={{
            backgroundColor: n < step ? "#16a34a" : n === step ? "#2b6a9c" : "#e8edf3",
          }}
        />
      ))}
    </div>
  );
}

function RoundMetricCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub: string;
  tone: "neutral" | "success" | "danger" | "purple";
}) {
  const styles =
    tone === "success"
      ? "border-[#cfe8d8] bg-[#f2faf5] text-[#16a34a]"
      : tone === "danger"
        ? "border-[#f4d0d0] bg-[#fdf5f5] text-[#dc2626]"
        : tone === "purple"
          ? "border-[#d9dcf3] bg-[#f6f7fd] text-[#5b5fc7]"
          : "border-[#e3e8ef] bg-white text-[#1c2431]";
  return (
    <div className={`rounded-xl border px-4 py-3.5 ${styles}`}>
      <p className="text-xs font-semibold">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-[11.5px] opacity-75">{sub}</p>
    </div>
  );
}

export function QaRoundView({
  projectId,
  environmentId,
  roundId,
}: {
  projectId: string;
  environmentId: string;
  roundId: string;
}) {
  const { user } = useAuth();
  const { data: rounds = [] } = useQaRounds(environmentId);
  const round = rounds.find((r) => r.id === roundId) as QaRound;
  const { data: sessions = [] } = useQaSessions(roundId);
  const createRound = useCreateQaRound(projectId, environmentId);
  const latestRound = rounds[rounds.length - 1];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[21px] font-bold tracking-[-0.4px]">
            {round.name?.trim() ? round.name : `${round.round_number}차`} 라운드
          </h2>
          <p className="text-[13px] text-[#8b97a8]">
            세션 하나가 체크리스트 → 수집 → 분석 → 결과의 한 사이클이에요.
          </p>
        </div>
        <Button
          onClick={() =>
            user && createRound.mutate({ userId: user.id, previousRoundId: latestRound?.id ?? null })
          }
          disabled={createRound.isPending}
        >
          + 새 라운드 시작
        </Button>
      </div>

      <div className="my-[18px] flex flex-wrap gap-2">
        {rounds.map((r) => (
          <Link
            key={r.id}
            from="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId"
            to="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId"
            params={(prev) => ({ ...prev, roundId: r.id })}
            className={
              r.id === roundId
                ? "rounded-lg border border-[#1c2431] bg-[#1c2431] px-[13px] py-1.5 text-[13px] font-semibold text-white"
                : "rounded-lg border border-[#e3e8ef] bg-white px-[13px] py-1.5 text-[13px] font-medium text-[#64748b]"
            }
          >
            {r.name?.trim() ? r.name : `${r.round_number}차`}
          </Link>
        ))}
      </div>

      <div className="mb-[18px] grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2.5">
        <RoundMetricCard
          label="세션"
          value={sessions.length}
          sub={`수집 중 ${sessions.filter((s) => !s.ended_at).length} · 완료 ${sessions.filter((s) => s.ended_at).length}`}
          tone="neutral"
        />
      </div>

      {sessions.length === 0 ? (
        <EmptyState title="아직 세션이 없어요" description="아래에서 첫 세션을 만들어보세요." />
      ) : null}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
        {sessions.map((s) => (
          <Link
            key={s.id}
            from="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId"
            to="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId"
            params={(prev) => ({ ...prev, sessionId: s.id })}
            className="rounded-[14px] border border-[#e3e8ef] bg-white p-4 hover:border-[#2b6a9c] hover:shadow-[0_2px_10px_rgba(28,36,49,0.06)]"
          >
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-semibold tracking-[-0.2px]">{s.name}</span>
            </div>
            <SessionProgressBar step={s.ended_at ? 3 : 2} />
            <p className="mt-2 text-[11.5px] text-[#8b97a8]">
              {s.ended_at ? "3/4 · 분석 단계" : "2/4 · 수집 단계"}
            </p>
          </Link>
        ))}
        <NewSessionCard roundId={roundId} />
      </div>
    </div>
  );
}

function NewSessionCard({ roundId }: { roundId: string }) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const createSession = useCreateQaSession(roundId);

  function submit() {
    if (!user || !name.trim()) return;
    createSession.mutate({ userId: user.id, name: name.trim() });
    setName("");
  }

  return (
    <div className="flex min-h-[160px] flex-col items-center justify-center gap-1 rounded-[14px] border border-dashed border-[#c8d1dc] p-5 text-center text-[#64748b]">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="장바구니 검증, AOS 검증처럼 자유롭게 그룹핑"
        className="w-full rounded-md border border-[#dbe2ea] px-2 py-1.5 text-[13.5px]"
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />
      <button
        type="button"
        disabled={!user || !name.trim() || createSession.isPending}
        onClick={submit}
        className="mt-1 text-[13.5px] hover:text-[#2b6a9c]"
      >
        + 새 세션
      </button>
    </div>
  );
}
```

라운드 지표는 "세션" 카드 하나만 채워지고 세션 카드의 하단 칩(오류/미처리/논의 개수)은 아직 없다 — Task 11 Step 2에서 `useRoundDispositionSummary`를 추가하며 이 컴포넌트를 다시 수정해 나머지 3장과 칩을 채운다.

- [ ] **Step 3: 라운드 인덱스 라우트에서 연결**

```typescript
// src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/index.tsx
import { createFileRoute, useParams } from "@tanstack/react-router";
import { QaRoundView } from "@/components/app/qa-round-view";
import { useEnvironments } from "@/lib/queries";

export const Route = createFileRoute(
  "/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/",
)({
  component: RoundIndexPage,
});

function RoundIndexPage() {
  const { projectId, stageSlug, roundId } = useParams({
    from: "/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/",
  });
  const { data: stages = [] } = useEnvironments(projectId);
  const stage = stages.find((s) => s.slug === stageSlug);
  if (!stage) return null;

  return <QaRoundView projectId={projectId} environmentId={stage.id} roundId={roundId} />;
}
```

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 수동 확인**

Run: `npm run dev`, 브라우저에서 `/w/.../p/.../qa/dev` 접속
Expected: 최신 라운드로 리다이렉트되고, 라운드 뷰(칩, 세션 목록, "+ 새 세션" 카드)가 뜬다. 새 세션 이름을 입력하고 엔터 → 목록에 즉시 나타남.

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "Add round route and round view (session grid, round chips)"
```

---

### Task 7: 세션 라우트 + 세션 뷰 셸(스텝퍼)

**Files:**
- Create: `src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/route.tsx`
- Create: `src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/index.tsx`
- Create: `src/components/app/qa-session-view.tsx`

**Design Source:** README "2. 세션 뷰" — 헤더(이름+상태 배지+"분석 돌리기"), 메타, 스텝퍼(4개 스텝, 완료/활성/미도달 상태), "단계 진행 게이트"(미도달 클릭 무시).

- [ ] **Step 1: 세션 레이아웃 라우트 작성**

```typescript
// src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/route.tsx
import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { EmptyState } from "@/components/app/layout-parts";
import { useQaSessions } from "@/lib/qa-rounds-queries";

export const Route = createFileRoute(
  "/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId",
)({
  component: SessionLayout,
});

function SessionLayout() {
  const { roundId, sessionId } = useParams({
    from: "/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId",
  });
  const { data: sessions = [] } = useQaSessions(roundId);
  const session = sessions.find((s) => s.id === sessionId);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [sessionId]);

  if (sessions.length > 0 && !session) {
    return <EmptyState title="세션을 찾을 수 없어요" description="삭제됐거나 잘못된 링크예요." />;
  }
  if (!session) return null;

  return <Outlet />;
}
```

- [ ] **Step 2: 세션 뷰 컴포넌트(스텝퍼 + 패널 스위칭) 작성**

```typescript
// src/components/app/qa-session-view.tsx
import { useState } from "react";
import { Check } from "lucide-react";
import { deriveSessionStep } from "@/lib/qa-workflow";
import {
  useQaChecklistItems,
  useQaRunEvents,
  type QaSession,
} from "@/lib/qa-rounds-queries";
import { QaSessionChecklistPanel } from "@/components/app/qa-session-checklist-panel";
import { QaSessionCollectionPanel } from "@/components/app/qa-session-collection-panel";
import { QaSessionAnalysisPanel } from "@/components/app/qa-session-analysis-panel";
import { QaSessionResultsPanel } from "@/components/app/qa-session-results-panel";

const STEPS = [
  { n: 1, label: "체크리스트", sub: "무엇을 검증할지 확정" },
  { n: 2, label: "수집", sub: "스냅샷 + 이벤트 CSV" },
  { n: 3, label: "분석", sub: "시간순 병합 · AI 검증" },
  { n: 4, label: "결과", sub: "판단 · 논의 · 처리" },
] as const;

export function QaSessionView({
  projectId,
  environmentId,
  session,
}: {
  projectId: string;
  environmentId: string;
  session: QaSession;
}) {
  const { data: checklistItems = [] } = useQaChecklistItems(session.id);
  const { data: runEvents = [] } = useQaRunEvents(session.id);
  const hasResults = checklistItems.some((i) => i.qa_checklist_item_results.length > 0);
  const currentStep = deriveSessionStep({
    checklistItemCount: checklistItems.length,
    endedAt: session.ended_at,
    hasResults,
  });
  const [viewingStep, setViewingStep] = useState(currentStep);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[21px] font-bold">{session.name}</h2>
        <p className="mt-1 text-[12.5px] text-[#8b97a8]">
          체크리스트 {checklistItems.length} · 이벤트 {runEvents.length}행
        </p>
      </div>

      <div className="my-[18px] grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2">
        {STEPS.map((step) => {
          const reachable = step.n <= currentStep;
          const isActive = step.n === viewingStep;
          return (
            <button
              key={step.n}
              type="button"
              disabled={!reachable}
              onClick={() => reachable && setViewingStep(step.n)}
              className={`rounded-xl border bg-white p-3.5 text-left ${
                isActive ? "border-[#1c2431]" : "border-[#e3e8ef]"
              } ${!reachable ? "cursor-not-allowed opacity-45" : ""}`}
            >
              <span
                className="inline-flex size-5 items-center justify-center rounded-full text-[11px] font-bold"
                style={{
                  backgroundColor:
                    step.n < currentStep ? "#e8f5ec" : step.n === currentStep ? "#1c2431" : "#eef1f5",
                  color: step.n < currentStep ? "#16a34a" : step.n === currentStep ? "#fff" : "#94a3b8",
                }}
              >
                {step.n < currentStep ? <Check className="size-3" /> : step.n}
              </span>
              <p className="mt-1.5 text-[13.5px] font-semibold">{step.label}</p>
              <p className="text-[11.5px] text-[#8b97a8]">{step.sub}</p>
            </button>
          );
        })}
      </div>

      {viewingStep === 1 ? (
        <QaSessionChecklistPanel projectId={projectId} environmentId={environmentId} session={session} />
      ) : null}
      {viewingStep === 2 ? (
        <QaSessionCollectionPanel projectId={projectId} session={session} />
      ) : null}
      {viewingStep === 3 ? <QaSessionAnalysisPanel session={session} /> : null}
      {viewingStep === 4 ? (
        <QaSessionResultsPanel projectId={projectId} environmentId={environmentId} session={session} />
      ) : null}
    </div>
  );
}
```

`viewingStep`은 세션이 다시 열릴 때마다 `currentStep`에서 시작하도록, 세션이 바뀌면(=컴포넌트가 다른 `session.id`로 다시 마운트되면) 자연히 초기화된다. Task 8~10에서 각 패널을 실제로 만들기 전까진 이 파일은 컴파일되지 않는다 — 그건 정상이며, 다음 태스크들에서 하나씩 채운다.

- [ ] **Step 3: 세션 인덱스 라우트 작성**

```typescript
// src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/index.tsx
import { createFileRoute, useParams } from "@tanstack/react-router";
import { QaSessionView } from "@/components/app/qa-session-view";
import { useQaSessions } from "@/lib/qa-rounds-queries";
import { useEnvironments } from "@/lib/queries";

export const Route = createFileRoute(
  "/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/",
)({
  component: SessionIndexPage,
});

function SessionIndexPage() {
  const { projectId, stageSlug, roundId, sessionId } = useParams({
    from: "/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/",
  });
  const { data: stages = [] } = useEnvironments(projectId);
  const stage = stages.find((s) => s.slug === stageSlug);
  const { data: sessions = [] } = useQaSessions(roundId);
  const session = sessions.find((s) => s.id === sessionId);
  if (!stage || !session) return null;

  return <QaSessionView projectId={projectId} environmentId={stage.id} session={session} />;
}
```

- [ ] **Step 4: 커밋 (이 태스크는 다음 3개 태스크와 함께 컴파일된다는 점을 커밋 메시지에 남긴다)**

```bash
git add -A
git commit -m "Add session route and stepper shell (compiles once panels land in Tasks 8-10)"
```

---

### Task 8: 체크리스트 패널 (기존 로직 이식 + 이월 배지)

**Files:**
- Create: `src/components/app/qa-session-checklist-panel.tsx`
- Modify: `src/lib/qa-rounds-queries.ts` (이월 항목 일괄 담기 뮤테이션 추가)

**Design Source:** README "2-1. 체크리스트 패널" — 설명 문구, 툴바("검색" + "N차 이월 항목 담기 (N)" + "택소노미 전체 추가"), 행 그리드(이름/종류/기대 동작/출처 배지/삭제), 출처 배지 색(신규=중립, N차 이월=보라), 푸터.

- [ ] **Step 1: 이전 라운드에서 이월 대기 중인 항목을 조회하는 훅 추가**

`src/lib/qa-rounds-queries.ts`에 추가 — 세션이 속한 라운드의 `previous_round_id`를 따라가 그 라운드의 세션들에서 `disposition = 'carried_over'`인 항목 중 **이미 이 세션에 담기지 않은 것**을 찾는다:

```typescript
export function usePendingCarryOverItems(sessionId: string, previousRoundId: string | null) {
  return useQuery({
    queryKey: ["qa-pending-carryover", sessionId, previousRoundId],
    enabled: Boolean(sessionId && previousRoundId),
    queryFn: async () => {
      const { data: prevSessions, error: prevSessionsError } = await db
        .from("qa_sessions")
        .select("id")
        .eq("qa_round_id", previousRoundId);
      if (prevSessionsError) throw prevSessionsError;
      const prevSessionIds = (prevSessions ?? []).map((s: { id: string }) => s.id);
      if (prevSessionIds.length === 0) return [];

      const { data: carried, error: carriedError } = await db
        .from("qa_round_checklist_items")
        .select("id, target_type, target_id")
        .in("qa_session_id", prevSessionIds)
        .eq("disposition", "carried_over");
      if (carriedError) throw carriedError;

      const { data: alreadyLinked, error: linkedError } = await db
        .from("qa_round_checklist_items")
        .select("carried_from_item_id")
        .eq("qa_session_id", sessionId)
        .not("carried_from_item_id", "is", null);
      if (linkedError) throw linkedError;
      const linkedIds = new Set(
        (alreadyLinked ?? []).map((r: { carried_from_item_id: string }) => r.carried_from_item_id),
      );

      return (carried ?? []).filter((c: { id: string }) => !linkedIds.has(c.id)) as Array<{
        id: string;
        target_type: "event" | "custom_attribute";
        target_id: string;
      }>;
    },
  });
}

export function useAdoptCarryOverItems(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      items: Array<{ id: string; target_type: "event" | "custom_attribute"; target_id: string }>,
    ) => {
      if (items.length === 0) return;
      const rows = items.map((item) => ({
        qa_session_id: sessionId,
        target_type: item.target_type,
        target_id: item.target_id,
        carried_from_item_id: item.id,
      }));
      const { error } = await db
        .from("qa_round_checklist_items")
        .upsert(rows, { onConflict: "qa_session_id,target_type,target_id", ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-checklist-items", sessionId] });
      qc.invalidateQueries({ queryKey: ["qa-pending-carryover", sessionId] });
    },
  });
}
```

- [ ] **Step 2: 패널 컴포넌트 작성**

`qa-rounds-panel.tsx`의 `ChecklistPanel`(검색/스테이징/전체 추가 로직)을 그대로 옮기되, 출처 배지와 이월 담기 버튼을 추가한다:

```typescript
// src/components/app/qa-session-checklist-panel.tsx
import { useMemo, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, Panel } from "@/components/app/layout-parts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  useAddChecklistItems,
  useAdoptCarryOverItems,
  usePendingCarryOverItems,
  useQaChecklistItems,
  useQaRounds,
  useQaSessions,
  useRemoveChecklistItem,
  type QaSession,
} from "@/lib/qa-rounds-queries";
import {
  useTaxonomyCustomAttributes,
  useTaxonomyEvents,
  type TaxonomyCustomAttribute,
  type TaxonomyEvent,
} from "@/lib/queries";

type SearchTarget =
  | { kind: "event"; id: string; label: string; sub: string | null }
  | { kind: "custom_attribute"; id: string; label: string; sub: string | null };

function SourceBadge({ carried }: { carried: boolean }) {
  return carried ? (
    <span className="inline-flex items-center rounded-full border border-[#d9dcf3] bg-[#eef0fb] px-2 py-0.5 text-[11px] font-semibold text-[#5b5fc7]">
      이월
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-[#e3e8ef] bg-[#f1f4f8] px-2 py-0.5 text-[11px] font-semibold text-[#8b97a8]">
      신규
    </span>
  );
}

export function QaSessionChecklistPanel({
  projectId,
  environmentId,
  session,
}: {
  projectId: string;
  environmentId: string;
  session: QaSession;
}) {
  const { data: events = [] } = useTaxonomyEvents(projectId);
  const { data: customAttributes = [] } = useTaxonomyCustomAttributes(projectId);
  const { data: checklistItems = [] } = useQaChecklistItems(session.id);
  const { data: rounds = [] } = useQaRounds(environmentId);
  const round = rounds.find((r) => r.id === session.qa_round_id);
  const { data: pendingCarryOver = [] } = usePendingCarryOverItems(
    session.id,
    round?.previous_round_id ?? null,
  );
  const adoptCarryOver = useAdoptCarryOverItems(session.id);
  const addItems = useAddChecklistItems(session.id);
  const removeItem = useRemoveChecklistItem(session.id);
  const [search, setSearch] = useState("");
  const [staged, setStaged] = useState<SearchTarget[]>([]);

  const existingKeys = useMemo(
    () => new Set(checklistItems.map((i) => `${i.target_type}:${i.target_id}`)),
    [checklistItems],
  );
  const stagedKeys = useMemo(() => new Set(staged.map((t) => `${t.kind}:${t.id}`)), [staged]);

  const availableTargets: SearchTarget[] = useMemo(() => {
    const eventTargets: SearchTarget[] = events.map((e: TaxonomyEvent) => ({
      kind: "event",
      id: e.id,
      label: e.technical_name,
      sub: e.display_name ?? null,
    }));
    const attrTargets: SearchTarget[] = customAttributes.map((a: TaxonomyCustomAttribute) => ({
      kind: "custom_attribute",
      id: a.id,
      label: a.technical_name,
      sub: a.display_name ?? null,
    }));
    return [...eventTargets, ...attrTargets].filter(
      (t) => !existingKeys.has(`${t.kind}:${t.id}`) && !stagedKeys.has(`${t.kind}:${t.id}`),
    );
  }, [events, customAttributes, existingKeys, stagedKeys]);

  const searchTargets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return availableTargets;
    return availableTargets.filter(
      (t) => t.label.toLowerCase().includes(q) || (t.sub ?? "").toLowerCase().includes(q),
    );
  }, [search, availableTargets]);

  function stageTarget(target: SearchTarget) {
    setStaged((prev) => [...prev, target]);
    setSearch("");
  }

  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || searchTargets.length === 0) return;
    e.preventDefault();
    stageTarget(searchTargets[0]);
  }

  function commitAdd(targets: SearchTarget[]) {
    const eventIds = targets.filter((t) => t.kind === "event").map((t) => t.id);
    const customAttributeIds = targets.filter((t) => t.kind === "custom_attribute").map((t) => t.id);
    if (eventIds.length === 0 && customAttributeIds.length === 0) return;
    addItems.mutate(
      { eventIds, customAttributeIds },
      { onError: (error) => toast.error(error instanceof Error ? error.message : String(error)) },
    );
  }

  function itemLabel(targetType: "event" | "custom_attribute", targetId: string): string {
    const label =
      targetType === "event"
        ? events.find((e: TaxonomyEvent) => e.id === targetId)?.technical_name
        : customAttributes.find((a: TaxonomyCustomAttribute) => a.id === targetId)?.technical_name;
    return label ?? targetId;
  }

  return (
    <Panel
      title="이번 세션에서 검증할 항목"
      description={
        <>
          택소노미 전체가 아니라 <span className="font-semibold text-[#2b6a9c]">여기 담은 항목만</span>{" "}
          판정됩니다. 지난 라운드에서 이월된 항목은 자동으로 담겨요.
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2 bg-[#fbfcfd] px-5 py-3.5">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="이벤트·attribute 이름 검색 후 엔터"
          className="min-w-[220px] flex-1"
        />
        {pendingCarryOver.length > 0 ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => adoptCarryOver.mutate(pendingCarryOver)}
            disabled={adoptCarryOver.isPending}
          >
            {round?.round_number}차 이월 항목 담기 ({pendingCarryOver.length})
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={() => commitAdd(availableTargets)}>
          택소노미 전체 추가
        </Button>
      </div>

      {staged.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
          {staged.map((t) => (
            <span
              key={`${t.kind}:${t.id}`}
              className="flex items-center gap-1 rounded-full border bg-white px-2 py-1 text-xs"
            >
              <span className="mono-token">{t.label}</span>
              <button
                type="button"
                onClick={() => setStaged((prev) => prev.filter((s) => s.id !== t.id))}
                aria-label={`${t.label} 빼기`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <Button
            size="sm"
            onClick={() => {
              commitAdd(staged);
              setStaged([]);
            }}
          >
            이렇게만 검증
          </Button>
        </div>
      ) : null}

      {checklistItems.length === 0 ? (
        <EmptyState title="이 세션엔 체크리스트 항목이 없어요" description="위에서 검색해 추가해보세요." />
      ) : (
        <ul>
          {checklistItems.map((item) => (
            <li
              key={item.id}
              className="grid grid-cols-[minmax(0,1fr)_90px_130px_100px_28px] items-center gap-3 border-b border-[#f1f4f8] px-5 py-[11px]"
            >
              <span className="mono-token truncate text-[13px]">
                {itemLabel(item.target_type, item.target_id)}
              </span>
              <span className="text-xs text-[#64748b]">
                {item.target_type === "event" ? "이벤트" : "속성"}
              </span>
              <span className="truncate text-[11.5px] text-[#8b97a8]">—</span>
              <SourceBadge carried={Boolean(item.carried_from_item_id)} />
              <button
                type="button"
                onClick={() => removeItem.mutate(item.id)}
                aria-label="체크리스트에서 제거"
                className="text-[#c3ccd8] hover:text-[#64748b]"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="px-5 py-3 text-[12.5px] text-[#8b97a8]">{checklistItems.length}개 담김</p>
    </Panel>
  );
}
```

"기대 동작" 컬럼(README 예시: "담기 후 증가", "false → true 전환")은 사람이 직접 쓰는 자유 텍스트 설명이라 지금 스키마엔 저장할 곳이 없다 — 이 태스크에서는 `—`로 비워두고, 실제로 필요해지면(사용자가 요청하면) `qa_round_checklist_items`에 `expected_behavior text` 컬럼을 추가하는 별도 후속 작업으로 미룬다(YAGNI: 지금 요구된 8개 목업 항목의 "기대 동작" 텍스트를 하드코딩할 이유가 없다).

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 수동 확인**

Run: `npm run dev`, 세션 뷰의 "체크리스트" 스텝에서 이벤트 검색 → 엔터 → 스테이징 → "이렇게만 검증" 클릭
Expected: 항목이 목록에 "신규" 배지와 함께 추가된다. 이전 라운드에서 이월된 항목이 있는 세션이면 "N차 이월 항목 담기 (N)" 버튼이 보이고, 누르면 "이월" 배지가 붙은 항목으로 추가된다.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "Add session checklist panel with carryover adoption"
```

---

### Task 9: 수집 패널 (스냅샷 + CSV 업로드 타임라인)

**Files:**
- Create: `src/components/app/qa-session-collection-panel.tsx`

**Design Source:** README "2-2. 수집 패널" — 헤더 버튼(스냅샷 찍기/CSV 업로드), 타임라인 행(시각/점+세로선/제목+설명/태그), 점·태그 색(시작=중립, 스냅샷=보라, CSV=파랑), 하단 CTA "세션 종료하고 분석으로".

- [ ] **Step 1: 패널 컴포넌트 작성**

기존 `SnapshotPanel`(스냅샷 캡처)과 `ResultPanel`의 CSV 업로드(`parseRunEventsCsv` + `useUploadRunEventsLog`)를 하나의 타임라인으로 합친다:

```typescript
// src/components/app/qa-session-collection-panel.tsx
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Panel } from "@/components/app/layout-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage, formatDateTime } from "@/lib/domain";
import { parseRunEventsCsv } from "@/lib/run-events-csv";
import {
  useCaptureAttributeSnapshot,
  useEndQaSession,
  useQaAttributeSnapshots,
  useQaRunEvents,
  useUploadRunEventsLog,
  type QaSession,
} from "@/lib/qa-rounds-queries";
import { useTaxonomyEvents } from "@/lib/queries";

type TimelineEntry = {
  key: string;
  time: string;
  title: string;
  desc: string;
  tag: "시작" | "스냅샷" | "CSV";
};

export function QaSessionCollectionPanel({
  projectId,
  session,
}: {
  projectId: string;
  session: QaSession;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [brazeId, setBrazeId] = useState("");
  const [snapshotName, setSnapshotName] = useState("");
  const { data: events = [] } = useTaxonomyEvents(projectId);
  const { data: snapshots = [] } = useQaAttributeSnapshots(session.id);
  const { data: runEvents = [] } = useQaRunEvents(session.id);
  const capture = useCaptureAttributeSnapshot(session.id, projectId);
  const uploadLog = useUploadRunEventsLog(session.id);
  const endSession = useEndQaSession(session.qa_round_id);

  const eventByName = useMemo(() => new Map(events.map((e) => [e.technical_name, e])), [events]);

  const timeline: TimelineEntry[] = useMemo(() => {
    const entries: TimelineEntry[] = [
      {
        key: "start",
        time: session.started_at,
        title: "세션 시작",
        desc: "",
        tag: "시작",
      },
      ...snapshots.map((s) => ({
        key: `snapshot:${s.id}`,
        time: s.captured_at ?? s.requested_at,
        title: `스냅샷 "${s.snapshot_name}"`,
        desc: s.payload ? `attribute ${Object.keys(s.payload).length}개` : "요청 중",
        tag: "스냅샷" as const,
      })),
    ];
    const uploadTimes = new Map<string, number>();
    for (const row of runEvents) {
      uploadTimes.set(row.occurred_at, (uploadTimes.get(row.occurred_at) ?? 0) + 1);
    }
    if (runEvents.length > 0) {
      const latest = runEvents[runEvents.length - 1];
      entries.push({
        key: "csv",
        time: latest.occurred_at,
        title: "CSV 업로드",
        desc: `${runEvents.length}행`,
        tag: "CSV",
      });
    }
    return entries.sort((a, b) => a.time.localeCompare(b.time));
  }, [session, snapshots, runEvents]);

  function handleCapture() {
    if (!brazeId.trim() || !snapshotName.trim()) return;
    capture.mutate(
      { brazeId: brazeId.trim(), snapshotName: snapshotName.trim() },
      {
        onSuccess: () => {
          toast.success("스냅샷을 저장했어요");
          setSnapshotName("");
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  }

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const text = await file.text();
      const parsedRows = parseRunEventsCsv(text);
      const rows = parsedRows.map((r) => ({
        ...r,
        event_id: eventByName.get(r.raw_event_name)?.id ?? null,
      }));
      await uploadLog.mutateAsync(rows);
      toast.success("CSV를 업로드했어요");
    } catch (error) {
      toast.error(errorMessage(error, "CSV 업로드에 실패했어요"));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Panel
      title="수집 타임라인"
      description="attribute가 바뀌었을 시점마다 스냅샷을 찍고, 마지막에 활동 로그 CSV를 올리면 세션이 닫힙니다."
      actions={
        <>
          <Input
            value={brazeId}
            onChange={(e) => setBrazeId(e.target.value)}
            placeholder="braze_id"
            className="h-8 w-32"
          />
          <Input
            value={snapshotName}
            onChange={(e) => setSnapshotName(e.target.value)}
            placeholder="스냅샷 이름"
            className="h-8 w-40"
          />
          <Button size="sm" variant="outline" onClick={handleCapture} disabled={capture.isPending}>
            스냅샷 찍기
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
            CSV 업로드
          </Button>
        </>
      }
    >
      <ul className="px-5 py-4">
        {timeline.map((entry, index) => (
          <li key={entry.key} className="grid grid-cols-[78px_20px_minmax(0,1fr)_auto] gap-3.5 py-3">
            <span className="text-xs tabular-nums text-[#8b97a8]">{formatDateTime(entry.time)}</span>
            <span className="flex flex-col items-center">
              <span
                className="size-[9px] rounded-full"
                style={{
                  backgroundColor:
                    entry.tag === "스냅샷" ? "#5b5fc7" : entry.tag === "CSV" ? "#2b6a9c" : "#94a3b8",
                }}
              />
              {index < timeline.length - 1 ? <span className="mt-1 h-full w-px bg-[#e8edf3]" /> : null}
            </span>
            <span>
              <span className="text-[13.5px] font-semibold">{entry.title}</span>
              {entry.desc ? <span className="block text-xs text-[#8b97a8]">{entry.desc}</span> : null}
            </span>
            <span
              className="h-fit rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{
                backgroundColor:
                  entry.tag === "스냅샷" ? "#eef0fb" : entry.tag === "CSV" ? "#eaf1f8" : "#f1f4f8",
                color: entry.tag === "스냅샷" ? "#5b5fc7" : entry.tag === "CSV" ? "#2b6a9c" : "#64748b",
              }}
            >
              {entry.tag}
            </span>
          </li>
        ))}
      </ul>
      <div className="px-5 pb-4">
        <Button
          className="w-full bg-[#1c2431] hover:bg-[#2c3648]"
          disabled={runEvents.length === 0 || endSession.isPending}
          onClick={() =>
            endSession.mutate(session.id, {
              onSuccess: () => toast.success("세션을 종료했어요 — 분석 단계로 넘어가요"),
            })
          }
        >
          세션 종료하고 분석으로
        </Button>
      </div>
    </Panel>
  );
}
```

`CSV 업로드 완료 = 세션 수집 종료 조건`(README)은 버튼을 CSV 업로드 전엔 비활성화하는 걸로 반영했다 — 실제 종료는 여전히 사용자가 버튼을 눌러야 확정된다(설계도 "세션 종료하고 분석으로"를 별도 CTA로 뒀다).

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (Task 7의 `QaSessionView`가 이 패널을 import하므로, 이제 그 파일도 이 부분은 컴파일된다)

- [ ] **Step 3: 수동 확인**

Run: 세션 뷰의 "수집" 스텝에서 스냅샷 찍기 + CSV 업로드
Expected: 타임라인에 시각순으로 항목이 쌓인다. CSV 업로드 전엔 "세션 종료하고 분석으로" 버튼이 비활성화, 업로드 후 활성화.

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "Add session collection panel (snapshot + CSV timeline)"
```

---

### Task 10: 분석 패널 (병합 데이터셋)

**Files:**
- Create: `src/components/app/qa-session-analysis-panel.tsx`

**Design Source:** README "2-3. 분석 패널" — 통계 4칸(병합 행/스냅샷/이벤트/검증 대상), 병합 테이블(시각/출처/이름/값·변화), 출처 배지 색.

- [ ] **Step 1: 패널 컴포넌트 작성**

```typescript
// src/components/app/qa-session-analysis-panel.tsx
import { Panel } from "@/components/app/layout-parts";
import { formatDateTime } from "@/lib/domain";
import { buildMergedTimeline } from "@/lib/qa-workflow";
import { useQaAttributeSnapshots, useQaChecklistItems, useQaRunEvents, type QaSession } from "@/lib/qa-rounds-queries";

export function QaSessionAnalysisPanel({ session }: { session: QaSession }) {
  const { data: runEvents = [] } = useQaRunEvents(session.id);
  const { data: snapshots = [] } = useQaAttributeSnapshots(session.id);
  const { data: checklistItems = [] } = useQaChecklistItems(session.id);
  const rows = buildMergedTimeline(runEvents, snapshots);

  return (
    <Panel
      title="병합 데이터셋"
      description="스냅샷과 이벤트 로그를 시간순으로 합칩니다. 이 테이블이 모든 판정의 근거예요."
    >
      <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5 px-5 py-4">
        {[
          { label: "병합 행", value: rows.length },
          { label: "스냅샷", value: snapshots.length },
          { label: "이벤트", value: runEvents.length },
          { label: "검증 대상", value: checklistItems.length },
        ].map((stat) => (
          <div key={stat.label} className="rounded-[11px] border border-[#eef1f5] bg-[#fbfcfd] px-3.5 py-3.5">
            <p className="text-[11.5px] text-[#8b97a8]">{stat.label}</p>
            <p className="text-xl font-bold">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[88px_76px_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-t bg-[#fbfcfd] px-5 py-2 text-xs font-medium text-[#64748b]">
        <span>시각</span>
        <span>출처</span>
        <span>이름</span>
        <span>값/변화</span>
      </div>
      {rows.map((row) => (
        <div
          key={row.key}
          className="grid grid-cols-[88px_76px_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b border-[#f1f4f8] px-5 py-2.5 text-xs"
        >
          <span className="tabular-nums text-[#8b97a8]">{formatDateTime(row.occurredAt)}</span>
          <span>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{
                backgroundColor: row.source === "snapshot" ? "#eef0fb" : "#eaf1f8",
                color: row.source === "snapshot" ? "#5b5fc7" : "#2b6a9c",
              }}
            >
              {row.source === "snapshot" ? "스냅샷" : "이벤트"}
            </span>
          </span>
          <span className="mono-token truncate">{row.name}</span>
          <span className="mono-token truncate">{row.change}</span>
        </div>
      ))}
    </Panel>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add -A
git commit -m "Add session analysis panel (merged timeline table)"
```

---

### Task 11: 결과 패널 (일괄 이월 포함) + 라운드 지표 복원

**Files:**
- Create: `src/components/app/qa-session-results-panel.tsx`
- Modify: `src/components/app/qa-round-view.tsx` (Task 6에서 생략한 3개 라운드 지표 카드 복원)
- Modify: `src/lib/qa-rounds-queries.ts` (라운드 단위 처리 집계 훅 추가)

**Design Source:** README "2-4. 결과 패널" — 요약 4장(통과/오류/미발생/미처리), 헤더 안내 문구, "미해결 N건 다음 차수로 이월" 버튼, 컬럼 그리드(항목+코멘트 수/판정 사유/판정 배지/처리 배지/›), hover, 행 클릭 → 항목 뷰.

- [ ] **Step 1: 라운드 단위 처리 집계 훅 추가**

`src/lib/qa-rounds-queries.ts`에 추가:

```typescript
export function useRoundDispositionSummary(roundId: string) {
  return useQuery({
    queryKey: ["qa-round-disposition-summary", roundId],
    enabled: Boolean(roundId),
    queryFn: async () => {
      const { data: sessions, error: sessionsError } = await db
        .from("qa_sessions")
        .select("id")
        .eq("qa_round_id", roundId);
      if (sessionsError) throw sessionsError;
      const sessionIds = (sessions ?? []).map((s: { id: string }) => s.id);
      if (sessionIds.length === 0) {
        return { passed: 0, unresolvedErrors: 0, carriedOver: 0 };
      }

      const { data: items, error: itemsError } = await db
        .from("qa_round_checklist_items")
        .select("id, disposition, qa_checklist_item_results(final_status)")
        .in("qa_session_id", sessionIds);
      if (itemsError) throw itemsError;

      let passed = 0;
      let unresolvedErrors = 0;
      let carriedOver = 0;
      for (const item of items ?? []) {
        const finalStatus = item.qa_checklist_item_results?.[0]?.final_status ?? "not_collected";
        if (item.disposition === "carried_over") carriedOver += 1;
        if (item.disposition === "passed_override" || finalStatus === "passed") passed += 1;
        else if (item.disposition === "unresolved" && finalStatus !== "passed") unresolvedErrors += 1;
      }
      return { passed, unresolvedErrors, carriedOver };
    },
  });
}
```

- [ ] **Step 2: 라운드 뷰의 지표 3장 복원**

`src/components/app/qa-round-view.tsx`에서 `useRoundDispositionSummary(roundId)`를 불러와 `passed`/`unresolvedErrors`/`carriedOver` 하드코딩(0)을 교체하고, grid를 4장으로 복원한다:

```typescript
const { data: summary = { passed: 0, unresolvedErrors: 0, carriedOver: 0 } } =
  useRoundDispositionSummary(roundId);
```

```typescript
<div className="mb-[18px] grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2.5">
  <RoundMetricCard
    label="세션"
    value={sessions.length}
    sub={`수집 중 ${sessions.filter((s) => !s.ended_at).length} · 완료 ${sessions.filter((s) => s.ended_at).length}`}
    tone="neutral"
  />
  <RoundMetricCard label="통과" value={summary.passed} sub="이번 라운드 확정" tone="success" />
  <RoundMetricCard label="미해결 오류" value={summary.unresolvedErrors} sub="처리 대기 중" tone="danger" />
  <RoundMetricCard label="다음 차수 이월" value={summary.carriedOver} sub="다음 라운드로 넘어감" tone="purple" />
</div>
```

`useRoundDispositionSummary`를 import 목록에 추가한다.

- [ ] **Step 3: 결과 패널 컴포넌트 작성**

```typescript
// src/components/app/qa-session-results-panel.tsx
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Panel } from "@/components/app/layout-parts";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import {
  useCarryOverItems,
  useQaChecklistItems,
  type QaSession,
} from "@/lib/qa-rounds-queries";
import { useTaxonomyCustomAttributes, useTaxonomyEvents } from "@/lib/queries";

function verdictBadge(finalStatus: "passed" | "failed" | "not_collected") {
  const map = {
    passed: { label: "통과", bg: "#f2faf5", fg: "#16a34a", border: "#cfe8d8" },
    failed: { label: "오류", bg: "#fdf5f5", fg: "#dc2626", border: "#f4d0d0" },
    not_collected: { label: "미발생", bg: "#fdf9f1", fg: "#b45309", border: "#f0dfc0" },
  } as const;
  const style = map[finalStatus];
  return (
    <span
      className="rounded-full border px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: style.bg, color: style.fg, borderColor: style.border }}
    >
      {style.label}
    </span>
  );
}

function dispositionBadge(disposition: string) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    unresolved: { label: "미처리", bg: "#f1f4f8", fg: "#64748b" },
    passed_override: { label: "통과 처리", bg: "#f2faf5", fg: "#16a34a" },
    carried_over: { label: "다음 차수 이월", bg: "#eef0fb", fg: "#5b5fc7" },
    discussing: { label: "논의 중", bg: "#fdf9f1", fg: "#b45309" },
  };
  const style = map[disposition] ?? map.unresolved;
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: style.bg, color: style.fg }}
    >
      {style.label}
    </span>
  );
}

export function QaSessionResultsPanel({
  projectId,
  environmentId,
  session,
}: {
  projectId: string;
  environmentId: string;
  session: QaSession;
}) {
  const { user } = useAuth();
  const { data: events = [] } = useTaxonomyEvents(projectId);
  const { data: customAttributes = [] } = useTaxonomyCustomAttributes(projectId);
  const { data: checklistItems = [] } = useQaChecklistItems(session.id);
  const carryOver = useCarryOverItems(environmentId);

  function itemLabel(targetType: "event" | "custom_attribute", targetId: string): string {
    const label =
      targetType === "event"
        ? events.find((e) => e.id === targetId)?.technical_name
        : customAttributes.find((a) => a.id === targetId)?.technical_name;
    return label ?? targetId;
  }

  const unresolvedFailures = checklistItems.filter((item) => {
    const finalStatus = item.qa_checklist_item_results[0]?.final_status ?? "not_collected";
    return item.disposition === "unresolved" && finalStatus !== "passed";
  });

  return (
    <Panel
      title="판정 결과"
      description="항목을 누르면 로그 페이지로 이동해 논의·처리할 수 있어요"
      actions={
        unresolvedFailures.length > 0 ? (
          <Button
            size="sm"
            variant="outline"
            disabled={!user || carryOver.isPending}
            onClick={() =>
              user &&
              carryOver.mutate(
                {
                  items: unresolvedFailures.map((i) => ({
                    id: i.id,
                    qa_session_id: i.qa_session_id,
                    target_type: i.target_type,
                    target_id: i.target_id,
                  })),
                  userId: user.id,
                  assigneeId: null,
                },
                { onSuccess: () => toast.success("다음 차수로 이월했어요") },
              )
            }
          >
            미해결 {unresolvedFailures.length}건 다음 차수로 이월
          </Button>
        ) : null
      }
    >
      {checklistItems.map((item) => {
        const result = item.qa_checklist_item_results[0];
        const finalStatus = result?.final_status ?? "not_collected";
        return (
          <Link
            key={item.id}
            from="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId"
            to="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/$itemId"
            params={(prev) => ({ ...prev, itemId: item.id })}
            className="grid grid-cols-[minmax(0,1fr)_150px_96px_120px_20px] items-center gap-3 border-b border-[#f1f4f8] px-[18px] py-3 hover:bg-[#f7f9fc]"
          >
            <span className="mono-token truncate text-[13px]">
              {itemLabel(item.target_type, item.target_id)}
            </span>
            <span className="truncate text-xs text-[#64748b]">{result?.ai_reasoning ?? "—"}</span>
            {verdictBadge(finalStatus)}
            {dispositionBadge(item.disposition)}
            <span className="text-[#c3ccd8]">›</span>
          </Link>
        );
      })}
    </Panel>
  );
}
```

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 수동 확인**

Run: 세션 뷰의 "결과" 스텝, 로그가 업로드된 세션에서 확인
Expected: 판정 배지(통과/오류/미발생)와 처리 배지(미처리 등)가 함께 뜨고, 오류/미처리 항목이 있으면 "미해결 N건 다음 차수로 이월" 버튼이 보인다. 눌러보면 라운드 뷰의 "다음 차수 이월" 카드 숫자가 올라간다.

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "Add session results panel with bulk carryover, restore round metric cards"
```

---

### Task 12: 항목 뷰 (라우트 + 컴포넌트)

**Files:**
- Create: `src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/$itemId.tsx`
- Create: `src/components/app/qa-item-view.tsx`

**Design Source:** README "3. 항목(로그) 뷰" 전체 — 헤더, 메타, 좌 컬럼(AI 판정 박스, 근거 로그 카드+하이라이트, 라운드 이력 카드), 우 컬럼(처리 패널, 논의 패널, 항목 이동), "반드시 wrap 되어야 함" 반응형 요구사항.

- [ ] **Step 1: 라운드 이력(carryover 체인) 조회 훅 추가**

`src/lib/qa-rounds-queries.ts`에 추가 — `carried_from_item_id`를 거슬러 올라가며 각 조상 항목의 라운드 번호 + 최종 판정을 모은다:

```typescript
export type RoundHistoryEntry = {
  roundNumber: number;
  reasoning: string | null;
  finalStatus: "passed" | "failed" | "not_collected";
};

export function useChecklistItemRoundHistory(itemId: string) {
  return useQuery({
    queryKey: ["qa-item-round-history", itemId],
    enabled: Boolean(itemId),
    queryFn: async () => {
      const history: RoundHistoryEntry[] = [];
      let currentId: string | null = itemId;
      while (currentId) {
        const { data: item, error } = await db
          .from("qa_round_checklist_items")
          .select(
            "carried_from_item_id, qa_sessions(qa_rounds(round_number)), qa_checklist_item_results(ai_reasoning, final_status)",
          )
          .eq("id", currentId)
          .maybeSingle();
        if (error) throw error;
        if (!item) break;
        const result = item.qa_checklist_item_results?.[0];
        history.push({
          roundNumber: item.qa_sessions?.qa_rounds?.round_number ?? 0,
          reasoning: result?.ai_reasoning ?? null,
          finalStatus: result?.final_status ?? "not_collected",
        });
        currentId = item.carried_from_item_id;
      }
      return history;
    },
  });
}
```

- [ ] **Step 2: 항목 뷰 컴포넌트 작성**

```typescript
// src/components/app/qa-item-view.tsx
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Panel } from "@/components/app/layout-parts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/domain";
import { buildMergedTimeline, nextChecklistItemId, previousChecklistItemId } from "@/lib/qa-workflow";
import {
  useAddDiscussionComment,
  useCarryOverItems,
  useChecklistItemRoundHistory,
  useQaAttributeSnapshots,
  useQaChecklistItems,
  useQaDiscussion,
  useQaRunEvents,
  useSetDisposition,
  type QaChecklistItemWithDisposition,
  type QaChecklistItemResult,
  type QaSession,
} from "@/lib/qa-rounds-queries";
import { useTaxonomyCustomAttributes, useTaxonomyEvents } from "@/lib/queries";

const VERDICT_STYLE = {
  passed: { border: "#cfe8d8", bg: "#f2faf5", fg: "#16a34a" },
  failed: { border: "#f4d0d0", bg: "#fdf5f5", fg: "#dc2626" },
  not_collected: { border: "#f0dfc0", bg: "#fdf9f1", fg: "#b45309" },
} as const;

export function QaItemView({
  projectId,
  environmentId,
  session,
  item,
  result,
}: {
  projectId: string;
  environmentId: string;
  session: QaSession;
  item: QaChecklistItemWithDisposition;
  result: QaChecklistItemResult | undefined;
}) {
  const { user } = useAuth();
  const { data: events = [] } = useTaxonomyEvents(projectId);
  const { data: customAttributes = [] } = useTaxonomyCustomAttributes(projectId);
  const { data: checklistItems = [] } = useQaChecklistItems(session.id);
  const { data: runEvents = [] } = useQaRunEvents(session.id);
  const { data: snapshots = [] } = useQaAttributeSnapshots(session.id);
  const { data: history = [] } = useChecklistItemRoundHistory(item.id);
  const { data: discussion } = useQaDiscussion(result?.id ?? "");
  const setDisposition = useSetDisposition(session.id);
  const carryOver = useCarryOverItems(environmentId);
  const addComment = useAddDiscussionComment(result?.id ?? "");
  const [commentBody, setCommentBody] = useState("");

  const label =
    item.target_type === "event"
      ? events.find((e) => e.id === item.target_id)?.technical_name
      : customAttributes.find((a) => a.id === item.target_id)?.technical_name;
  const finalStatus = result?.final_status ?? "not_collected";
  const verdictStyle = VERDICT_STYLE[finalStatus];

  const timeline = buildMergedTimeline(runEvents, snapshots);
  const relevantKeys = new Set(
    (Array.isArray(result?.ai_evidence) ? (result?.ai_evidence as Array<{ id?: string }>) : []).map(
      (e) => e.id,
    ),
  );
  const evidenceRows = timeline.filter((row) => relevantKeys.size === 0 || relevantKeys.has(row.key));

  const orderedIds = checklistItems.map((i) => i.id);

  function copyIssue() {
    const bundle = [
      `항목: ${label ?? item.target_id}`,
      `판정: ${finalStatus}`,
      result?.ai_reasoning ? `판단 이유: ${result.ai_reasoning}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    navigator.clipboard
      .writeText(bundle)
      .then(() => toast.success("이슈 설명을 클립보드에 복사했어요 — 이슈 트래커에 붙여넣으세요"))
      .catch(() => toast.error("복사에 실패했어요"));
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="mono-token text-xl font-bold">{label ?? item.target_id}</h2>
        <p className="mt-1 text-[12.5px] text-[#8b97a8]">
          {item.target_type === "event" ? "이벤트" : "attribute"} · 마지막 판정{" "}
          {result ? formatDateTime(result.updated_at) : "없음"}
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-[1_1_420px] space-y-4">
          <div
            className="rounded-[14px] border px-[18px] py-4"
            style={{ borderColor: verdictStyle.border, backgroundColor: verdictStyle.bg }}
          >
            <p className="text-xs font-bold" style={{ color: verdictStyle.fg }}>
              AI 판정
            </p>
            <p className="mt-1.5 text-[13.5px] leading-[1.7] text-[#3c4757]">
              {result?.ai_reasoning ?? "판단 이유가 없어요."}
            </p>
          </div>

          <Panel title="근거 로그" description="이 항목과 관련된 병합 타임라인 구간">
            <div className="grid grid-cols-[88px_76px_1fr_1fr] gap-3 bg-[#fbfcfd] px-4 py-2 text-xs font-medium text-[#64748b]">
              <span>시각</span>
              <span>출처</span>
              <span>이름</span>
              <span>값/변화</span>
            </div>
            {evidenceRows.map((row) => (
              <div
                key={row.key}
                className="grid grid-cols-[88px_76px_1fr_1fr] gap-3 border-b border-[#f1f4f8] px-4 py-2 text-xs"
              >
                <span className="tabular-nums text-[#8b97a8]">{formatDateTime(row.occurredAt)}</span>
                <span>{row.source === "snapshot" ? "스냅샷" : "이벤트"}</span>
                <span className="mono-token truncate">{row.name}</span>
                <span className="mono-token truncate">{row.change}</span>
              </div>
            ))}
          </Panel>

          <Panel title="라운드 이력">
            <ul className="px-4 py-2">
              {history.map((h, i) => (
                <li key={i} className="grid grid-cols-[56px_minmax(0,1fr)_auto] gap-3 py-2 text-[12.5px]">
                  <span className="text-[#8b97a8]">{h.roundNumber}차</span>
                  <span className="text-[#4a5666]">{h.reasoning ?? "—"}</span>
                  <span>{h.finalStatus === "passed" ? "통과" : h.finalStatus === "failed" ? "오류" : "미발생"}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="min-w-0 flex-[1_1_330px] max-w-[380px] space-y-4">
          <Panel title="이 항목 처리" description="여기서 정하면 세션 결과와 커버리지에 바로 반영돼요.">
            <div className="space-y-1.5 p-4">
              {(
                [
                  { value: "passed_override", label: "통과로 처리", desc: "판정을 뒤집고 커버리지에 통과로 반영", color: "#16a34a" },
                  { value: "carried_over", label: "다음 차수로 이월", desc: "다음 라운드 체크리스트에 자동으로 담김", color: "#5b5fc7" },
                  { value: "discussing", label: "논의 중으로 두기", desc: "원인 확인 전까지 미결로 유지", color: "#b45309" },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="w-full rounded-[11px] border p-[11px] text-left"
                  style={{
                    borderColor: item.disposition === option.value ? option.color : "#e3e8ef",
                    boxShadow: item.disposition === option.value ? `0 0 0 3px ${option.color}1a` : "none",
                  }}
                  onClick={() => {
                    if (!user) return;
                    if (option.value === "carried_over") {
                      carryOver.mutate(
                        {
                          items: [
                            {
                              id: item.id,
                              qa_session_id: item.qa_session_id,
                              target_type: item.target_type,
                              target_id: item.target_id,
                            },
                          ],
                          userId: user.id,
                          assigneeId: null,
                        },
                        { onSuccess: () => toast.success("다음 라운드로 이월했어요") },
                      );
                      return;
                    }
                    setDisposition.mutate(
                      { itemId: item.id, disposition: option.value, userId: user.id },
                      { onSuccess: () => toast.success("처리 상태를 반영했어요") },
                    );
                  }}
                >
                  <p className="text-[13px] font-semibold">{option.label}</p>
                  <p className="text-[11.5px] text-[#8b97a8]">{option.desc}</p>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title={`논의 ${discussion?.qa_discussion_comments.length ?? 0}`}>
            <div className="space-y-3 p-4">
              {(discussion?.qa_discussion_comments ?? []).map((c) => (
                <div key={c.id} className="grid grid-cols-[26px_minmax(0,1fr)] gap-2.5">
                  <span className="flex size-[26px] items-center justify-center rounded-full bg-[#eef1f5] text-[11px] font-bold text-[#64748b]">
                    {c.author_id.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <p className="text-[12.5px] font-semibold">
                      {formatDateTime(c.created_at)}
                    </p>
                    <p className="text-[12.5px] leading-[1.6] text-[#4a5666]">{c.body}</p>
                  </div>
                </div>
              ))}
              <Textarea
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="원인·재현 조건·담당자 멘션(@)을 남겨보세요"
                className="min-h-[62px]"
              />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={copyIssue}>
                  이슈로 내보내기
                </Button>
                <Button
                  className="flex-1 bg-[#1c2431] hover:bg-[#2c3648]"
                  disabled={!user || !commentBody.trim() || addComment.isPending}
                  onClick={() => {
                    if (!user || !commentBody.trim()) return;
                    addComment.mutate(
                      { userId: user.id, body: commentBody.trim(), discussionId: discussion?.id ?? null },
                      {
                        onSuccess: () => {
                          setCommentBody("");
                          if (item.disposition === "unresolved" && user) {
                            setDisposition.mutate({ itemId: item.id, disposition: "discussing", userId: user.id });
                          }
                        },
                      },
                    );
                  }}
                >
                  코멘트 남기기
                </Button>
              </div>
            </div>
          </Panel>

          <div className="flex gap-2">
            <Link
              from="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/$itemId"
              to="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/$itemId"
              params={(prev) => ({ ...prev, itemId: previousChecklistItemId(orderedIds, item.id) })}
              className="flex-1 rounded-md border px-3 py-2 text-center text-sm hover:border-[#2b6a9c]"
            >
              ← 이전 항목
            </Link>
            <Link
              from="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/$itemId"
              to="/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/$itemId"
              params={(prev) => ({ ...prev, itemId: nextChecklistItemId(orderedIds, item.id) })}
              className="flex-1 rounded-md border px-3 py-2 text-center text-sm hover:border-[#2b6a9c]"
            >
              다음 항목 →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
```

`qa_checklist_item_results.updated_at`을 `QaChecklistItemResult` 타입에 추가해야 한다 — `src/lib/qa-rounds-queries.ts`의 `QaChecklistItemResult` 타입에 `updated_at: string;` 필드를 추가한다(DB엔 이미 있는 컬럼, Task 3의 `select("*, ...")`가 이미 가져오고 있음, 타입만 누락).

- [ ] **Step 3: 항목 라우트 작성**

```typescript
// src/routes/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/$itemId.tsx
import { createFileRoute, useParams } from "@tanstack/react-router";
import { QaBreadcrumb } from "@/components/app/qa-breadcrumb";
import { QaItemView } from "@/components/app/qa-item-view";
import { useQaChecklistItems, useQaSessions } from "@/lib/qa-rounds-queries";
import { useEnvironments } from "@/lib/queries";

export const Route = createFileRoute(
  "/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/$itemId",
)({
  component: ItemPage,
});

function ItemPage() {
  const { wsId, projectId, stageSlug, roundId, sessionId, itemId } = useParams({
    from: "/_authenticated/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId/$itemId",
  });
  const { data: stages = [] } = useEnvironments(projectId);
  const stage = stages.find((s) => s.slug === stageSlug);
  const { data: sessions = [] } = useQaSessions(roundId);
  const session = sessions.find((s) => s.id === sessionId);
  const { data: checklistItems = [] } = useQaChecklistItems(sessionId);
  const item = checklistItems.find((i) => i.id === itemId);

  if (!stage || !session || !item) return null;

  return (
    <div className="space-y-3">
      <QaBreadcrumb
        items={[
          {
            label: "개발 QA",
            to: "/w/$wsId/p/$projectId/qa/$stageSlug",
            params: { wsId, projectId, stageSlug },
          },
          {
            label: "라운드",
            to: "/w/$wsId/p/$projectId/qa/$stageSlug/$roundId",
            params: { wsId, projectId, stageSlug, roundId },
          },
          {
            label: session.name,
            to: "/w/$wsId/p/$projectId/qa/$stageSlug/$roundId/$sessionId",
            params: { wsId, projectId, stageSlug, roundId, sessionId },
          },
          { label: itemId },
        ]}
      />
      <QaItemView
        projectId={projectId}
        environmentId={stage.id}
        session={session}
        item={item}
        result={item.qa_checklist_item_results[0]}
      />
    </div>
  );
}
```

- [ ] **Step 4: 세션 뷰와 라운드 뷰에도 브레드크럼 추가**

`qa-round-view.tsx`와 `qa-session-view.tsx` 최상단에 각각 `<QaBreadcrumb items={...} />`를 추가한다(라운드 뷰는 `개발 QA / N차 라운드`, 세션 뷰는 `개발 QA / N차 라운드 / 세션명`) — README "모든 뷰 상단에 브레드크럼이 공통으로 붙습니다" 요구사항.

`QaBreadcrumbItem.params`는 `item.params as never`로 캐스트돼서 타입체커가 잡아주지 못한다 — 각 항목의 `params`엔 그 `to` 라우트가 실제로 필요로 하는 **모든** path param(`wsId`, `projectId`, `stageSlug`뿐 아니라 그 아래 단계의 `roundId`/`sessionId`까지, 상위 라우트로 갈 때도 마찬가지)을 빠짐없이 채워 넣는다 — 일부만 채우면 컴파일은 되지만 실제 클릭 시 잘못된 URL로 이동한다. `qa-round-view.tsx`/`qa-session-view.tsx`의 컴포넌트 prop으로 이미 받고 있는 `projectId`/`environmentId`만으로는 `wsId`가 없으니, 이 두 컴포넌트를 호출하는 라우트 파일(`$roundId/index.tsx`, `$roundId/$sessionId/index.tsx`)에서 `useParams`로 `wsId`까지 함께 꺼내 prop으로 내려주거나, 컴포넌트 안에서 직접 `useParams({ from: ... })`로 가져온다.

- [ ] **Step 5: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 6: 수동 확인**

Run: 결과 패널에서 항목 클릭 → 항목 뷰로 이동
Expected: URL이 `/qa/dev/<roundId>/<sessionId>/<itemId>`로 바뀌고 새로고침해도 그대로 유지된다(공유 가능한 URL). AI 판정 박스 색이 판정에 따라 바뀌고, "논의 중으로 두기" 선택 시 처리 배지가 즉시 바뀐다. 브라우저 폭을 좁혀도 우 컬럼이 아래로 자연스럽게 쌓인다(가로 스크롤 없음).

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "Add item view route (AI verdict, evidence, round history, disposition, discussion)"
```

---

### Task 13: 레거시 컴포넌트 제거 + 전체 회귀 확인

**Files:**
- Delete: `src/components/app/qa-rounds-panel.tsx`
- Delete: `src/components/app/qa-result-panel.tsx`

**Why:** Task 5~12에서 이 두 파일의 모든 책임(라운드/세션/체크리스트/스냅샷/CSV업로드/분석/결과)이 새 컴포넌트로 옮겨졌다. 아무도 더 이상 이 파일들을 import하지 않는지 확인하고 지운다.

- [ ] **Step 1: 잔여 참조 확인**

Run: `grep -rn "qa-rounds-panel\|qa-result-panel" src/ --include="*.tsx" --include="*.ts"`
Expected: 두 파일 자기 자신 외에 아무 결과도 없음(즉 아무도 안 쓴다)

- [ ] **Step 2: 파일 삭제**

```bash
git rm src/components/app/qa-rounds-panel.tsx src/components/app/qa-result-panel.tsx
```

- [ ] **Step 3: 전체 타입체크 + 빌드**

Run: `npx tsc --noEmit`
Expected: 에러 없음

Run: `npm run build`
Expected: 빌드 성공

- [ ] **Step 4: 린트**

Run: `npx eslint src/components/app/qa-*.tsx src/routes/_authenticated/w/\$wsId/p/\$projectId/qa/ src/lib/qa-workflow.ts src/lib/qa-rounds-queries.ts`
Expected: 에러 없음 (경고는 허용, 기존 코드베이스 관례)

- [ ] **Step 5: 전체 단위 테스트**

Run: `npx vitest run`
Expected: 기존 18개 + 이번에 추가한 7개(Task 2) 전부 통과

- [ ] **Step 6: 수동 E2E — 새 워크플로우 전체 사이클**

로그인 정보는 사용자에게 직접 물어볼 것.

- [ ] 라운드 뷰: 새 라운드 시작 → 새 세션 시작
- [ ] 체크리스트 스텝: 이벤트 2~3개 검색해 추가
- [ ] 수집 스텝: 스냅샷 1개 찍기 → 형식에 맞는 CSV 업로드(`EVENT_ID,USER_ID,TIME,NAME,PROPERTIES` 헤더) → "세션 종료하고 분석으로" 클릭
- [ ] 분석 스텝: 병합 데이터셋 테이블에 스냅샷+이벤트 행이 시간순으로 보이는지 확인
- [ ] 결과 스텝: 판정 배지·처리 배지 확인, 항목 하나 클릭
- [ ] 항목 뷰: AI 판정 박스, 근거 로그, "논의 중으로 두기" 클릭 → 처리 배지 변경 확인, 코멘트 작성 → 목록에 즉시 반영, "이전/다음 항목" 이동, 브라우저 새로고침 후 같은 화면 유지 확인
- [ ] 결과 스텝으로 돌아가 "미해결 N건 다음 차수로 이월" 클릭 → 다음 라운드가 자동 생성되고 그 라운드의 "이월 항목" 세션에 항목이 이월 배지와 함께 담기는지 확인
- [ ] 개요 탭(다른 탭)의 전체 커버리지 숫자가 그대로인지 확인(고의로 멈춰있는 상태 — 회귀 아님)
- [ ] 운영 QA 탭도 같은 새 워크플로우로 정상 동작하는지 확인 (이 라우트는 dev/prod 공용)

- [ ] **Step 7: 발견된 버그 수정 (있었다면)**

```bash
git add -A
git commit -m "fix: address issues found during manual E2E verification"
```

- [ ] **Step 8: 최종 커밋**

```bash
git add -A
git commit -m "Remove legacy qa-rounds-panel/qa-result-panel components"
```

---

## Self-Review

**스펙 커버리지:**
- 브레드크럼(공통, 클릭 가능, 뷰 전환 시 스크롤 리셋) — Task 4, 6, 11 ✓
- 라운드 뷰(헤더/칩/지표 4장/세션 카드 그리드/빈 카드) — Task 6, 11 ✓
- 세션 뷰(헤더/메타/스텝퍼/게이트) — Task 7 ✓
- 체크리스트 패널(설명 강조, 툴바, 출처 배지, 이월 담기) — Task 8 ✓
- 수집 패널(타임라인, 점/태그 색, 종료 CTA) — Task 9 ✓
- 분석 패널(통계 4칸, 병합 테이블) — Task 10 ✓
- 결과 패널(요약 4장 중 판정 3종 + 처리 배지, 일괄 이월) — Task 11 ✓ (요약 카드 자체는 라운드 뷰에, 배지는 결과 패널 행에 표시 — README의 "요약 4장"은 라운드 지표 카드와 의미가 겹쳐 라운드 뷰 카드로 통합했다)
- 항목 뷰(AI 판정, 근거 로그+하이라이트, 라운드 이력, 처리 패널, 논의 패널, 이전/다음, flex-wrap 반응형) — Task 12 ✓
- 이월 확정 시 다음 라운드에 자동 편입(양방향 연결) — Task 3(`useCarryOverItems`), Task 8(`usePendingCarryOverItems`/`useAdoptCarryOverItems`) ✓
- 라우트 구조 + 공유 가능한 항목 URL — Task 5~12 ✓
- 반응형(`width: fit-content; min-width: 100%`, `auto-fit`/`auto-fill` 그리드) — Task 5(래퍼), 각 컴포넌트의 grid ✓
- 필요한 데이터/API — 전부 Task 1~3에서 커버. 논의는 이미 있던 스키마 재사용 ✓

**의도적으로 축소한 부분 (README 대비):**
- "기대 동작" 컬럼: 저장할 곳이 없어 `—`로 비움 (Task 8) — 실사용 중 필요해지면 후속 마이그레이션
- 이월 대상 라운드 셀렉트: 옵션이 하나뿐이라 "다음 라운드 자동 생성/재사용"으로 고정 동작화, 담당 지정 셀렉트는 이번 태스크 범위에서 제외(assigned_to 컬럼은 만들어뒀지만 UI 셀렉트는 없음 — 후속 작업)
- 이슈로 내보내기: 클립보드 복사로 대체, 외부 트래커 연동 없음
- 개요 탭 커버리지: 사용자 확인 하에 이번 작업 이후 정지 상태로 둠

**플레이스홀더 스캔:** Task 6 Step 1의 초안 코드(`QaNewSessionCard`, 하드코딩된 0)는 Step 3에서 명시적으로 정리된다 — 최종 상태로 남는 플레이스홀더 없음. 그 외 "나중에"/"적절히 처리" 문구 없음.

**타입 일관성:** `QaChecklistItemWithDisposition`(Task 3)이 Task 8, 11, 12에서 그대로 재사용됨. `deriveSessionStep`/`buildMergedTimeline`/`nextChecklistItemId`/`previousChecklistItemId`(Task 2) 시그니처가 Task 7, 9, 10, 12에서 동일하게 쓰임. `useCarryOverItems`(Task 3)가 Task 11(일괄), Task 12(개별) 양쪽에서 같은 시그니처로 호출됨.

---

## 실행 순서 요약

Task 1(마이그레이션) → Task 2(순수 로직) → Task 3(쿼리) → Task 4(브레드크럼) → Task 5(라우트 레이아웃, 레거시 제거) → Task 6(라운드 뷰) → Task 7(세션 셸) → Task 8(체크리스트) → Task 9(수집) → Task 10(분석) → Task 11(결과 + 라운드 지표 복원) → Task 12(항목 뷰) → Task 13(레거시 삭제 + 전체 검증).

Task 7은 Task 8~10이 끝나야 실제로 컴파일된다 — 순서대로 진행하면 문제없다.
