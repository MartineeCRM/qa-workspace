# 검증결과(AI 판정) 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 세션의 체크리스트 항목마다 존재→구조→AI 의미 판정을 실행하고, "라운드" 탭의 체크리스트 바로 아래에 판정 결과(근거 로그·판단 이유·복사 버튼 포함)를 보여준다.

**Architecture:** CSV 로그를 `qa_run_events`로 파싱해 넣는 순수 파서, 결정론적 존재/구조 판정 순수 함수, 활성 규칙이 걸린 항목만 호출하는 TanStack Start 서버 함수(Claude API), 그 결과를 저장하는 React Query 뮤테이션, 그리고 `QaRoundsPanel`에 이어붙이는 새 UI 패널. 순수 로직(CSV 파싱, 판정 함수, 프롬프트 생성)은 vitest로 단위 테스트하고, Supabase/React에 의존하는 훅과 UI는 개발 서버에서 수동 검증한다 (이 프로젝트엔 기존에 자동화 테스트가 전혀 없어, 순수 로직에만 최소 범위로 도입하기로 결정함).

**Tech Stack:** TanStack Start (`createServerFn`), TanStack Query, Supabase, vitest(신규, 순수 로직 전용), Claude Messages API(fetch 직접 호출).

**참고 문서:**
- 설계: `docs/superpowers/specs/2026-08-01-qa-result-tab-design.md`
- 선행 설계: `docs/superpowers/specs/2026-07-30-taxonomy-qa-redesign-design.md`
- 승인된 구조 와이어프레임: https://claude.ai/code/artifact/463157ba-a0e1-4a55-96f9-f416731223d2

**배치 위치 (중요):** 새 UI는 새 탭을 만들지 않는다. `src/components/app/qa-rounds-panel.tsx`의 `QaRoundsPanel` 안, 기존 `ChecklistPanel` 바로 다음에 이어붙인다. 최상단 탭 구조(라운드/업로드·분석 기록/검증 결과)는 그대로 둔다 — 맨 마지막 "검증 결과" 탭은 이 작업과 무관한 기존 `qa_item_status` 기반 화면이다.

---

## 파일 구조

**신규:**
- `supabase/migrations/20260801020000_add_checklist_result_judged_by.sql` — `qa_checklist_item_results.judged_by` 컬럼 추가
- `src/lib/run-events-csv.ts` — CSV(NAME/TIME/USER_ID/PROPERTIES) → 파싱된 행 배열. 순수 함수.
- `src/lib/run-events-csv.test.ts`
- `src/lib/checklist-judge.ts` — 존재/구조 판정 + AI용 근거 수집. 순수 함수.
- `src/lib/checklist-judge.test.ts`
- `src/lib/ai-judge-prompt.ts` — Claude에 보낼 프롬프트 문자열 생성. 순수 함수.
- `src/lib/ai-judge-prompt.test.ts`
- `src/lib/ai-judge.functions.ts` — TanStack Start 서버 함수. `ai-judge-prompt.ts`를 써서 Claude Messages API 호출, 결과만 반환 (DB 안 씀).
- `src/lib/checklist-analysis.ts` — 위 셋을 엮어 체크리스트 항목 하나를 판정하는 오케스트레이터(비동기, AI 호출 포함이라 순수 아님 → 단위 테스트 대상 아님, 수동 검증).
- `src/components/app/qa-result-panel.tsx` — 로그 업로드 버튼 + 판정 결과 UI(불합격/통과 탭, 마스터-디테일, 근거 로그, 복사 버튼).
- `vitest.config.ts`

**수정:**
- `package.json` — `vitest` devDependency, `"test": "vitest run"` 스크립트
- `src/lib/qa-rounds-queries.ts` — 타입에 `judged_by` 추가, `QaRunEvent` 타입 + `useQaRunEvents`/`useUploadRunEventsLog`/`useAnalyzeChecklist` 훅 추가
- `src/components/app/qa-rounds-panel.tsx` — `QaRoundsPanel`에서 `ChecklistPanel` 다음에 `ResultPanel` 렌더
- `.env` (로컬, git 미추적) — `ANTHROPIC_API_KEY` 추가 안내만, 커밋 대상 아님

---

## Task 1: vitest 도입 (순수 로직 전용)

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: vitest 설치**

Run: `npm install -D vitest@^3.2.4`

- [ ] **Step 2: vitest 설정 작성**

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/lib/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: package.json에 test 스크립트 추가**

`package.json`의 `"scripts"` 블록에 추가:
```json
    "test": "vitest run",
```

- [ ] **Step 4: 빈 상태로 실행 확인**

Run: `npm run test`
Expected: `No test files found` (아직 테스트 파일이 없으므로 정상)

- [ ] **Step 5: 커밋**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest for pure-logic unit tests"
```

---

## Task 2: `qa_checklist_item_results.judged_by` 컬럼 추가

**Files:**
- Create: `supabase/migrations/20260801020000_add_checklist_result_judged_by.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
ALTER TABLE public.qa_checklist_item_results
  ADD COLUMN judged_by text CHECK (judged_by IN ('rule', 'ai'));
```

- [ ] **Step 2: 원격 프로젝트에 마이그레이션 적용**

Run: `supabase db push`
Expected: `20260801020000_add_checklist_result_judged_by.sql` 적용 완료 메시지, 에러 없음

- [ ] **Step 3: 적용 확인**

Run: `supabase migration list`
Expected: 출력 JSON의 `migrations` 배열 마지막 항목이 `{"local":"20260801020000","remote":"20260801020000",...}` (local과 remote 일치)

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/20260801020000_add_checklist_result_judged_by.sql
git commit -m "feat: add judged_by column to qa_checklist_item_results"
```

---

## Task 3: 로그 CSV 파서 (`run-events-csv.ts`)

