import { describe, expect, it } from "vitest";
import { deriveDateParts } from "../../src/util/date.js";

describe("deriveDateParts", () => {
  it("returns the expected parts for 2026-05-03 in Pacific/Honolulu", () => {
    const parts = deriveDateParts("2026-05-03", "Pacific/Honolulu");
    expect(parts).toEqual({
      weekday: "Sunday",
      weekdayShort: "Sun",
      monthName: "May",
      monthShort: "May",
      day: 3,
      year: 2026,
      formattedDate: "Sun, May 3",
    });
  });

  it("respects a timezone override (America/New_York) for the same date", () => {
    const parts = deriveDateParts("2026-05-03", "America/New_York");
    expect(parts.weekday).toBe("Sunday");
    expect(parts.weekdayShort).toBe("Sun");
    expect(parts.monthName).toBe("May");
    expect(parts.monthShort).toBe("May");
    expect(parts.day).toBe(3);
    expect(parts.year).toBe(2026);
    expect(parts.formattedDate).toBe("Sun, May 3");
  });

  it("handles a different weekday (2026-01-01 is a Thursday)", () => {
    const parts = deriveDateParts("2026-01-01", "Pacific/Honolulu");
    expect(parts.weekday).toBe("Thursday");
    expect(parts.weekdayShort).toBe("Thu");
    expect(parts.monthName).toBe("January");
    expect(parts.monthShort).toBe("Jan");
    expect(parts.day).toBe(1);
    expect(parts.year).toBe(2026);
    expect(parts.formattedDate).toBe("Thu, Jan 1");
  });

  it("throws on malformed input", () => {
    expect(() => deriveDateParts("May 3, 2026", "Pacific/Honolulu")).toThrow();
    expect(() => deriveDateParts("2026-5-3", "Pacific/Honolulu")).toThrow();
  });
});
