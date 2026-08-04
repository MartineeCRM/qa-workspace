import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatMergedTimelineTime,
  formatRawLogTime,
} from "@/lib/domain";

describe("formatDate / formatDateTime", () => {
  it("formats in Asia/Seoul time regardless of the runtime's local timezone", () => {
    // 2026-08-01T15:12:00Z is 2026-08-02 00:12 in KST (UTC+9) — a UTC time
    // that lands on the previous calendar day, so a timezone-less formatter
    // would silently render the wrong date as well as the wrong hour.
    const utcTimestamp = "2026-08-01T15:12:00.000Z";

    expect(formatDateTime(utcTimestamp)).toContain("8. 2.");
    expect(formatDateTime(utcTimestamp)).toContain("12:12");
    expect(formatDate(utcTimestamp)).toContain("8월 02일");
  });

  it("returns a placeholder for missing values", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
  });
});

describe("formatRawLogTime", () => {
  it("renders the stored value's literal digits with no timezone shift", () => {
    // Ingested logs are stored verbatim with no zone conversion at any point
    // (see run-events-csv.ts), so displaying them must not shift the digits
    // either — unlike formatDateTime, which deliberately converts to KST for
    // genuine system timestamps.
    const stored = "2026-08-01T02:12:00.000Z";

    expect(formatRawLogTime(stored)).toContain("8. 1.");
    expect(formatRawLogTime(stored)).toContain("2:12");
  });

  it("returns a placeholder for missing values", () => {
    expect(formatRawLogTime(null)).toBe("—");
    expect(formatRawLogTime(undefined)).toBe("—");
  });
});

describe("formatMergedTimelineTime", () => {
  it("keeps event wall-clock time but converts snapshot capture time to Korea time", () => {
    const stored = "2026-08-01T15:12:00.000Z";

    expect(formatMergedTimelineTime("event", stored)).toContain("8. 1.");
    expect(formatMergedTimelineTime("event", stored)).toContain("3:12");
    expect(formatMergedTimelineTime("snapshot", stored)).toContain("8. 2.");
    expect(formatMergedTimelineTime("snapshot", stored)).toContain("12:12");
  });
});
