import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime } from "@/lib/domain";

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
