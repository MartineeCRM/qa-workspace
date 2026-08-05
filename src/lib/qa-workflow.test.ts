import { describe, expect, it } from "vitest";
import {
  aiFailedTaxonomyPropertyIds,
  deriveSessionStep,
  deriveSessionStepFromRow,
  buildMergedTimeline,
  nextChecklistItemId,
  previousChecklistItemId,
  checklistCoverageIssues,
  checklistCoverageItems,
  checklistTargetKey,
  environmentChecklistCoverage,
  flattenChecklistCoverageRounds,
  latestRoundChecklistRows,
  findTypoCandidate,
  parseReasonLines,
  summarizeRoundValidationItems,
  compressRoundHistory,
  compactVerdictReason,
  groupVerdictReason,
  normalizeChecklistExecution,
  hasCurrentChecklistResult,
  resolveEvidenceHighlightTone,
  buildEventSpecDiffRows,
  type ChecklistCoverageRow,
} from "@/lib/qa-workflow";
import type { QaAttributeSnapshot, QaRunEvent, RoundHistoryEntry } from "@/lib/qa-rounds-queries";
import type { CoverageItem } from "@/lib/queries";

describe("deriveSessionStep", () => {
  it("returns 1 when the session has no checklist items", () => {
    expect(
      deriveSessionStep({ checklistItemCount: 0, hasRunEvents: false, hasResults: false }),
    ).toBe(1);
  });

  it("stays on execution when items exist but nothing has been collected yet", () => {
    expect(
      deriveSessionStep({ checklistItemCount: 3, hasRunEvents: false, hasResults: false }),
    ).toBe(1);
  });

  it("returns 2 once run events are collected but analysis hasn't produced results yet", () => {
    expect(
      deriveSessionStep({ checklistItemCount: 3, hasRunEvents: true, hasResults: false }),
    ).toBe(2);
  });

  it("returns 3 once results exist, regardless of whether more run events keep arriving", () => {
    expect(deriveSessionStep({ checklistItemCount: 3, hasRunEvents: true, hasResults: true })).toBe(
      3,
    );
  });

  it("shows results when they exist even if the checklist query is momentarily empty", () => {
    expect(deriveSessionStep({ checklistItemCount: 0, hasRunEvents: true, hasResults: true })).toBe(
      3,
    );
  });
});

describe("normalizeChecklistExecution", () => {
  it("does not reinterpret legacy target selection as an execution", () => {
    expect(
      normalizeChecklistExecution({
        created_at: "2026-08-05T11:00:00+09:00",
        executed_at: "2026-08-05T11:00:00+09:00",
      }).executed_at,
    ).toBeNull();
    expect(
      normalizeChecklistExecution({
        created_at: "2026-08-05T12:00:00+09:00",
        executed_at: "2026-08-05T12:00:00+09:00",
      }).executed_at,
    ).toBe("2026-08-05T12:00:00+09:00");
  });

  it("keeps a newly recorded execution on a legacy checklist item", () => {
    expect(
      normalizeChecklistExecution({
        created_at: "2026-08-05T11:00:00+09:00",
        executed_at: "2026-08-05T14:00:00+09:00",
      }).executed_at,
    ).toBe("2026-08-05T14:00:00+09:00");
  });
});

describe("hasCurrentChecklistResult", () => {
  it("only accepts a result created after the item was actually executed", () => {
    expect(
      hasCurrentChecklistResult({
        executed_at: "2026-08-05T14:00:00+09:00",
        qa_checklist_item_results: [{ updated_at: "2026-08-05T11:00:00+09:00" }],
      }),
    ).toBe(false);
    expect(
      hasCurrentChecklistResult({
        executed_at: "2026-08-05T14:00:00+09:00",
        qa_checklist_item_results: [{ updated_at: "2026-08-05T16:26:00+09:00" }],
      }),
    ).toBe(true);
  });

  it("does not show results from the pre-execution checklist workflow", () => {
    expect(
      hasCurrentChecklistResult({
        executed_at: "2026-08-05T12:00:00+09:00",
        qa_checklist_item_results: [{ updated_at: "2026-08-05T16:00:00+09:00" }],
      }),
    ).toBe(false);
  });
});

