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
    expect(rows.map((r) => r.name)).toEqual(["cart_item_added", "cart_item_count"]);
    expect(rows[0]).toMatchObject({
      source: "event",
      name: "cart_item_added",
    });
    expect(rows[1]).toMatchObject({
      source: "snapshot",
      name: "cart_item_count",
      change: "0 → 1",
    });
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