**Files:**
- Create: `src/lib/run-events-csv.ts`
- Test: `src/lib/run-events-csv.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/run-events-csv.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parseRunEventsCsv } from "./run-events-csv";

describe("parseRunEventsCsv", () => {
  it("parses NAME/TIME/USER_ID/PROPERTIES rows", () => {
    const csv =
      "EVENT_ID,USER_ID,TIME,NAME,PROPERTIES\n" +
      'evt_1,u_100,2026-07-28T17:21:12Z,category_menu_click,"{""category_id"":""900034812""}"';
    const rows = parseRunEventsCsv(csv);
    expect(rows).toEqual([
      {
        raw_event_name: "category_menu_click",
        occurred_at: "2026-07-28T17:21:12Z",
        external_user_id: "u_100",
        raw_properties: { category_id: "900034812" },
      },
    ]);
  });

  it("defaults raw_properties to {} when PROPERTIES cell is missing or invalid JSON", () => {
    const csv =
      "USER_ID,TIME,NAME,PROPERTIES\n" +
      "u_100,2026-07-28T17:21:12Z,login,not-json\n" +
      "u_100,2026-07-28T17:22:00Z,logout,";
    const rows = parseRunEventsCsv(csv);
    expect(rows[0].raw_properties).toEqual({});
    expect(rows[1].raw_properties).toEqual({});
  });

  it("throws when required columns are missing", () => {
    const csv = "FOO,BAR\n1,2";
    expect(() => parseRunEventsCsv(csv)).toThrow("NAME, TIME, USER_ID");
  });

  it("returns an empty array for a header-only CSV", () => {
    const csv = "USER_ID,TIME,NAME,PROPERTIES";
    expect(parseRunEventsCsv(csv)).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test -- run-events-csv`
Expected: FAIL — `Cannot find module './run-events-csv'`

- [ ] **Step 3: 구현**

`src/lib/run-events-csv.ts`:
```ts
export type ParsedRunEventRow = {
  raw_event_name: string;
  occurred_at: string;
  external_user_id: string;
  raw_properties: Record<string, unknown>;
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

export function parseRunEventsCsv(text: string): ParsedRunEventRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.toUpperCase());
  const nameIdx = headers.indexOf("NAME");
  const timeIdx = headers.indexOf("TIME");
  const userIdIdx = headers.indexOf("USER_ID");
  const propsIdx = headers.indexOf("PROPERTIES");

  if (nameIdx === -1 || timeIdx === -1 || userIdIdx === -1) {
    throw new Error("CSV에 NAME, TIME, USER_ID 컬럼이 필요해요");
  }

  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    let raw_properties: Record<string, unknown> = {};
    const rawProps = propsIdx === -1 ? "" : (cells[propsIdx] ?? "");
    if (rawProps) {
      try {
        const parsed = JSON.parse(rawProps);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          raw_properties = parsed as Record<string, unknown>;
        }
      } catch {
        raw_properties = {};
      }
    }
    return {
      raw_event_name: cells[nameIdx] ?? "",
      occurred_at: cells[timeIdx] ?? "",
      external_user_id: cells[userIdIdx] ?? "",
      raw_properties,
    };
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- run-events-csv`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/run-events-csv.ts src/lib/run-events-csv.test.ts
git commit -m "feat: add CSV parser for qa_run_events log upload"
```

---

## Task 4: 존재/구조 판정 + AI 근거 수집 (`checklist-judge.ts`)

**Files:**
- Create: `src/lib/checklist-judge.ts`
- Test: `src/lib/checklist-judge.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/checklist-judge.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  collectRuleEvidence,
  judgeAttributeStructural,
  judgeEventStructural,
  matchEventLogs,
  matchLatestSnapshotValue,
  type AttributeSnapshot,
  type RunEvent,
} from "./checklist-judge";

const runEvents: RunEvent[] = [
  {
    event_id: "evt-1",
    raw_event_name: "purchase",
    occurred_at: "2026-07-28T17:39:22Z",
    external_user_id: "u_1",
    raw_properties: { payment_method: "credit_card", order_no: "20260728-8831" },
  },
];

const snapshots: AttributeSnapshot[] = [
  {
    external_user_id: "u_1",
    snapshot_name: "before",
    status: "captured",
    payload: { membership_grade: "GOLD" },
    captured_at: "2026-07-28T17:03:00Z",
  },
  {
    external_user_id: "u_1",
    snapshot_name: "after",
    status: "captured",
    payload: { membership_grade: "SILVER" },
    captured_at: "2026-07-28T17:04:02Z",
  },
];

describe("matchEventLogs", () => {
  it("returns run events matching the taxonomy event id", () => {
    expect(matchEventLogs("evt-1", runEvents)).toEqual(runEvents);
    expect(matchEventLogs("evt-missing", runEvents)).toEqual([]);
  });
});

describe("matchLatestSnapshotValue", () => {
  it("reads the value from the most recently captured snapshot", () => {
    expect(matchLatestSnapshotValue("membership_grade", snapshots)).toBe("SILVER");
  });

  it("returns undefined when no captured snapshot has the key", () => {
    expect(matchLatestSnapshotValue("push_opt_in", snapshots)).toBeUndefined();
  });
});

