import { matchesDataType } from "@/lib/checklist-judge";
import type {
  ChecklistDisposition,
  QaAttributeSnapshot,
  QaRunEvent,
  RoundHistoryEntry,
} from "@/lib/qa-rounds-queries";
import type { CoverageItem, EnvironmentCoverage } from "@/lib/queries";

export function deriveSessionStep(input: {
  checklistItemCount: number;
  hasRunEvents: boolean;
  hasResults: boolean;
}): 1 | 2 | 3 | 4 {
  if (input.checklistItemCount === 0) return 1;
  if (input.hasResults) return 4;
  if (input.hasRunEvents) return 3;
  return 2;
}

// Same derivation as deriveSessionStep, but sourced straight from the nested
// qa_sessions select the round view uses to summarize every session at once
// (a per-session useQaChecklistItems/useQaRunEvents pair per card would be a
// query per card instead of one query for the whole round).
export type RawSessionForStep = {
  id: string;
  qa_round_checklist_items: Array<{ qa_checklist_item_results: unknown[] | null }> | null;
  qa_run_events: unknown[] | null;
};

export function deriveSessionStepFromRow(row: RawSessionForStep): 1 | 2 | 3 | 4 {
  const items = row.qa_round_checklist_items ?? [];
  return deriveSessionStep({
    checklistItemCount: items.length,
    hasRunEvents: (row.qa_run_events ?? []).length > 0,
    hasResults: items.some((i) => (i.qa_checklist_item_results ?? []).length > 0),
  });
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
  qa_channel_id?: string | null;
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
type RawSession = {
  id: string;
  qa_channel_id?: string | null;
  qa_round_checklist_items: RawChecklistItem[] | null;
};
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
          qa_channel_id: session.qa_channel_id ?? null,
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
    const key = `${checklistTargetKey(current)}:${current.qa_channel_id ?? "unassigned"}`;
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
  requiredChannelIds: string[] = [],
  excludedEventChannelKeys: Set<string> = new Set(),
): EnvironmentCoverage {
  const latestRows = latestRoundChecklistRows(rows, environmentId);
  const channels = requiredChannelIds.length > 0 ? requiredChannelIds : ["legacy"];
  const byKey = new Map(
    latestRows.map((r) => [
      `${checklistTargetKey(r)}:${requiredChannelIds.length > 0 ? (r.qa_channel_id ?? "unassigned") : "legacy"}`,
      r,
    ]),
  );
  let verified = 0;
  let failed = 0;
  let total = 0;
  for (const item of items) {
    for (const channelId of channels) {
      if (item.kind === "event" && excludedEventChannelKeys.has(`${item.id}:${channelId}`))
        continue;
      total += 1;
      const current = byKey.get(`${item.key}:${channelId}`);
      if (!current) continue;
      if (current.disposition === "passed_override" || current.final_status === "passed")
        verified += 1;
      else if (current.disposition === "unresolved" && current.final_status === "failed")
        failed += 1;
    }
  }
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

export type RoundValidationSummary = {
  executed: number;
  passed: number;
  unconfirmedIssues: number;
  confirmedIssues: number;
};

export function summarizeRoundValidationItems(
  items: Array<{
    target_type: "event" | "custom_attribute";
    target_id: string;
    disposition: ChecklistDisposition;
    qa_checklist_item_results: Array<{
      final_status: "passed" | "failed" | "not_collected";
      qa_discussions: Array<{ id: string }> | null;
    }> | null;
  }>,
): RoundValidationSummary {
  const rankByTarget = new Map<string, 1 | 2 | 3>();
  for (const item of items) {
    const result = item.qa_checklist_item_results?.[0];
    if (!result) continue;
    const key = `${item.target_type}:${item.target_id}`;
    const rank =
      item.disposition === "passed_override" || result.final_status === "passed"
        ? 1
        : (result.qa_discussions?.length ?? 0) > 0
          ? 3
          : 2;
    rankByTarget.set(key, Math.max(rankByTarget.get(key) ?? 0, rank) as 1 | 2 | 3);
  }
  const ranks = [...rankByTarget.values()];
  return {
    executed: ranks.length,
    passed: ranks.filter((rank) => rank === 1).length,
    unconfirmedIssues: ranks.filter((rank) => rank === 2).length,
    confirmedIssues: ranks.filter((rank) => rank === 3).length,
  };
}

// ---------------- Item detail: spec diff & round history compression ----------------
// Backs the item view's "스펙 대조" table (v4 design handoff): AS-IS is the value that
// actually arrived in the log, TO-BE is what the taxonomy expects it to be.

function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[rows - 1][cols - 1];
}

