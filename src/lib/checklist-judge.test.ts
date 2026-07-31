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
