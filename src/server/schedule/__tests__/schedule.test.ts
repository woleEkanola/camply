import { describe, it, expect } from "vitest";
import { normalizeExcelDateTimeValue } from "../../../lib/import-export/parse";
import { parseTimeToMinutes, validateBundle } from "../../../lib/import-export/validate";
import type { RawBundle } from "../../../lib/import-export/parse";

describe("Schedule Parsing & Validation Tests", () => {
  it("normalizes Excel serial dates and times correctly", () => {
    // 0.375 = 09:00 AM (9/24)
    expect(normalizeExcelDateTimeValue(0.375)).toBe("09:00");
    // 0.5 = 12:00 PM
    expect(normalizeExcelDateTimeValue(0.5)).toBe("12:00");
    // Date serial 46052 = 2026-01-30
    expect(normalizeExcelDateTimeValue(46052)).toBe("2026-01-30");
    // Plain string unchanged
    expect(normalizeExcelDateTimeValue("08:30")).toBe("08:30");
  });

  it("parses 12-hour AM/PM and 24-hour time strings to minutes", () => {
    expect(parseTimeToMinutes("08:00")).toBe(480);
    expect(parseTimeToMinutes("08:30 AM")).toBe(510);
    expect(parseTimeToMinutes("02:15 PM")).toBe(855);
    expect(parseTimeToMinutes("12:00 AM")).toBe(0);
    expect(parseTimeToMinutes("12:00 PM")).toBe(720);
    expect(parseTimeToMinutes("invalid")).toBeNull();
  });

  it("validates milestones vs TIMED events and detects overlaps", () => {
    const rawBundle: RawBundle = {
      program_schedule: [
        {
          date: "2026-08-12",
          startTime: "08:00",
          endTime: "09:00",
          activity: "Praise Session",
          location: "Main Hall",
          type: "TIMED",
        },
        {
          date: "2026-08-12",
          startTime: "08:30",
          endTime: "09:30",
          activity: "Overlapping Talk",
          location: "Room 1",
          type: "TIMED",
        },
        {
          date: "2026-08-12",
          startTime: "22:00",
          activity: "Light Out",
          location: "Dorms",
          type: "MILESTONE",
        },
      ],
    };

    const { validated } = validateBundle(rawBundle);
    expect(validated.program_schedule.length).toBe(3);

    // Overlapping row should have an error
    const overlapRow = validated.program_schedule[1];
    expect(overlapRow.errors.some((e) => e.includes("Overlaps"))).toBe(true);

    // Milestone row should be valid and typed as MILESTONE
    const milestoneRow = validated.program_schedule[2];
    expect(milestoneRow.data?.type).toBe("MILESTONE");
  });

  it("accepts valid 53-row acceptance fixture structure with gaps and milestones", () => {
    const rows = [
      { date: "2026-08-12", startTime: "08:00", endTime: "09:00", activity: "Opening", location: "Auditorium" },
      { date: "2026-08-12", startTime: "09:15", endTime: "10:30", activity: "Workshop 1", location: "Hall A" },
      { date: "2026-08-12", startTime: "22:00", activity: "Light Out", type: "MILESTONE", location: "Stay here" },
    ];

    const { validated, errors } = validateBundle({ program_schedule: rows });
    expect(errors.length).toBe(0);
    expect(validated.program_schedule.length).toBe(3);
  });
});