describe("deriveSessionStepFromRow", () => {
  it("returns 1 for a brand new session with no checklist items yet", () => {
    expect(
      deriveSessionStepFromRow({ id: "s1", qa_round_checklist_items: [], qa_run_events: [] }),
    ).toBe(1);
  });

  it("stays on execution once items are checked but nothing's been collected", () => {
    expect(
      deriveSessionStepFromRow({
        id: "s1",
        qa_round_checklist_items: [{ qa_checklist_item_results: [] }],
        qa_run_events: [],
      }),
    ).toBe(1);
  });

  it("returns 2 once run events exist but no item has a result yet", () => {
    expect(
      deriveSessionStepFromRow({
        id: "s1",
        qa_round_checklist_items: [{ qa_checklist_item_results: [] }],
        qa_run_events: [{ id: "re1" }],
      }),
    ).toBe(2);
  });

  it("returns 3 once any item has a judged result", () => {
    expect(
      deriveSessionStepFromRow({
        id: "s1",
        qa_round_checklist_items: [
          { qa_checklist_item_results: [] },
          { qa_checklist_item_results: [{ id: "r1" }] },
        ],
        qa_run_events: [{ id: "re1" }],
      }),
    ).toBe(3);
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
      created_at: "2026-07-31T22:07:00Z",
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
      requested_at: "2026-07-31T13:03:00Z",
      captured_at: "2026-07-31T13:03:11Z",
    },
    {
      id: "sn2",
      qa_session_id: "s1",
      external_user_id: "u1",
      snapshot_name: "담은 후",
      status: "captured",
      payload: { cart_item_count: 1 },
      previous_snapshot_id: "sn1",
      requested_at: "2026-07-31T13:06:40Z",
      captured_at: "2026-07-31T13:06:52Z",
    },
  ];

  it("orders rows chronologically and only emits changed attribute keys per snapshot", () => {
    const rows = buildMergedTimeline(runEvents, snapshots);
    expect(rows.map((r) => r.name)).toEqual([
      "cart_item_count",
      "cart_item_added",
      "cart_item_count",
    ]);
    expect(rows[0]).toMatchObject({
      source: "snapshot",
      name: "cart_item_count",
      change: "— → 0",
    });
    expect(rows[1]).toMatchObject({
      source: "event",
      name: "cart_item_added",
    });
    expect(rows[2]).toMatchObject({
      source: "snapshot",
      name: "cart_item_count",
      change: "0 → 1",
    });
  });

  it("emits every received attribute from the first snapshot", () => {
    const rows = buildMergedTimeline([], [snapshots[0]]);
    expect(rows).toMatchObject([
      {
        key: "snapshot:sn1:cart_item_count",
        source: "snapshot",
        name: "cart_item_count",
        change: "— → 0",
      },
    ]);
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
    expect(rows.map((row) => row.key)).toEqual(["snapshot:sn1:tags", "snapshot:sn1:meta"]);
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
    expect(rows.map((r) => r.name)).toEqual(["tags", "meta", "tags"]);
    expect(rows[2].change).toBe('["a","b"] → ["a","b","c"]');
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
    expect(rows.map((r) => r.key)).toEqual([
      "snapshot:sn1:cart_item_count",
      "snapshot:sn2:cart_item_count",
    ]);
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
        qa_channel_id: null,
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
        qa_channel_id: null,
        checklist_item_id: "item-2",
        target_type: "custom_attribute",
        target_id: "attr-1",
        disposition: "unresolved",
        final_status: null,
        result_updated_at: null,
      },
    ]);
  });

  it("does not throw when Supabase embeds come back as null instead of an empty array", () => {
    const raw = [
      {
        id: "round-1",
        qa_environment_id: "env-1",
        round_number: 1,
        qa_sessions: null,
      },
      {
        id: "round-2",
        qa_environment_id: "env-1",
        round_number: 2,
        qa_sessions: [
          {
            id: "session-1",
            qa_round_checklist_items: null,
          },
          {
            id: "session-2",
            qa_round_checklist_items: [
              {
                id: "item-1",
                target_type: "event" as const,
                target_id: "ev-1",
                disposition: "unresolved" as const,
                qa_checklist_item_results: null,
              },
            ],
          },
        ],
      },
    ];

    expect(() => flattenChecklistCoverageRounds(raw)).not.toThrow();
    expect(flattenChecklistCoverageRounds(raw)).toEqual([
      {
        qa_environment_id: "env-1",
        qa_round_id: "round-2",
        round_number: 2,
        qa_session_id: "session-2",
        qa_channel_id: null,
        checklist_item_id: "item-1",
        target_type: "event",
        target_id: "ev-1",
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

describe("checklistCoverageItems", () => {
  it("excludes property-kind items, keeping event and attribute kinds", () => {
    const items: CoverageItem[] = [
      { key: "event:ev-1", kind: "event", id: "ev-1", label: "cart_item_added", eventName: null },
      {
        key: "property:p-1",
        kind: "property",
        id: "p-1",
        label: "sku",
        eventName: "cart_item_added",
      },
      { key: "attribute:attr-1", kind: "attribute", id: "attr-1", label: "email", eventName: null },
    ];
    expect(checklistCoverageItems(items).map((i) => i.kind)).toEqual(["event", "attribute"]);
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

  it("counts coverage independently for every required QA channel", () => {
    const rows = [
      row({
        target_type: "event",
        target_id: "ev-1",
        qa_channel_id: "ios",
        final_status: "passed",
      }),
    ];
    expect(environmentChecklistCoverage(items, rows, "env-1", ["ios", "android"])).toEqual({
      total: 6,
      verified: 1,
      failed: 0,
      notStarted: 5,
      ratio: 1 / 6,
    });
  });

  it("removes event-channel exclusions from the coverage denominator", () => {
    const eventOnly = [items[0]];
    const exclusions = new Set(["ev-1:android"]);
    expect(
      environmentChecklistCoverage(eventOnly, [], "env-1", ["ios", "android"], exclusions),
    ).toEqual({ total: 1, verified: 0, failed: 0, notStarted: 1, ratio: 0 });
  });

  it("does not count a carried-over failure as a current-round failure", () => {
    const rows = [
      row({
        target_type: "event",
        target_id: "ev-1",
        disposition: "carried_over",
        final_status: "failed",
      }),
    ];
    const result = environmentChecklistCoverage(items, rows, "env-1");
    expect(result.verified).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.notStarted).toBe(3);
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

describe("summarizeRoundValidationItems", () => {
  const item = (
    targetId: string,
    finalStatus: "passed" | "failed" | "not_collected",
    discussionCount = 0,
    disposition: "unresolved" | "carried_over" | "passed_override" = "unresolved",
  ) => ({
    target_type: "event" as const,
    target_id: targetId,
    disposition,
    qa_checklist_item_results: [
      {
        final_status: finalStatus,
        qa_discussions: Array.from({ length: discussionCount }, (_, index) => ({ id: `${index}` })),
      },
    ],
  });

  it("deduplicates targets and classifies failures by whether discussion exists", () => {
    expect(
      summarizeRoundValidationItems([
        item("passed", "passed"),
        item("unconfirmed", "failed"),
        item("confirmed", "failed", 1),
        item("confirmed", "passed"),
      ]),
    ).toEqual({ executed: 3, passed: 1, unconfirmedIssues: 1, confirmedIssues: 1 });
  });

  it("ignores legacy carry-over disposition when classifying the actual verdict", () => {
    expect(summarizeRoundValidationItems([item("failed", "failed", 0, "carried_over")])).toEqual({
      executed: 1,
      passed: 0,
      unconfirmedIssues: 1,
      confirmedIssues: 0,
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

describe("findTypoCandidate", () => {
  const props = (names: string[]) => names.map((n, i) => ({ id: `id-${i}`, technical_name: n }));

  it("finds a nearby typo among known names", () => {
    expect(findTypoCandidate("refferal_source", props(["referral_source", "platform"]))).toEqual({
      id: "id-0",
      name: "referral_source",
      distance: 2,
    });
  });

  it("picks the closest candidate when more than one is within range", () => {
    expect(findTypoCandidate("itme_id", props(["item_id", "item_ids"]))).toEqual({
      id: "id-0",
      name: "item_id",
      distance: 2,
    });
  });

  it("returns null when nothing is within edit distance 2", () => {
    expect(findTypoCandidate("totally_different", props(["item_id", "platform"]))).toBeNull();
  });

  it("ignores an exact match (that's not a typo, it's the same name)", () => {
    expect(findTypoCandidate("platform", props(["platform"]))).toBeNull();
  });
});

describe("parseReasonLines", () => {
  it("returns an empty array for null reasoning", () => {
    expect(parseReasonLines(null)).toEqual([]);
  });

  it("classifies type-mismatch and undefined-property lines", () => {
    const reasoning = [
      "item_final_price_krw: 타입이 string이어야 하는데 number입니다",
      "refferal_source: 택소노미에 정의되지 않은 프로퍼티입니다",
      "membership_grade: 허용된 값(GOLD, SILVER) 중이 아닙니다",
    ].join("\n");
    expect(parseReasonLines(reasoning)).toEqual([
      {
        property: "item_final_price_krw",
        kind: "type_mismatch",
        reason: "타입이 string이어야 하는데 number입니다",
      },
      {
        property: "refferal_source",
        kind: "undefined_property",
        reason: "택소노미에 정의되지 않은 프로퍼티입니다",
      },
      {
        property: "membership_grade",
        kind: "value_mismatch",
        reason: "허용된 값(GOLD, SILVER) 중이 아닙니다",
      },
    ]);
  });
});

describe("compressRoundHistory", () => {
  it("marks the oldest entry's delta as null (첫 발견, nothing to compare against)", () => {
    const history: RoundHistoryEntry[] = [
      {
        roundNumber: 1,
        reasoning: "a: 택소노미에 정의되지 않은 프로퍼티입니다",
        finalStatus: "failed",
      },
    ];
    const [entry] = compressRoundHistory(history);
    expect(entry.delta).toBeNull();
    expect(entry.undefinedProperties).toEqual(["a"]);
  });

  it("computes delta against the chronologically-previous (next-in-array) round", () => {
    const history: RoundHistoryEntry[] = [
      {
        roundNumber: 3,
        reasoning: [
          "a: 타입이 string이어야 하는데 number입니다",
          "b: 타입이 string이어야 하는데 number입니다",
          "c: 택소노미에 정의되지 않은 프로퍼티입니다",
        ].join("\n"),
        finalStatus: "failed",
      },
      {
        roundNumber: 2,
        reasoning: "c: 택소노미에 정의되지 않은 프로퍼티입니다",
        finalStatus: "failed",
      },
      {
        roundNumber: 1,
        reasoning: "c: 택소노미에 정의되지 않은 프로퍼티입니다",
        finalStatus: "failed",
      },
    ];
    const [latest, middle, oldest] = compressRoundHistory(history);
    expect(latest.delta).toBe(2); // 3 structured issues now vs 1 before
    expect(middle.delta).toBe(0); // 1 vs 1
    expect(oldest.delta).toBeNull();
  });

  it("keeps the raw reasoning as otherReason when nothing structured was parsed", () => {
    const history: RoundHistoryEntry[] = [
      { roundNumber: 1, reasoning: "AI가 판단한 자유 서술 사유", finalStatus: "failed" },
    ];
    const [entry] = compressRoundHistory(history);
    expect(entry.otherReason).toBe("AI가 판단한 자유 서술 사유");
    expect(entry.typeMismatchProperties).toEqual([]);
    expect(entry.undefinedProperties).toEqual([]);
  });

  it("uses the same missing, undefined, type, and value-format categories as the current result", () => {
    const [entry] = compressRoundHistory(
      [
        {
          roundNumber: 2,
          reasoning: [
            "missing: 필수 프로퍼티가 로그에 없습니다",
            "unknown: 택소노미에 정의되지 않은 프로퍼티입니다",
            "typed: 타입이 string이어야 하는데 number입니다",
            "enumed: 허용된 값(GOLD) 중이 아닙니다",
          ].join("\n"),
          evidence: {
            qualitative: [{ rule_id: "taxonomy-property:p5", verdict: "failed" }],
          },
          finalStatus: "failed",
        },
      ],
      new Map([["p5", "formatted"]]),
    );
    expect(entry.missingProperties).toEqual(["missing"]);
    expect(entry.undefinedProperties).toEqual(["unknown"]);
    expect(entry.typeMismatchProperties).toEqual(["typed"]);
    expect(entry.valueFormatProperties).toEqual(["enumed", "formatted"]);
  });
});

describe("buildEventSpecDiffRows", () => {
  const properties = [
    {
      id: "p1",
      technical_name: "item_final_price_krw",
      data_type: "string",
      is_required: false,
      allowed_values: null,
      example_value: "15661",
    },
    {
      id: "p2",
      technical_name: "platform",
      data_type: "string",
      is_required: true,
      allowed_values: null,
      example_value: "android_app",
    },
  ];

  it("flags a type mismatch when the observed value doesn't match the taxonomy type", () => {
    const rows = buildEventSpecDiffRows({
      properties,
      rawPropertiesList: [{ item_final_price_krw: 15661, platform: "android_app" }],
    });
    const priceRow = rows.find((r) => r.name === "item_final_price_krw");
    expect(priceRow).toMatchObject({
      verdict: "type_mismatch",
      observedType: "number",
      expectedType: "string",
    });
  });

  it("passes a required property whose value matches the declared type", () => {
    const rows = buildEventSpecDiffRows({
      properties,
      rawPropertiesList: [{ item_final_price_krw: "15661", platform: "android_app" }],
    });
    expect(rows.find((r) => r.name === "platform")).toMatchObject({ verdict: "pass" });
  });

  it("distinguishes a missing required property, but lets an absent optional one pass", () => {
    const rows = buildEventSpecDiffRows({
      properties,
      rawPropertiesList: [{ item_final_price_krw: "15661" }], // platform (required) absent
    });
    expect(rows.find((r) => r.name === "platform")).toMatchObject({
      verdict: "missing_required",
      observedType: "없음",
    });
    expect(rows.find((r) => r.name === "item_final_price_krw")).toMatchObject({ verdict: "pass" });
  });

  it("distinguishes an allowed-value mismatch from a type mismatch", () => {
    const rows = buildEventSpecDiffRows({
      properties: [{ ...properties[1], allowed_values: ["android_app", "ios_app"] }],
      rawPropertiesList: [{ platform: "ANDROID" }],
    });
    expect(rows[0]).toMatchObject({
      verdict: "value_mismatch",
      observedSample: "ANDROID",
      allowedValues: ["android_app", "ios_app"],
    });
  });

  it("flags a mismatch if ANY matched occurrence is wrong, even when others are fine", () => {
    const rows = buildEventSpecDiffRows({
      properties,
      rawPropertiesList: [
        { item_final_price_krw: "15661", platform: "android_app" }, // fine
        { item_final_price_krw: 15661, platform: "android_app" }, // wrong type
      ],
    });
    expect(rows.find((r) => r.name === "item_final_price_krw")).toMatchObject({
      verdict: "type_mismatch",
      observedType: "number",
    });
  });

  it("surfaces a raw log key that isn't in the taxonomy as undefined_property, with a typo candidate when one is close", () => {
    const rows = buildEventSpecDiffRows({
      properties,
      rawPropertiesList: [{ platform: "android_app", refferal_source: "https://example.com" }],
    });
    const undef = rows.find((r) => r.name === "refferal_source");
    expect(undef).toBeDefined();
    expect(undef?.verdict).toBe("undefined_property");
    expect(undef?.propertyId).toBeNull();
  });

  it("only reports each unknown key once across multiple matched raw property sets", () => {
    const rows = buildEventSpecDiffRows({
      properties,
      rawPropertiesList: [
        { platform: "android_app", is_login: "true" },
        { platform: "android_app", is_login: "true" },
      ],
    });
    expect(rows.filter((r) => r.name === "is_login")).toHaveLength(1);
  });

  it("carries the taxonomy's example value through for known properties, and leaves it absent for undefined ones", () => {
    const rows = buildEventSpecDiffRows({
      properties,
      rawPropertiesList: [{ platform: "android_app", refferal_source: "https://example.com" }],
    });
    expect(rows.find((r) => r.name === "platform")).toMatchObject({
      expectedExample: "android_app",
    });
    expect(rows.find((r) => r.name === "refferal_source")?.expectedExample).toBeUndefined();
  });

  it("shows an AI-failed structurally valid property as a semantic mismatch", () => {
    const rows = buildEventSpecDiffRows({
      properties,
      rawPropertiesList: [{ item_final_price_krw: "15661", platform: "android_app" }],
      aiFailedPropertyIds: new Set(["p2"]),
    });
    expect(rows.find((row) => row.propertyId === "p2")?.verdict).toBe("semantic_mismatch");
  });
});

describe("aiFailedTaxonomyPropertyIds", () => {
  it("extracts failed property rule ids from combined structural and AI evidence", () => {
    expect(
      aiFailedTaxonomyPropertyIds({
        structural: [],
        qualitative: [
          { rule_id: "taxonomy-property:p1", verdict: "passed" },
          { rule_id: "taxonomy-property:p2", verdict: "failed" },
          { rule_id: "custom-rule", verdict: "failed" },
        ],
      }),
    ).toEqual(new Set(["p2"]));
  });
});

describe("groupVerdictReason", () => {
  it("groups repeated structural errors and keeps narrative reasoning", () => {
    const reason = [
      "content_name: 필수 프로퍼티가 로그에 없습니다",
      "event_name: 필수 프로퍼티가 로그에 없습니다",
      "page_title: 택소노미에 정의되지 않은 프로퍼티입니다",
      "값의 표현 체계도 기대 계약과 다릅니다.",
    ].join("\n");

    expect(groupVerdictReason(reason)).toMatchObject({
      groups: [
        { label: "필수 누락", targets: ["content_name", "event_name"] },
        { label: "미정의 프로퍼티", targets: ["page_title"] },
      ],
      ungrouped: ["값의 표현 체계도 기대 계약과 다릅니다."],
      detailCount: 4,
    });
    expect(compactVerdictReason(reason)).toBe(
      "필수 누락 2개 · 미정의 프로퍼티 1개 · 값의 표현 체계도 기대 계약과 다릅니다.",
    );
  });
});

describe("resolveEvidenceHighlightTone", () => {
  it("leaves all-tab evidence unhighlighted and gives issue hover priority", () => {
    expect(resolveEvidenceHighlightTone({ issueHovered: false, selected: false })).toBeNull();
    expect(
      resolveEvidenceHighlightTone({ issueHovered: false, selected: true, selectedTone: "issue" }),
    ).toBe("issue");
    expect(
      resolveEvidenceHighlightTone({ issueHovered: true, selected: true, selectedTone: "pass" }),
    ).toBe("hover");
  });
});
