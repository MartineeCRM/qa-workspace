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
