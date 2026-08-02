import { describe, expect, it } from "vitest";
import { parseRunEventsCsv } from "./run-events-csv";

describe("parseRunEventsCsv", () => {
  it("parses NAME/TIME/USER_ID/PROPERTIES rows", () => {
    const csv =
      "EVENT_ID,USER_ID,TIME,NAME,PROPERTIES\n" +
      'evt_1,u_100,2026-07-28T17:21:12Z,category_menu_click,"{""category_id"":""900034812""}"';
    const rows = parseRunEventsCsv(csv);
    expect(rows).toEqual([
      {
        raw_event_name: "category_menu_click",
        occurred_at: "2026-07-28T17:21:12Z",
        external_user_id: "u_100",
        raw_properties: { category_id: "900034812" },
      },
    ]);
  });

  it("defaults raw_properties to {} when PROPERTIES cell is missing or invalid JSON", () => {
    const csv =
      "USER_ID,TIME,NAME,PROPERTIES\n" +
      "u_100,2026-07-28T17:21:12Z,login,not-json\n" +
      "u_100,2026-07-28T17:22:00Z,logout,";
    const rows = parseRunEventsCsv(csv);
    expect(rows[0].raw_properties).toEqual({});
    expect(rows[1].raw_properties).toEqual({});
  });

  it("throws when required columns are missing", () => {
    const csv = "FOO,BAR\n1,2";
    expect(() => parseRunEventsCsv(csv)).toThrow("NAME, TIME, USER_ID");
  });

  it("returns an empty array for a header-only CSV", () => {
    const csv = "USER_ID,TIME,NAME,PROPERTIES";
    expect(parseRunEventsCsv(csv)).toEqual([]);
  });

  it("handles a comma inside a quoted PROPERTIES JSON value", () => {
    const csv =
      "USER_ID,TIME,NAME,PROPERTIES\n" +
      'u_100,2026-07-28T17:21:12Z,category_menu_click,"{""category_id"":""900034812"",""referrer"":""home""}"';
    const rows = parseRunEventsCsv(csv);
    expect(rows).toEqual([
      {
        raw_event_name: "category_menu_click",
        occurred_at: "2026-07-28T17:21:12Z",
        external_user_id: "u_100",
        raw_properties: { category_id: "900034812", referrer: "home" },
      },
    ]);
  });
});