describe("judgeEventStructural", () => {
  it("flags a value outside allowed_values", () => {
    const violations = judgeEventStructural(runEvents, [
      {
        id: "p1",
        event_id: "evt-1",
        technical_name: "payment_method",
        data_type: "string",
        is_required: true,
        allowed_values: ["CARD", "BANK", "POINT"],
      },
    ]);
    expect(violations).toEqual([
      {
        property: "payment_method",
        reason: '허용된 값(CARD, BANK, POINT) 중이 아닙니다: "credit_card"',
      },
    ]);
  });

  it("flags a missing required property", () => {
    const violations = judgeEventStructural(runEvents, [
      {
        id: "p2",
        event_id: "evt-1",
        technical_name: "product_id",
        data_type: "string",
        is_required: true,
        allowed_values: null,
      },
    ]);
    expect(violations).toEqual([
      { property: "product_id", reason: "필수 프로퍼티가 로그에 없습니다" },
    ]);
  });

  it("returns no violations when everything matches", () => {
    const violations = judgeEventStructural(runEvents, [
      {
        id: "p3",
        event_id: "evt-1",
        technical_name: "order_no",
        data_type: "string",
        is_required: true,
        allowed_values: null,
      },
    ]);
    expect(violations).toEqual([]);
  });
});

describe("judgeAttributeStructural", () => {
  it("flags a type mismatch", () => {
    const violations = judgeAttributeStructural(123, {
      id: "a1",
      technical_name: "price_tier",
      data_type: "string",
      is_required: true,
      allowed_values: null,
    });
    expect(violations).toEqual([
      { property: "price_tier", reason: "타입이 string이어야 하는데 number입니다" },
    ]);
  });
});

