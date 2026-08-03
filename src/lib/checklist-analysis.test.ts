import { describe, expect, it } from "vitest";
import { judgeChecklistItem } from "./checklist-analysis";
import type { AttributeSnapshot } from "./checklist-judge";
import type { QaChecklistItem } from "./qa-rounds-queries";
import type { TaxonomyCustomAttribute } from "./queries";

const baseAttribute: TaxonomyCustomAttribute = {
  id: "attr-1",
  project_id: "proj-1",
  technical_name: "item_viewed_history",
  display_name: null,
  description: null,
  data_type: "array",
  is_required: false,
  is_active: true,
  example_value: null,
  allowed_values: null,
  sort_order: 0,
  created_at: "2026-08-01T00:00:00Z",
} as TaxonomyCustomAttribute;

const item: QaChecklistItem = {
  id: "item-1",
  qa_session_id: "session-1",
  target_type: "custom_attribute",
  target_id: "attr-1",
};

function ctxWithSnapshots(snapshots: AttributeSnapshot[]) {
  return {
    events: [],
    eventProperties: [],
    customAttributes: [baseAttribute],
    rules: [],
    runEvents: [],
    snapshots,
  };
}

describe("judgeChecklistItem — custom attribute with no validation rule", () => {
  it("returns not_collected when only one snapshot was ever captured, even if the value looks valid", async () => {
    // Regression test: a single snapshot only shows the attribute's current value —
    // it can't prove that value was produced by this session's test actions rather
    // than being stale data from before the session started (e.g. a real user's
    // pre-existing Braze history). Previously this fell through structural checks
    // and the "no rule configured" branch auto-passed it.
    const snapshots: AttributeSnapshot[] = [
      {
        external_user_id: "u1",
        snapshot_name: "현재 상태",
        status: "captured",
        payload: { item_viewed_history: ["item-a", "item-b"] },
        captured_at: "2026-08-03T06:06:34Z",
      },
    ];
    const result = await judgeChecklistItem(item, ctxWithSnapshots(snapshots));
    expect(result.final_status).toBe("not_collected");
    expect(result.judged_by).toBe("rule");
  });

  it("passes once at least two snapshots exist and the value is structurally valid", async () => {
    const snapshots: AttributeSnapshot[] = [
      {
        external_user_id: "u1",
        snapshot_name: "before",
        status: "captured",
        payload: { item_viewed_history: [] },
        captured_at: "2026-08-03T06:00:00Z",
      },
      {
        external_user_id: "u1",
        snapshot_name: "after",
        status: "captured",
        payload: { item_viewed_history: ["item-a"] },
        captured_at: "2026-08-03T06:06:34Z",
      },
    ];
    const result = await judgeChecklistItem(item, ctxWithSnapshots(snapshots));
    expect(result.final_status).toBe("passed");
    expect(result.judged_by).toBe("rule");
  });

  it("still returns not_collected when the attribute never shows up in any snapshot", async () => {
    const snapshots: AttributeSnapshot[] = [
      {
        external_user_id: "u1",
        snapshot_name: "before",
        status: "captured",
        payload: {},
        captured_at: "2026-08-03T06:00:00Z",
      },
      {
        external_user_id: "u1",
        snapshot_name: "after",
        status: "captured",
        payload: {},
        captured_at: "2026-08-03T06:06:34Z",
      },
    ];
    const result = await judgeChecklistItem(item, ctxWithSnapshots(snapshots));
    expect(result.final_status).toBe("not_collected");
  });
});
