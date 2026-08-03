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
    expect(
      deriveSessionStep({ checklistItemCount: 0, hasRunEvents: false, hasResults: false }),
    ).toBe(1);
  });

  it("returns 2 when items exist but nothing has been collected yet", () => {
    expect(
      deriveSessionStep({ checklistItemCount: 3, hasRunEvents: false, hasResults: false }),
    ).toBe(2);
  });

  it("returns 3 once run events are collected but analysis hasn't produced results yet", () => {
    expect(
      deriveSessionStep({ checklistItemCount: 3, hasRunEvents: true, hasResults: false }),
    ).toBe(3);
  });

  it("returns 4 once results exist, regardless of whether more run events keep arriving", () => {
    expect(
      deriveSessionStep({ checklistItemCount: 3, hasRunEvents: true, hasResults: true }),
    ).toBe(4);
  });

  it("returns 1 when the checklist is empty even if results somehow exist", () => {
    expect(
      deriveSessionStep({ checklistItemCount: 0, hasRunEvents: true, hasResults: true }),
    ).toBe(1);
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

  it("does not report a spurious change for an object/array attribute with the same content across different instances", () => {
    const unchangedObjectSnapshots: QaAttributeSnapshot[] = [
      {
        id: "sn1",
        qa_session_id: "s1",
        external_user_id: "u1",
        snapshot_name: "담기 전",
        status: "captured",
        payload: { tags: ["a", "b"], meta: { color: "red" } },
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
        // Same content, but different array/object instances (as happens with
        // separately-fetched/parsed rows) — should NOT be reported as a change.
        payload: { tags: ["a", "b"], meta: { color: "red" } },
        previous_snapshot_id: "sn1",
        requested_at: "2026-07-31T22:06:40Z",
        captured_at: "2026-07-31T22:06:52Z",
      },
    ];

    const rows = buildMergedTimeline([], unchangedObjectSnapshots);
    expect(rows).toEqual([]);
  });

  it("still detects a real change in an object/array attribute's content", () => {
    const changedObjectSnapshots: QaAttributeSnapshot[] = [
      {
        id: "sn1",
        qa_session_id: "s1",
        external_user_id: "u1",
        snapshot_name: "담기 전",
        status: "captured",
        payload: { tags: ["a", "b"], meta: { color: "red" } },
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
        payload: { tags: ["a", "b", "c"], meta: { color: "red" } },
        previous_snapshot_id: "sn1",
        requested_at: "2026-07-31T22:06:40Z",
        captured_at: "2026-07-31T22:06:52Z",
      },
    ];

    const rows = buildMergedTimeline([], changedObjectSnapshots);
    expect(rows.map((r) => r.name)).toEqual(["tags"]);
    expect(rows[0].change).toBe('["a","b"] → ["a","b","c"]');
  });

  it("anchors each diff to its immediate predecessor across a 3-snapshot chain", () => {
    const chain: QaAttributeSnapshot[] = [
      {
        id: "sn1",
        qa_session_id: "s1",
        external_user_id: "u1",
        snapshot_name: "1",
        status: "captured",
        payload: { cart_item_count: 0 },
        previous_snapshot_id: null,
        requested_at: "2026-07-31T22:00:00Z",
        captured_at: "2026-07-31T22:00:11Z",
      },
      {
        id: "sn2",
        qa_session_id: "s1",
        external_user_id: "u1",
        snapshot_name: "2",
        status: "captured",
        payload: { cart_item_count: 1 },
        previous_snapshot_id: "sn1",
        requested_at: "2026-07-31T22:05:00Z",
        captured_at: "2026-07-31T22:05:11Z",
      },
      {
        id: "sn3",
        qa_session_id: "s1",
        external_user_id: "u1",
        snapshot_name: "3",
        status: "captured",
        payload: { cart_item_count: 1 },
        previous_snapshot_id: "sn2",
        requested_at: "2026-07-31T22:10:00Z",
        captured_at: "2026-07-31T22:10:11Z",
      },
    ];

    const rows = buildMergedTimeline([], chain);
    // sn2 vs sn1 (predecessor): 0 -> 1, a real change.
    // sn3 vs sn2 (predecessor): 1 -> 1, no change.
    // If sn3 were (incorrectly) diffed against sn1 instead of sn2, it would
    // also show 0 -> 1 and produce a second row — so asserting exactly one
    // row here confirms each snapshot anchors to its immediate predecessor.
    expect(rows.map((r) => r.key)).toEqual(["snapshot:sn2:cart_item_count"]);
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