describe("collectRuleEvidence", () => {
  it("gathers evidence for every target of a multi-target rule", () => {
    const bundle = collectRuleEvidence(
      {
        description: "profile_update 이후 membership_grade가 같은 값이어야 함",
        targets: [
          { kind: "event", id: "evt-1", technicalName: "purchase" },
          { kind: "custom_attribute", id: "attr-1", technicalName: "membership_grade" },
        ],
      },
      { runEvents, snapshots },
    );
    expect(bundle.ruleDescription).toContain("membership_grade");
    expect(bundle.targets).toEqual([
      { kind: "event", technicalName: "purchase", runEvents },
      { kind: "custom_attribute", technicalName: "membership_grade", snapshots },
    ]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test -- checklist-judge`
Expected: FAIL — `Cannot find module './checklist-judge'`

- [ ] **Step 3: 구현**

`src/lib/checklist-judge.ts`:
```ts
export type RunEvent = {
  event_id: string | null;
  raw_event_name: string;
  occurred_at: string;
  external_user_id: string;
  raw_properties: Record<string, unknown>;
};

export type AttributeSnapshot = {
  external_user_id: string;
  snapshot_name: string;
  status: string;
  payload: Record<string, unknown> | null;
  captured_at: string | null;
};

export type TaxonomyPropertyLite = {
  id: string;
  event_id: string;
  technical_name: string;
  data_type: string;
  is_required: boolean;
  allowed_values: string[] | null;
};

export type TaxonomyAttributeLite = {
  id: string;
  technical_name: string;
  data_type: string;
  is_required: boolean;
  allowed_values: string[] | null;
};

export type StructuralViolation = { property: string; reason: string };

export function matchEventLogs(eventId: string, runEvents: RunEvent[]): RunEvent[] {
  return runEvents.filter((r) => r.event_id === eventId);
}

export function matchLatestSnapshotValue(
  technicalName: string,
  snapshots: AttributeSnapshot[],
): unknown {
  const captured = snapshots
    .filter((s) => s.status === "captured" && s.payload && technicalName in s.payload)
    .sort((a, b) => (b.captured_at ?? "").localeCompare(a.captured_at ?? ""));
  return captured[0]?.payload?.[technicalName];
}

function matchesDataType(value: unknown, dataType: string): boolean {
  switch (dataType) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    default:
      return true;
  }
}

function checkValue(
  value: unknown,
  propertyName: string,
  dataType: string,
  allowedValues: string[] | null,
): StructuralViolation | null {
  if (!matchesDataType(value, dataType)) {
    return { property: propertyName, reason: `타입이 ${dataType}이어야 하는데 ${typeof value}입니다` };
  }
  if (allowedValues && !allowedValues.includes(String(value))) {
    return {
      property: propertyName,
      reason: `허용된 값(${allowedValues.join(", ")}) 중이 아닙니다: ${JSON.stringify(value)}`,
    };
  }
  return null;
}

export function judgeEventStructural(
  matchedEvents: RunEvent[],
  properties: TaxonomyPropertyLite[],
): StructuralViolation[] {
  const violations: StructuralViolation[] = [];
  for (const prop of properties) {
    const values = matchedEvents
      .map((e) => e.raw_properties[prop.technical_name])
      .filter((v) => v !== undefined && v !== null);
    if (prop.is_required && values.length === 0) {
      violations.push({ property: prop.technical_name, reason: "필수 프로퍼티가 로그에 없습니다" });
      continue;
    }
    for (const value of values) {
      const violation = checkValue(value, prop.technical_name, prop.data_type, prop.allowed_values);
      if (violation) violations.push(violation);
    }
  }
  return violations;
}

export function judgeAttributeStructural(
  value: unknown,
  attribute: TaxonomyAttributeLite,
): StructuralViolation[] {
  const violation = checkValue(
    value,
    attribute.technical_name,
    attribute.data_type,
    attribute.allowed_values,
  );
  return violation ? [violation] : [];
}

export type RuleTarget =
  | { kind: "event"; id: string; technicalName: string }
  | { kind: "custom_attribute"; id: string; technicalName: string };

export type RuleEvidenceBundle = {
  ruleDescription: string;
  targets: Array<
    | { kind: "event"; technicalName: string; runEvents: RunEvent[] }
    | { kind: "custom_attribute"; technicalName: string; snapshots: AttributeSnapshot[] }
  >;
};

export function collectRuleEvidence(
  rule: { description: string | null; targets: RuleTarget[] },
  data: { runEvents: RunEvent[]; snapshots: AttributeSnapshot[] },
): RuleEvidenceBundle {
  return {
    ruleDescription: rule.description ?? "",
    targets: rule.targets.map((t) =>
      t.kind === "event"
        ? {
            kind: "event" as const,
            technicalName: t.technicalName,
            runEvents: matchEventLogs(t.id, data.runEvents),
          }
        : {
            kind: "custom_attribute" as const,
            technicalName: t.technicalName,
            snapshots: data.snapshots.filter(
              (s) => s.status === "captured" && s.payload && t.technicalName in s.payload,
            ),
          },
    ),
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- checklist-judge`
Expected: PASS (8 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/checklist-judge.ts src/lib/checklist-judge.test.ts
git commit -m "feat: add existence/structural judge functions and rule evidence collector"
```

---

## Task 5: AI 프롬프트 생성 (`ai-judge-prompt.ts`)

**Files:**
- Create: `src/lib/ai-judge-prompt.ts`
- Test: `src/lib/ai-judge-prompt.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/ai-judge-prompt.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { buildJudgePrompt } from "./ai-judge-prompt";

describe("buildJudgePrompt", () => {
  it("includes the rule description and every target's evidence", () => {
    const prompt = buildJudgePrompt({
      ruleDescription: "profile_update 이후 membership_grade가 같은 값이어야 함",
      targets: [
        { kind: "event", technicalName: "profile_update", runEvents: [{ membership_grade: "GOLD" }] },
        {
          kind: "custom_attribute",
          technicalName: "membership_grade",
          snapshots: [{ membership_grade: "SILVER" }],
        },
      ],
    });
    expect(prompt).toContain("profile_update 이후 membership_grade가 같은 값이어야 함");
    expect(prompt).toContain('이벤트 "profile_update"');
    expect(prompt).toContain('어트리뷰트 "membership_grade"');
    expect(prompt).toContain("GOLD");
    expect(prompt).toContain("SILVER");
    expect(prompt).toContain('"verdict"');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm run test -- ai-judge-prompt`
Expected: FAIL — `Cannot find module './ai-judge-prompt'`

- [ ] **Step 3: 구현**

`src/lib/ai-judge-prompt.ts`:
```ts
export type JudgePromptTarget =
  | { kind: "event"; technicalName: string; runEvents: unknown[] }
  | { kind: "custom_attribute"; technicalName: string; snapshots: unknown[] };

export type JudgePromptInput = {
  ruleDescription: string;
  targets: JudgePromptTarget[];
};

export function buildJudgePrompt(input: JudgePromptInput): string {
  const evidenceLines = input.targets.map((t) =>
    t.kind === "event"
      ? `- 이벤트 "${t.technicalName}" 로그: ${JSON.stringify(t.runEvents)}`
      : `- 어트리뷰트 "${t.technicalName}" 스냅샷: ${JSON.stringify(t.snapshots)}`,
  );

  return [
    "당신은 이벤트 트래킹 QA 판정관입니다. 아래 검증 규칙과 근거 로그를 보고 통과 또는 실패를 판단하세요.",
    "",
    `규칙: ${input.ruleDescription}`,
    "",
    "근거:",
    ...evidenceLines,
    "",
    "다른 설명 없이 다음 JSON 형식으로만 응답하세요:",
    '{"verdict": "passed" | "failed", "reasoning": "판단 이유 (한국어, 1-2문장)", "evidence": <근거로 사용한 로그 중 핵심 부분>}',
  ].join("\n");
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm run test -- ai-judge-prompt`
Expected: PASS (1 test)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/ai-judge-prompt.ts src/lib/ai-judge-prompt.test.ts
git commit -m "feat: add AI judge prompt builder"
```

---

## Task 6: AI 서버 함수 (`ai-judge.functions.ts`)

**Files:**
- Create: `src/lib/ai-judge.functions.ts`
- Modify: `.env` (로컬 전용, git 미추적 — 커밋 안 함)

- [ ] **Step 1: 로컬 `.env`에 키 추가 (커밋 안 함)**

`.env`에 한 줄 추가 (`VITE_` 접두사 없음 — 서버에서만 읽고 클라이언트 번들에는 절대 포함되지 않음):
```
ANTHROPIC_API_KEY="여기에_실제_키_입력"
```

- [ ] **Step 2: 서버 함수 구현**

`src/lib/ai-judge.functions.ts`:
```ts
import { createServerFn } from "@tanstack/react-start";
import { buildJudgePrompt, type JudgePromptInput } from "@/lib/ai-judge-prompt";

export type JudgeAiResult =
  | { ok: true; verdict: "passed" | "failed"; reasoning: string; evidence: unknown }
  | { ok: false; error: string };

export const judgeChecklistItemWithAI = createServerFn({ method: "POST" })
  .validator((data: JudgePromptInput) => data)
  .handler(async ({ data }): Promise<JudgeAiResult> => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { ok: false, error: "ANTHROPIC_API_KEY가 서버에 설정되지 않았어요." };
    }

    let response: Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 512,
          messages: [{ role: "user", content: buildJudgePrompt(data) }],
        }),
      });
    } catch {
      return { ok: false, error: "Claude API 서버에 연결할 수 없어요." };
    }

    if (!response.ok) {
      return { ok: false, error: `Claude API 오류 (HTTP ${response.status})` };
    }

    const body = (await response.json()) as { content?: { type: string; text?: string }[] };
    const text = body.content?.find((c) => c.type === "text")?.text ?? "";

    try {
      const parsed = JSON.parse(text) as { verdict: string; reasoning: string; evidence: unknown };
      if (parsed.verdict !== "passed" && parsed.verdict !== "failed") {
        return { ok: false, error: `Claude 응답의 verdict 값이 올바르지 않아요: ${parsed.verdict}` };
      }
      return {
        ok: true,
        verdict: parsed.verdict,
        reasoning: parsed.reasoning,
        evidence: parsed.evidence,
      };
    } catch {
      return { ok: false, error: "Claude 응답을 JSON으로 해석하지 못했어요." };
    }
  });
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: `src/lib/ai-judge.functions.ts` 관련 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/lib/ai-judge.functions.ts
git commit -m "feat: add judgeChecklistItemWithAI server function calling Claude"
```

(`.env`는 `.gitignore` 대상이라 커밋되지 않음 — 확인: `git status`에 `.env`가 안 뜨는지 본다)

---

## Task 7: 체크리스트 항목 판정 오케스트레이터 + React Query 훅

**Files:**
- Create: `src/lib/checklist-analysis.ts`
- Modify: `src/lib/qa-rounds-queries.ts`

- [ ] **Step 1: 오케스트레이터 작성**

`src/lib/checklist-analysis.ts`:
```ts
import {
  collectRuleEvidence,
  judgeAttributeStructural,
  judgeEventStructural,
  matchEventLogs,
  matchLatestSnapshotValue,
  type AttributeSnapshot,
  type RunEvent,
  type TaxonomyAttributeLite,
  type TaxonomyPropertyLite,
} from "@/lib/checklist-judge";
import { judgeChecklistItemWithAI } from "@/lib/ai-judge.functions";
import type { QaChecklistItem } from "@/lib/qa-rounds-queries";
import type {
  TaxonomyCustomAttribute,
  TaxonomyEvent,
  TaxonomyEventProperty,
  ValidationRule,
} from "@/lib/queries";

