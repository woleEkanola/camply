import { describe, expect, it } from "vitest";
import { campDayKey, campDayRange } from "../dayKey";

describe("campDayKey", () => {
  it("returns the camp-local calendar date", () => {
    // 2026-08-06T23:30:00Z is 2026-08-07 00:30 in Africa/Lagos (UTC+1)
    expect(campDayKey(new Date("2026-08-06T23:30:00.000Z"), "Africa/Lagos")).toBe("2026-08-07");
  });

  it("does not flip a day early for a timezone behind UTC", () => {
    // 2026-08-07T02:00:00Z is 2026-08-06 22:00 in America/New_York (UTC-4 in August, DST)
    expect(campDayKey(new Date("2026-08-07T02:00:00.000Z"), "America/New_York")).toBe("2026-08-06");
  });

  it("agrees with UTC when timezone is UTC", () => {
    expect(campDayKey(new Date("2026-01-01T00:00:00.000Z"), "UTC")).toBe("2026-01-01");
  });

  it("handles a DST transition day without throwing or skipping a day", () => {
    // US DST spring-forward 2026-03-08. A scan at 06:30 UTC is 01:30 or
    // 02:30 America/New_York depending on the transition, but must always
    // resolve to a single well-formed calendar date.
    const key = campDayKey(new Date("2026-03-08T06:30:00.000Z"), "America/New_York");
    expect(key).toMatch(/^2026-03-0[78]$/);
  });
});

describe("campDayRange", () => {
  it("returns a 24h-minus-1ms window starting at camp-local midnight", () => {
    const { start, end } = campDayRange(new Date("2026-08-07T10:00:00.000Z"), "Africa/Lagos");
    // Africa/Lagos midnight on 2026-08-07 is 2026-08-06T23:00:00Z (UTC+1)
    expect(start.toISOString()).toBe("2026-08-06T23:00:00.000Z");
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60_000 - 1);
  });

  it("keeps the whole range on the same campDayKey", () => {
    const at = new Date("2026-08-07T18:00:00.000Z");
    const key = campDayKey(at, "America/New_York");
    const { start, end } = campDayRange(at, "America/New_York");
    expect(campDayKey(start, "America/New_York")).toBe(key);
    expect(campDayKey(end, "America/New_York")).toBe(key);
  });
});
