import { describe, expect, it } from "vitest";
import { dedupeRunEvents, parseRunEventsCsv } from "./run-events-csv";

describe("parseRunEventsCsv", () => {
  it("parses NAME/TIME/USER_ID/PROPERTIES rows", () => {
    const csv =
      "EVENT_ID,USER_ID,TIME,NAME,PROPERTIES\n" +
      'evt_1,u_100,2026-07-28T17:21:12Z,category_menu_click,"{""category_id"":""900034812""}"';
    const rows = parseRunEventsCsv(csv);
    expect(rows).toEqual([
      {
        source_event_id: "evt_1",
        raw_event_name: "category_menu_click",
        occurred_at: "2026-07-28T17:21:12Z",
        external_user_id: "u_100",
        raw_properties: { category_id: "900034812" },
      },
    ]);
  });

  it("defaults raw_properties to {} when PROPERTIES cell is missing or invalid JSON", () => {
    const csv =
      "EVENT_ID,USER_ID,TIME,NAME,PROPERTIES\n" +
      "evt_1,u_100,2026-07-28T17:21:12Z,login,not-json\n" +
      "evt_2,u_100,2026-07-28T17:22:00Z,logout,";
    const rows = parseRunEventsCsv(csv);
    expect(rows[0].raw_properties).toEqual({});
    expect(rows[1].raw_properties).toEqual({});
  });

  it("throws when required columns are missing", () => {
    const csv = "FOO,BAR\n1,2";
    expect(() => parseRunEventsCsv(csv)).toThrow("EVENT_ID, NAME, TIME, USER_ID");
  });

  it("throws when an EVENT_ID value is blank", () => {
    const csv = "EVENT_ID,USER_ID,TIME,NAME\n,u_100,2026-07-28T17:21:12Z,login";
    expect(() => parseRunEventsCsv(csv)).toThrow("2행의 EVENT_ID가 비어 있어요");
  });

  it("returns an empty array for a header-only CSV", () => {
    const csv = "EVENT_ID,USER_ID,TIME,NAME,PROPERTIES";
    expect(parseRunEventsCsv(csv)).toEqual([]);
  });

  it("handles a comma inside a quoted PROPERTIES JSON value", () => {
    const csv =
      "EVENT_ID,USER_ID,TIME,NAME,PROPERTIES\n" +
      'evt_1,u_100,2026-07-28T17:21:12Z,category_menu_click,"{""category_id"":""900034812"",""referrer"":""home""}"';
    const rows = parseRunEventsCsv(csv);
    expect(rows).toEqual([
      {
        source_event_id: "evt_1",
        raw_event_name: "category_menu_click",
        occurred_at: "2026-07-28T17:21:12Z",
        external_user_id: "u_100",
        raw_properties: { category_id: "900034812", referrer: "home" },
      },
    ]);
  });
});

describe("dedupeRunEvents", () => {
  const row = {
    raw_event_name: "login",
    occurred_at: "2026-07-28T17:21:12Z",
    external_user_id: "u_100",
    raw_properties: { platform: "ios_app" },
  };

  it("keeps one row per source event id", () => {
    expect(
      dedupeRunEvents([
        { ...row, source_event_id: "event-1" },
        { ...row, source_event_id: "event-1" },
        { ...row, source_event_id: "event-2" },
      ]),
    ).toHaveLength(2);
  });

  it("hides exact legacy duplicates whose source id was previously discarded", () => {
    expect(dedupeRunEvents([row, { ...row }])).toHaveLength(1);
  });
});