export type ChecklistItemVerdict = {
  checklist_item_id: string;
  ai_verdict: "passed" | "failed" | "not_collected";
  ai_reasoning: string | null;
  ai_evidence: unknown;
  failed_layer: "structural" | "qualitative" | null;
  final_status: "passed" | "failed" | "not_collected";
  judged_by: "rule" | "ai";
};

export async function judgeChecklistItem(
  item: QaChecklistItem,
  ctx: {
    events: TaxonomyEvent[];
    eventProperties: TaxonomyEventProperty[];
    customAttributes: TaxonomyCustomAttribute[];
    rules: ValidationRule[];
    runEvents: RunEvent[];
    snapshots: AttributeSnapshot[];
  },
): Promise<ChecklistItemVerdict> {
  const base = { checklist_item_id: item.id };

  if (item.target_type === "event") {
    const event = ctx.events.find((e) => e.id === item.target_id);
    const matched = event ? matchEventLogs(event.id, ctx.runEvents) : [];
    if (!event || matched.length === 0) {
      return {
        ...base,
        ai_verdict: "not_collected",
        ai_reasoning: null,
        ai_evidence: null,
        failed_layer: null,
        final_status: "not_collected",
        judged_by: "rule",
      };
    }

    const properties: TaxonomyPropertyLite[] = ctx.eventProperties
      .filter((p) => p.event_id === event.id)
      .map((p) => ({
        id: p.id,
        event_id: p.event_id,
        technical_name: p.technical_name,
        data_type: p.data_type,
        is_required: p.is_required,
        allowed_values: Array.isArray(p.allowed_values) ? (p.allowed_values as string[]) : null,
      }));
    const violations = judgeEventStructural(matched, properties);
    if (violations.length > 0) {
      return {
        ...base,
        ai_verdict: "failed",
        ai_reasoning: violations.map((v) => `${v.property}: ${v.reason}`).join(" / "),
        ai_evidence: matched,
        failed_layer: "structural",
        final_status: "failed",
        judged_by: "rule",
      };
    }

    return judgeQualitative(base.checklist_item_id, event.id, "event", ctx);
  }

  const attribute = ctx.customAttributes.find((a) => a.id === item.target_id);
  const value = attribute ? matchLatestSnapshotValue(attribute.technical_name, ctx.snapshots) : undefined;
  if (!attribute || value === undefined) {
    return {
      ...base,
      ai_verdict: "not_collected",
      ai_reasoning: null,
      ai_evidence: null,
      failed_layer: null,
      final_status: "not_collected",
      judged_by: "rule",
    };
  }

  const attributeLite: TaxonomyAttributeLite = {
    id: attribute.id,
    technical_name: attribute.technical_name,
    data_type: attribute.data_type,
    is_required: attribute.is_required,
    allowed_values: Array.isArray(attribute.allowed_values)
      ? (attribute.allowed_values as string[])
      : null,
  };
  const violations = judgeAttributeStructural(value, attributeLite);
  if (violations.length > 0) {
    return {
      ...base,
      ai_verdict: "failed",
      ai_reasoning: violations.map((v) => v.reason).join(" / "),
      ai_evidence: { value },
      failed_layer: "structural",
      final_status: "failed",
      judged_by: "rule",
    };
  }

  return judgeQualitative(base.checklist_item_id, attribute.id, "custom_attribute", ctx);
}

