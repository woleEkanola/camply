import { describe, expect, it } from "vitest";
import type { CampScheduleEvent } from "@prisma/client";
import {
  crossedInstant,
  crossedMinuteThreshold,
  dateInZone,
  publishReadiness,
  resolveLiveState,
  timeInZone,
  zonedDateTime,
} from "../service";

function event(overrides: Partial<CampScheduleEvent> = {}): CampScheduleEvent {
  const start = new Date("2026-08-13T07:00:00.000Z");
  return {
    id: "event-1", scheduleId: "schedule-1", dayNumber: 1, eventDate: new Date("2026-08-13T00:00:00.000Z"),
    kind: "TIMED", title: "Morning session", facilitator: null, location: "Main hall", notes: null,
    plannedStart: start, plannedEnd: new Date("2026-08-13T08:00:00.000Z"), effectiveStart: start,
    effectiveEnd: new Date("2026-08-13T08:00:00.000Z"), actualStart: null, actualEnd: null,
    sortOrder: 0, cancelled: false, createdAt: start, updatedAt: start, ...overrides,
  };
}

describe("schedule service", () => {
  it("converts Lagos wall time to UTC and renders it back without a one-hour shift", () => {
    const instant = zonedDateTime("2026-08-13", "08:00", "Africa/Lagos");
    expect(instant.toISOString()).toBe("2026-08-13T07:00:00.000Z");
    expect(dateInZone(instant, "Africa/Lagos")).toBe("2026-08-13");
    expect(timeInZone(instant, "Africa/Lagos")).toBe("08:00");
  });

  it("supports a timed activity crossing midnight", () => {
    const start = zonedDateTime("2026-08-13", "23:30", "Africa/Lagos");
    const end = zonedDateTime("2026-08-14", "00:30", "Africa/Lagos");
    const issues = publishReadiness([event({ effectiveStart: start, effectiveEnd: end })], { startDate: new Date("2026-08-13T00:00:00Z"), endDate: new Date("2026-08-14T00:00:00Z") }, "Africa/Lagos");
    expect(issues).toEqual([]);
  });

  it("detects overlaps, invalid times, missing locations, and camp-boundary errors", () => {
    const first = event({ id: "first", location: null });
    const second = event({ id: "second", effectiveStart: new Date("2026-08-13T07:30:00Z"), effectiveEnd: new Date("2026-08-13T07:20:00Z") });
    const issues = publishReadiness([first, second], { startDate: new Date("2026-08-14T00:00:00Z"), endDate: new Date("2026-08-15T00:00:00Z") }, "Africa/Lagos");
    expect(new Set(issues.map((issue) => issue.code))).toEqual(new Set(["LOCATION", "TIME", "CAMP_DATES", "OVERLAP"]));
  });

  it("uses actual start for variance and calculates a selected-day finish", () => {
    const first = event({ actualStart: new Date("2026-08-13T07:10:00Z") });
    const second = event({ id: "second", dayNumber: 2, effectiveStart: new Date("2026-08-14T07:00:00Z"), effectiveEnd: new Date("2026-08-14T08:30:00Z") });
    const live = resolveLiveState([first, second], new Date("2026-08-13T07:20:00Z"), 1);
    expect(live.status).toBe("BEHIND");
    expect(live.varianceMinutes).toBe(10);
    expect(live.projectedFinish?.toISOString()).toBe("2026-08-13T08:00:00.000Z");
  });

  it("detects crossings even when a poll skips the exact minute or instant", () => {
    const end = new Date("2026-08-13T08:00:00Z");
    expect(crossedMinuteThreshold(new Date("2026-08-13T07:54:50Z"), new Date("2026-08-13T07:55:05Z"), end, 5)).toBe(true);
    expect(crossedInstant(new Date("2026-08-13T07:59:58Z"), new Date("2026-08-13T08:00:03Z"), end)).toBe(true);
  });
});
