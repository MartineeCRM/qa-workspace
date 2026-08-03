import type {
  ChecklistDisposition,
  QaAttributeSnapshot,
  QaRunEvent,
} from "@/lib/qa-rounds-queries";
import type { CoverageItem, EnvironmentCoverage } from "@/lib/queries";

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
  // Raw JSON properties for event rows only — lets consumers that need to show
  // the original quoting/typing (e.g. a QA evidence log) render it verbatim
  // instead of the flattened `key=value` summary in `change`.
  raw?: Record<string, unknown>;
};

function formatValue(value: unknown): string {
  if (value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// Snapshot payload values are JSON-safe Braze attribute values, so JSON.stringify
// is sufficient for deep equality here — no need for a deep-equal library.
// Object/array-valued attributes always come from separately-fetched/parsed
// rows, so `===` would never match even when the content is identical.
function isSameValue(before: unknown, after: unknown): boolean {
  if (before === after) return true;
  if (typeof before !== "object" || typeof after !== "object") return false;
  if (before === null || after === null) return false;
  return JSON.stringify(before) === JSON.stringify(after);
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
    raw: e.raw_properties,
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
      if (isSameValue(before, after)) continue;
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

type RawChecklistItemResult = {
  final_status: "passed" | "failed" | "not_collected";
  updated_at: string;
};
type RawChecklistItem = {
  id: string;
  target_type: "event" | "custom_attribute";
  target_id: string;
  disposition: ChecklistDisposition;
  qa_checklist_item_results: RawChecklistItemResult[] | null;
};
type RawSession = { id: string; qa_round_checklist_items: RawChecklistItem[] | null };
type RawRound = {
  id: string;
  qa_environment_id: string;
  round_number: number;
  qa_sessions: RawSession[] | null;
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
export function checklistTargetKey(row: {
  target_type: "event" | "custom_attribute";
  target_id: string;
}): string {
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

// The new round/session workflow only judges events and custom attributes — a
// property's pass/fail is folded into its parent event's structural check,
// there's no per-property result row. This narrows a taxonomy-derived
// CoverageItem list down to the subset the checklist schema can actually track.
export function checklistCoverageItems(items: CoverageItem[]): CoverageItem[] {
  return items.filter((item) => item.kind !== "property");
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
    if (current.disposition === "passed_override" || current.final_status === "passed")
      verified += 1;
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
      else if (current.disposition === "unresolved" && current.final_status === "failed")
        status = "failed";
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