async function judgeQualitative(
  checklistItemId: string,
  targetId: string,
  targetType: "event" | "custom_attribute",
  ctx: {
    events: TaxonomyEvent[];
    customAttributes: TaxonomyCustomAttribute[];
    rules: ValidationRule[];
    runEvents: RunEvent[];
    snapshots: AttributeSnapshot[];
  },
): Promise<ChecklistItemVerdict> {
  const rule = ctx.rules.find(
    (r) =>
      r.is_enabled &&
      r.validation_rule_targets.some((t) => t.target_type === targetType && t.target_id === targetId),
  );

  if (!rule) {
    return {
      checklist_item_id: checklistItemId,
      ai_verdict: "passed",
      ai_reasoning: null,
      ai_evidence: null,
      failed_layer: null,
      final_status: "passed",
      judged_by: "rule",
    };
  }

  const targets = rule.validation_rule_targets.map((t) => {
    const label =
      t.target_type === "event"
        ? (ctx.events.find((e) => e.id === t.target_id)?.technical_name ?? t.target_id)
        : (ctx.customAttributes.find((a) => a.id === t.target_id)?.technical_name ?? t.target_id);
    return {
      kind: t.target_type as "event" | "custom_attribute",
      id: t.target_id,
      technicalName: label,
    };
  });

  const bundle = collectRuleEvidence(
    { description: rule.description, targets },
    { runEvents: ctx.runEvents, snapshots: ctx.snapshots },
  );

  const result = await judgeChecklistItemWithAI({
    data: { ruleDescription: bundle.ruleDescription, targets: bundle.targets },
  });

  if (!result.ok) {
    return {
      checklist_item_id: checklistItemId,
      ai_verdict: "not_collected",
      ai_reasoning: result.error,
      ai_evidence: null,
      failed_layer: null,
      final_status: "not_collected",
      judged_by: "ai",
    };
  }

  return {
    checklist_item_id: checklistItemId,
    ai_verdict: result.verdict,
    ai_reasoning: result.reasoning,
    ai_evidence: result.evidence,
    failed_layer: result.verdict === "failed" ? "qualitative" : null,
    final_status: result.verdict,
    judged_by: "ai",
  };
}
```

- [ ] **Step 2: `qa-rounds-queries.ts`에 타입/훅 추가**

`src/lib/qa-rounds-queries.ts`의 `QaChecklistItemResult` 타입에 `judged_by` 추가 (Modify, 기존 타입 교체):
```ts
export type QaChecklistItemResult = {
  id: string;
  checklist_item_id: string;
  ai_verdict: "passed" | "failed" | "not_collected" | null;
  ai_reasoning: string | null;
  ai_evidence: unknown;
  failed_layer: "existence" | "structural" | "qualitative" | null;
  final_status: "passed" | "failed" | "not_collected";
  judged_by: "rule" | "ai" | null;
  overridden_by: string | null;
  overridden_at: string | null;
  override_reason: string | null;
};
```

파일 맨 위 import 블록에 추가:
```ts
import { judgeChecklistItem } from "@/lib/checklist-analysis";
import type { AttributeSnapshot, RunEvent } from "@/lib/checklist-judge";
import type {
  TaxonomyCustomAttribute,
  TaxonomyEvent,
  TaxonomyEventProperty,
  ValidationRule,
} from "@/lib/queries";
```

파일 끝에 추가 (`useOverrideChecklistResult` 함수 뒤):
```ts
export type QaRunEvent = {
  id: string;
  qa_session_id: string;
  event_id: string | null;
  raw_event_name: string;
  occurred_at: string;
  external_user_id: string;
  raw_properties: Record<string, unknown>;
};

export function useQaRunEvents(sessionId: string) {
  return useQuery({
    queryKey: ["qa-run-events", sessionId],
    enabled: Boolean(sessionId),
    queryFn: async () => {
      const { data, error } = await db
        .from("qa_run_events")
        .select("*")
        .eq("qa_session_id", sessionId)
        .order("occurred_at", { ascending: true });
      if (error) throw error;
      return data as QaRunEvent[];
    },
  });
}

export function useUploadRunEventsLog(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      rows: Array<{
        event_id: string | null;
        raw_event_name: string;
        occurred_at: string;
        external_user_id: string;
        raw_properties: Record<string, unknown>;
      }>,
    ) => {
      if (rows.length === 0) return;
      const { error } = await db
        .from("qa_run_events")
        .insert(rows.map((r) => ({ ...r, qa_session_id: sessionId })));
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-run-events", sessionId] });
    },
  });
}

export function useAnalyzeChecklist(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      checklistItems: QaChecklistItem[];
      events: TaxonomyEvent[];
      eventProperties: TaxonomyEventProperty[];
      customAttributes: TaxonomyCustomAttribute[];
      rules: ValidationRule[];
      runEvents: RunEvent[];
      snapshots: AttributeSnapshot[];
    }) => {
      if (input.checklistItems.length === 0) return;
      const results = await Promise.all(
        input.checklistItems.map((item) => judgeChecklistItem(item, input)),
      );
      const { error } = await db
        .from("qa_checklist_item_results")
        .upsert(results, { onConflict: "checklist_item_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qa-checklist-items", sessionId] });
    },
  });
}
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (특히 `checklist-analysis.ts`와 `qa-rounds-queries.ts` 관련)

- [ ] **Step 4: 커밋**

```bash
git add src/lib/checklist-analysis.ts src/lib/qa-rounds-queries.ts
git commit -m "feat: orchestrate 3-layer checklist judgement and wire up query hooks"
```

---

## Task 8: 검증결과 UI (`qa-result-panel.tsx`)

**Files:**
- Create: `src/components/app/qa-result-panel.tsx`
- Modify: `src/components/app/qa-rounds-panel.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`src/components/app/qa-result-panel.tsx`:
```tsx
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Clipboard, Upload } from "lucide-react";

import { EmptyState, Panel } from "@/components/app/layout-parts";
import { Pill } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/domain";
import { parseRunEventsCsv } from "@/lib/run-events-csv";
import {
  useAnalyzeChecklist,
  useQaAttributeSnapshots,
  useQaRunEvents,
  useUploadRunEventsLog,
  type QaChecklistItem,
  type QaChecklistItemResult,
} from "@/lib/qa-rounds-queries";
import {
  useRules,
  type TaxonomyCustomAttribute,
  type TaxonomyEvent,
  type TaxonomyEventProperty,
} from "@/lib/queries";

type ChecklistItemWithResult = QaChecklistItem & {
  qa_checklist_item_results: QaChecklistItemResult[];
};

const LAYER_RANK: Record<string, number> = { none: 0, structural: 1, qualitative: 2 };

function layerOf(result: QaChecklistItemResult | undefined): "none" | "structural" | "qualitative" {
  if (!result || result.final_status !== "failed" || !result.failed_layer) return "none";
  return result.failed_layer === "structural" ? "structural" : "qualitative";
}