export type TypoCandidate = { id: string; name: string; distance: number };

// Edit distance <=2 and length difference <=2 → candidate. Distance 1 reads as a
// near-certain typo; distance 2 as "similar but might genuinely be a different
// property" — callers should tone the copy down accordingly. Carries the
// candidate's id (not just its name) since a chosen "rename" resolution needs a
// concrete taxonomy row to update.
export function findTypoCandidate(
  unknownName: string,
  knownProps: Array<{ id: string; technical_name: string }>,
): TypoCandidate | null {
  let best: TypoCandidate | null = null;
  for (const known of knownProps) {
    if (known.technical_name === unknownName) continue;
    if (Math.abs(known.technical_name.length - unknownName.length) > 2) continue;
    const distance = levenshteinDistance(unknownName, known.technical_name);
    if (distance > 2) continue;
    if (!best || distance < best.distance)
      best = { id: known.id, name: known.technical_name, distance };
  }
  return best;
}

export type ParsedReasonLine = {
  property: string;
  kind: "missing_required" | "type_mismatch" | "value_mismatch" | "undefined_property" | "other";
  reason: string;
};

// ai_reasoning for rule-judged structural violations is a "property: reason" line
// per violation (see checklist-analysis.ts). Parse it back apart so the round
// history can group by kind instead of repeating the full sentence every round.
export function parseReasonLines(reasoning: string | null): ParsedReasonLine[] {
  if (!reasoning) return [];
  return reasoning
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf(":");
      const property = idx === -1 ? line.trim() : line.slice(0, idx).trim();
      const reason = idx === -1 ? "" : line.slice(idx + 1).trim();
      const kind: ParsedReasonLine["kind"] = reason.includes(
        "택소노미에 정의되지 않은 프로퍼티입니다",
      )
        ? "undefined_property"
        : reason.includes("필수 프로퍼티")
          ? "missing_required"
          : reason.startsWith("타입이")
            ? "type_mismatch"
            : reason.startsWith("허용된 값")
              ? "value_mismatch"
              : "other";
      return { property, kind, reason };
    });
}

export type CompressedRoundHistoryEntry = {
  roundNumber: number;
  finalStatus: "passed" | "failed" | "not_collected";
  missingProperties: string[];
  typeMismatchProperties: string[];
  undefinedProperties: string[];
  valueFormatProperties: string[];
  otherReason: string | null;
  delta: number | null;
};

// history[0] is the most recent round (useChecklistItemRoundHistory walks
// carried_from_item_id backward), so each entry's delta compares against the
// NEXT entry in the array — the round that came chronologically before it.
export function compressRoundHistory(
  history: RoundHistoryEntry[],
  propertyNameById = new Map<string, string>(),
): CompressedRoundHistoryEntry[] {
  const counts = history.map((h) => {
    const lines = parseReasonLines(h.reasoning);
    const semanticProperties = [...aiFailedTaxonomyPropertyIds(h.evidence)].map(
      (id) => propertyNameById.get(id) ?? id,
    );
    return {
      missingProperties: lines.filter((l) => l.kind === "missing_required").map((l) => l.property),
      typeMismatchProperties: lines
        .filter((l) => l.kind === "type_mismatch")
        .map((l) => l.property),
      undefinedProperties: lines
        .filter((l) => l.kind === "undefined_property")
        .map((l) => l.property),
      valueFormatProperties: [
        ...lines.filter((l) => l.kind === "value_mismatch").map((l) => l.property),
        ...semanticProperties,
      ].filter((property, index, all) => all.indexOf(property) === index),
      lines,
    };
  });
  return history.map((h, i) => {
    const current = counts[i];
    const structuredCount =
      current.missingProperties.length +
      current.typeMismatchProperties.length +
      current.undefinedProperties.length +
      current.valueFormatProperties.length;
    const otherReason = structuredCount === 0 ? h.reasoning : null;
    const prev = counts[i + 1];
    const delta =
      prev === undefined
        ? null
        : structuredCount -
          (prev.missingProperties.length +
            prev.typeMismatchProperties.length +
            prev.undefinedProperties.length +
            prev.valueFormatProperties.length);
    return {
      roundNumber: h.roundNumber,
      finalStatus: h.finalStatus,
      missingProperties: current.missingProperties,
      typeMismatchProperties: current.typeMismatchProperties,
      undefinedProperties: current.undefinedProperties,
      valueFormatProperties: current.valueFormatProperties,
      otherReason,
      delta,
    };
  });
}

