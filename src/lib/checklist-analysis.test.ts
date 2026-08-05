import { beforeEach, describe, expect, it, vi } from "vitest";
import { judgeChecklistItem } from "./checklist-analysis";
import type { AttributeSnapshot } from "./checklist-judge";
import type { QaChecklistItem } from "./qa-rounds-queries";
import type { TaxonomyCustomAttribute, TaxonomyEvent, TaxonomyEventProperty } from "./queries";

const judgeWithAI = vi.hoisted(() => vi.fn());
vi.mock("./ai-judge.functions", () => ({ judgeChecklistItemWithAI: judgeWithAI }));

beforeEach(() => judgeWithAI.mockReset());

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
  created_at: "2026-08-05T00:00:00Z",
  executed_at: "2026-08-05T00:00:00Z",
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
  it("passes a structurally valid value from a single snapshot", async () => {
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
    expect(result.final_status).toBe("passed");
    expect(result.judged_by).toBe("rule");
  });

  it("treats false as a collected boolean value", async () => {
    const booleanAttribute = {
      ...baseAttribute,
      technical_name: "push_opt_in",
      data_type: "boolean",
    } as TaxonomyCustomAttribute;
    const snapshots: AttributeSnapshot[] = [
      {
        external_user_id: "u1",
        snapshot_name: "현재 상태",
        status: "captured",
        payload: { push_opt_in: false },
        captured_at: "2026-08-03T06:06:34Z",
      },
    ];
    const result = await judgeChecklistItem(item, {
      ...ctxWithSnapshots(snapshots),
      customAttributes: [booleanAttribute],
    });
    expect(result.final_status).toBe("passed");
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

  it("parses a comma-separated flat array attribute before judging", async () => {
    const snapshots: AttributeSnapshot[] = [
      {
        external_user_id: "u1",
        snapshot_name: "before",
        status: "captured",
        payload: { item_viewed_history: "item-a" },
        captured_at: "2026-08-03T06:00:00Z",
      },
      {
        external_user_id: "u1",
        snapshot_name: "after",
        status: "captured",
        payload: { item_viewed_history: "item-a, item-b,  item-c" },
        captured_at: "2026-08-03T06:06:34Z",
      },
    ];
    const result = await judgeChecklistItem(item, ctxWithSnapshots(snapshots));
    expect(result.final_status).toBe("passed");
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

describe("judgeChecklistItem — taxonomy example format", () => {
  it("sends property examples and observed values to AI as an implicit format rule", async () => {
    judgeWithAI.mockResolvedValue({
      ok: true,
      verdict: "failed",
      reasoning: "ISO 8601 형식이 아닙니다",
      evidence: {},
    });
    const event = {
      id: "event-1",
      technical_name: "signup_completed",
    } as TaxonomyEvent;
    const property = {
      id: "property-1",
      event_id: event.id,
      technical_name: "birth_date",
      data_type: "string",
      is_required: true,
      description: null,
      example_value: "2026-01-01T00:00:00.000+09:00",
      allowed_values: null,
    } as TaxonomyEventProperty;
    const missingProperty = {
      ...property,
      id: "property-2",
      technical_name: "required_but_missing",
      example_value: null,
    } as TaxonomyEventProperty;

    const result = await judgeChecklistItem(
      { ...item, target_type: "event", target_id: event.id },
      {
        events: [event],
        eventProperties: [property, missingProperty],
        customAttributes: [],
        rules: [],
        runEvents: [
          {
            event_id: event.id,
            raw_event_name: event.technical_name,
            occurred_at: "2026-08-03T00:00:00Z",
            external_user_id: "u1",
            raw_properties: { birth_date: "31년 05월 31일" },
          },
        ],
        snapshots: [],
      },
    );

    expect(judgeWithAI).toHaveBeenCalledWith({
      data: expect.objectContaining({
        rules: [
          expect.objectContaining({
            id: "taxonomy-property:property-1",
            description: expect.stringContaining("2026-01-01T00:00:00.000+09:00"),
          }),
        ],
        targets: [expect.objectContaining({ technicalName: "signup_completed" })],
      }),
    });
    expect(result).toMatchObject({
      final_status: "failed",
      failed_layer: "structural",
      judged_by: "ai",
    });
  });
});