function itemLabel(
  item: QaChecklistItem,
  events: TaxonomyEvent[],
  customAttributes: TaxonomyCustomAttribute[],
): string {
  const label =
    item.target_type === "event"
      ? events.find((e) => e.id === item.target_id)?.technical_name
      : customAttributes.find((a) => a.id === item.target_id)?.technical_name;
  return label ?? item.target_id;
}

export function ResultPanel({
  sessionId,
  projectId,
  events,
  eventProperties,
  customAttributes,
  checklistItems,
}: {
  sessionId: string;
  projectId: string;
  events: TaxonomyEvent[];
  eventProperties: TaxonomyEventProperty[];
  customAttributes: TaxonomyCustomAttribute[];
  checklistItems: ChecklistItemWithResult[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"failed" | "passed">("failed");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: runEvents = [] } = useQaRunEvents(sessionId);
  const { data: snapshots = [] } = useQaAttributeSnapshots(sessionId);
  const { data: rules = [] } = useRules(projectId);
  const uploadLog = useUploadRunEventsLog(sessionId);
  const analyze = useAnalyzeChecklist(sessionId);

  const eventByName = useMemo(() => new Map(events.map((e) => [e.technical_name, e])), [events]);

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
      await analyze.mutateAsync({
        checklistItems,
        events,
        eventProperties,
        customAttributes,
        rules,
        runEvents: [...runEvents, ...rows],
        snapshots,
      });
      toast.success("로그를 업로드하고 판정을 완료했어요");
    } catch (error) {
      toast.error(errorMessage(error, "로그 처리에 실패했어요"));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const failed = checklistItems.filter(
    (i) => (i.qa_checklist_item_results[0]?.final_status ?? "not_collected") !== "passed",
  );
  const passed = checklistItems.filter(
    (i) => i.qa_checklist_item_results[0]?.final_status === "passed",
  );
  const sortedFailed = [...failed].sort(
    (a, b) =>
      LAYER_RANK[layerOf(a.qa_checklist_item_results[0])] -
      LAYER_RANK[layerOf(b.qa_checklist_item_results[0])],
  );
  const visible = tab === "failed" ? sortedFailed : passed;
  const selected = visible.find((i) => i.id === selectedId) ?? visible[0];
  const selectedResult = selected?.qa_checklist_item_results[0];

  function copyBundle(item: ChecklistItemWithResult) {
    const result = item.qa_checklist_item_results[0];
    const label = itemLabel(item, events, customAttributes);
    const bundle = [
      `항목: ${label}`,
      `상태: ${result?.final_status === "passed" ? "통과" : result?.final_status === "failed" ? "불합격" : "미수집"}`,
      result?.ai_reasoning ? `판단 이유: ${result.ai_reasoning}` : null,
      result?.ai_evidence ? `근거 로그:\n${JSON.stringify(result.ai_evidence, null, 2)}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");
    navigator.clipboard.writeText(bundle);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 1400);
  }

  return (
    <Panel
      title="검증결과"
      description="로그를 올리면 존재·구조는 즉시, 규칙이 걸린 항목은 AI가 판정해요."
      actions={
        <>
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
          <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" /> {busy ? "처리 중…" : "로그 업로드"}
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <button
          type="button"
          onClick={() => setTab("failed")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            tab === "failed" ? "bg-destructive/10 text-destructive" : "text-muted-foreground"
          }`}
        >
          불합격 항목 <span className="ml-1 text-xs">{failed.length}</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("passed")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            tab === "passed" ? "bg-published/40 text-published-foreground" : "text-muted-foreground"
          }`}
        >
          통과한 항목 <span className="ml-1 text-xs">{passed.length}</span>
        </button>
      </div>

      {checklistItems.length === 0 ? (
        <EmptyState title="체크리스트가 비어 있어요" description="먼저 위 체크리스트에 항목을 담아주세요." />
      ) : visible.length === 0 ? (
        <EmptyState
          title={tab === "failed" ? "불합격 항목이 없어요" : "통과한 항목이 없어요"}
          description="로그를 업로드하면 여기 채워져요."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[380px_1fr]">
          <ul className="divide-y border-r">
            {visible.map((item) => {
              const result = item.qa_checklist_item_results[0];
              const layer = layerOf(result);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm ${
                      selected?.id === item.id ? "bg-surface-strong/60" : "hover:bg-surface"
                    }`}
                  >
                    {layer !== "none" ? (
                      <span className="mono-token text-[10px] font-bold uppercase text-destructive">
                        {layer === "structural" ? "구조" : "의미"}
                      </span>
                    ) : null}
                    <span className="mono-token min-w-0 flex-1 truncate">
                      {itemLabel(item, events, customAttributes)}
                    </span>
                    <Pill>{result?.judged_by === "ai" ? "AI" : "RULE"}</Pill>
                  </button>
                </li>
              );
            })}
          </ul>

          {selected ? (
            <div className="space-y-4 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="mono-token text-base font-semibold">
                  {itemLabel(selected, events, customAttributes)}
                </span>
                <Pill>{selectedResult?.final_status ?? "not_collected"}</Pill>
                <Pill>{selectedResult?.judged_by === "ai" ? "AI" : "RULE"}</Pill>
              </div>
              <p className="text-sm">{selectedResult?.ai_reasoning ?? "판단 이유가 없어요."}</p>
              <div className="relative overflow-hidden rounded-md bg-[#111113]">
                <button
                  type="button"
                  onClick={() => copyBundle(selected)}
                  className="absolute right-2 top-2 flex items-center gap-1.5 rounded-md border border-white/15 bg-white/10 px-2 py-1 text-xs text-white/90 hover:bg-white/20"
                >
                  {copiedId === selected.id ? (
                    <>
                      <Check className="size-3.5" /> 복사됨
                    </>
                  ) : (
                    <>
                      <Clipboard className="size-3.5" /> 전체 복사
                    </>
                  )}
                </button>
                <pre className="mono-token overflow-x-auto p-4 text-xs text-white">
                  {JSON.stringify(selectedResult?.ai_evidence ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
```

- [ ] **Step 2: `QaRoundsPanel`에 이어붙이기**

`src/components/app/qa-rounds-panel.tsx`의 import 블록에 추가:
```ts
import { ResultPanel } from "@/components/app/qa-result-panel";
import { useTaxonomyEventProperties } from "@/lib/queries";
```

`QaRoundsPanel` 함수 안, `const { data: customAttributes = [] } = useTaxonomyCustomAttributes(projectId);` 바로 다음 줄에 추가:
```ts
  const { data: eventProperties = [] } = useTaxonomyEventProperties(projectId);
```

`ChecklistPanel` 렌더 블록(`{activeSessionId ? ( <ChecklistPanel ... /> ) : ( ... )}`) 안, `<ChecklistPanel ... />` 닫는 태그 바로 다음에 추가 (같은 `activeSessionId ? (` 분기 안):
```tsx
              <ResultPanel
                sessionId={activeSessionId}
                projectId={projectId}
                events={events}
                eventProperties={eventProperties}
                customAttributes={customAttributes}
                checklistItems={checklistItems}
              />
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/components/app/qa-result-panel.tsx src/components/app/qa-rounds-panel.tsx
git commit -m "feat: add ResultPanel UI below the checklist in the round tab"
```

---

## Task 9: 수동 엔드투엔드 검증

이 프로젝트엔 UI/통합 자동 테스트가 없으므로, 개발 서버에서 직접 확인한다.

**Files:** 없음 (검증만)

- [ ] **Step 1: 개발 서버 기동**

Run: `npm run dev`

- [ ] **Step 2: 규칙 없는 이벤트 — 존재 실패 확인**

체크리스트에 로그에 없는 이벤트 하나를 추가 → NAME에 그 이벤트가 없는 CSV 업로드 → 검증결과 탭에서 "불합격 항목"에 뜨는지, 클릭 시 "판단 이유"가 비어 있고(`ai_reasoning: null`) `RULE` 뱃지인지 확인

- [ ] **Step 3: 규칙 없는 이벤트 — 구조 실패 확인**

`allowed_values`가 있는 프로퍼티에 그 값과 다른 값을 담은 CSV 업로드 → 해당 이벤트가 "구조" 태그와 함께 불합격 목록에 뜨는지, 상세 패널의 판단 이유에 위반 프로퍼티명이 나오는지 확인

- [ ] **Step 4: 규칙 없는 항목 — AI 호출 없이 통과 확인**

브라우저 개발자 도구 네트워크 탭을 열어두고, 규칙이 안 걸린 정상 이벤트가 포함된 CSV를 업로드 → `judgeChecklistItemWithAI` 서버 함수 호출이 이 항목에 대해 발생하지 않는지 확인 (네트워크 요청 수 = 규칙이 걸린 항목 수와 일치하는지)

- [ ] **Step 5: 다중 타겟 규칙 — AI 판정 확인**

이벤트+어트리뷰트를 동시에 타겟으로 하는 규칙을 하나 만들고(Rules 탭), 두 타겟 다 체크리스트에 담은 뒤, 값이 어긋나는 로그+스냅샷을 준비해서 업로드 → 어트리뷰트 항목의 상세 패널에 이벤트 쪽 근거도 함께 표시되는지, `AI` 뱃지가 붙는지 확인

- [ ] **Step 6: 복사 버튼 확인**

아무 불합격 항목이나 선택 → "전체 복사" 클릭 → 클립보드 내용을 텍스트 편집기에 붙여넣어 항목명·상태·판단 이유·근거 로그가 다 포함돼 있는지 확인, 버튼이 잠깐 "복사됨"으로 바뀌는지 확인

- [ ] **Step 7: 커밋 (수정사항이 있었다면)**

수동 검증 중 발견한 버그를 고쳤다면:
```bash
git add -A
git commit -m "fix: address issues found during manual verification"
```

---

## 자체 점검

**스펙 커버리지:**
- 로그 업로드 → `qa_run_events` — Task 3, 6(일부), 7, 8 ✓
- 3단계 판정(존재/구조/AI) — Task 4, 6, 7 ✓
- `judged_by` 컬럼 — Task 2, 7 ✓
- 근거 = 세션 스코프, 규칙의 전체 타겟 — Task 4(`collectRuleEvidence`), 7(`judgeQualitative`) ✓
- AI 호출 = TanStack Start 서버 함수, DB 직접 안 씀 — Task 6 ✓
- 불합격 기본 탭, 심각도 정렬, 마스터-디테일, 복사 버튼(전체 번들), RULE/AI 뱃지 — Task 8 ✓
- 새 탭 안 만들고 라운드 탭에 이어붙임 — Task 8 Step 2 ✓
- 오버라이드 UI 재구현 안 함(기존 버튼 재사용) — Task 8에서 신규 구현 없음, 기존 `ChecklistPanel`의 "오류로 수정" 유지 ✓

**커버 안 되는 항목 (설계 문서의 비범위와 일치, 의도적):** 논의 스레드 UI, 차수 승계, 프로젝트 전체 롤업, 스냅샷 타이밍 가이드.

**타입 일관성:** `QaChecklistItemResult.judged_by`, `ChecklistItemVerdict.judged_by`, DB 컬럼 `judged_by` 모두 `"rule" | "ai"`(DB는 `| null` 허용)로 통일. `RunEvent`/`AttributeSnapshot` 타입은 `checklist-judge.ts`에서 정의해 `checklist-analysis.ts`와 `qa-result-panel.tsx`가 그대로 import.