// ---------------- Item detail: 스펙 대조 (spec diff) table rows ----------------
// AS-IS = what actually arrived in the log. TO-BE = what the taxonomy expects.

export type SpecDiffVerdict =
  | "pass"
  | "missing_required"
  | "type_mismatch"
  | "value_mismatch"
  | "semantic_mismatch"
  | "undefined_property";

export type SpecDiffRow = {
  // null for a property that isn't in the taxonomy yet (undefined_property row) —
  // there's nothing to type-fix or rename, only "add as new" applies.
  propertyId: string | null;
  name: string;
  observedType: string;
  observedSample: unknown;
  expectedType: string | null;
  expectedExample: unknown;
  allowedValues: string[] | null;
  verdict: SpecDiffVerdict;
  typoCandidate: TypoCandidate | null;
};

function inferObservedType(value: unknown): string {
  if (value === undefined) return "없음";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

export function buildEventSpecDiffRows(input: {
  properties: Array<{
    id: string;
    technical_name: string;
    data_type: string;
    is_required: boolean;
    allowed_values: string[] | null;
    example_value: unknown;
  }>;
  // raw_properties from every matched run event in the session, newest first —
  // a property only counts as "observed" once some occurrence actually carried it.
  rawPropertiesList: Array<Record<string, unknown>>;
  aiFailedPropertyIds?: Set<string>;
}): SpecDiffRow[] {
  const knownNames = input.properties.map((p) => p.technical_name);
  const rows: SpecDiffRow[] = [];

  for (const prop of input.properties) {
    // Check every matched occurrence, not just the first — the same property can
    // be valid in one log line and wrong in another, and judgeEventStructural
    // (the actual judging engine) flags a violation if ANY occurrence mismatches.
    const values = input.rawPropertiesList
      .map((raw) => raw[prop.technical_name])
      .filter((v) => v !== undefined && v !== null);
    const mismatchingValue = values.find((v) => !matchesDataType(v, prop.data_type));
    const invalidAllowedValue = values.find(
      (v) =>
        matchesDataType(v, prop.data_type) &&
        prop.allowed_values !== null &&
        !prop.allowed_values.includes(String(v)),
    );
    const observedValue = mismatchingValue ?? invalidAllowedValue ?? values[0];
    const structuralVerdict: SpecDiffVerdict =
      values.length === 0
        ? prop.is_required
          ? "missing_required"
          : "pass"
        : mismatchingValue !== undefined
          ? "type_mismatch"
          : invalidAllowedValue !== undefined
            ? "value_mismatch"
            : "pass";
    const verdict: SpecDiffVerdict =
      structuralVerdict === "pass" && input.aiFailedPropertyIds?.has(prop.id)
        ? "semantic_mismatch"
        : structuralVerdict;
    rows.push({
      propertyId: prop.id,
      name: prop.technical_name,
      observedType: inferObservedType(observedValue),
      observedSample: observedValue,
      expectedType: prop.data_type,
      expectedExample: prop.example_value,
      allowedValues: prop.allowed_values,
      verdict,
      typoCandidate: null,
    });
  }

  const seen = new Set<string>();
  for (const raw of input.rawPropertiesList) {
    for (const key of Object.keys(raw)) {
      if (knownNames.includes(key) || seen.has(key)) continue;
      seen.add(key);
      rows.push({
        propertyId: null,
        name: key,
        observedType: inferObservedType(raw[key]),
        observedSample: raw[key],
        expectedType: null,
        expectedExample: undefined,
        allowedValues: null,
        verdict: "undefined_property",
        typoCandidate: findTypoCandidate(key, input.properties),
      });
    }
  }

  return rows;
}

export function aiFailedTaxonomyPropertyIds(evidence: unknown): Set<string> {
  const nested =
    evidence && typeof evidence === "object" && !Array.isArray(evidence)
      ? (evidence as { qualitative?: unknown }).qualitative
      : evidence;
  if (!Array.isArray(nested)) return new Set();
  return new Set(
    nested
      .filter(
        (result): result is { rule_id: string; verdict: string } =>
          Boolean(result) &&
          typeof result === "object" &&
          typeof result.rule_id === "string" &&
          result.verdict === "failed" &&
          result.rule_id.startsWith("taxonomy-property:"),
      )
      .map((result) => result.rule_id.slice("taxonomy-property:".length)),
  );
}
