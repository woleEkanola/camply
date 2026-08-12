import type { z } from "zod";
import { campusRowSchema, tribeRowSchema, departmentRowSchema, scheduleRowSchema } from "./schemas";
import type { RawBundle, RawRow } from "./parse";
import type { CampusRow, DepartmentRow, EntityKind, ImportBundle, RowError, ScheduleRow, TribeRow } from "./types";

const SCHEMA_FOR: Record<EntityKind, z.ZodTypeAny> = {
  campuses: campusRowSchema,
  tribes: tribeRowSchema,
  departments: departmentRowSchema,
  program_schedule: scheduleRowSchema,
};

export interface PreviewRow<T> {
  rowIndex: number;
  raw: RawRow;
  data?: T;
  errors: string[];
}

export interface ValidatedBundle {
  campuses: PreviewRow<CampusRow>[];
  tribes: PreviewRow<TribeRow>[];
  departments: PreviewRow<DepartmentRow>[];
  program_schedule: PreviewRow<ScheduleRow>[];
}

export function parseTimeToMinutes(timeStr: string): number | null {
  if (!timeStr) return null;
  const str = timeStr.trim();
  const ampmMatch = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const minutes = parseInt(ampmMatch[2], 10);
    const period = ampmMatch[3].toUpperCase();
    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }
  const h24Match = str.match(/^(\d{1,2}):(\d{2})$/);
  if (h24Match) {
    const hours = parseInt(h24Match[1], 10);
    const minutes = parseInt(h24Match[2], 10);
    return hours * 60 + minutes;
  }
  return null;
}

function validateRows<T>(entity: EntityKind, rows: RawRow[]): { previews: PreviewRow<T>[]; errors: RowError[] } {
  const schema = SCHEMA_FOR[entity];
  const previews: PreviewRow<T>[] = [];
  const errors: RowError[] = [];

  rows.forEach((raw, i) => {
    const result = schema.safeParse(raw);
    if (result.success) {
      previews.push({ rowIndex: i, raw, data: result.data as T, errors: [] });
    } else {
      const messages = result.error.issues.map((issue) => `${issue.path.join(".") || "row"}: ${issue.message}`);
      previews.push({ rowIndex: i, raw, errors: messages });
      messages.forEach((message) =>
        errors.push({ entity, rowIndex: i, field: undefined, message })
      );
    }
  });

  if (entity === "program_schedule") {
    // Perform schedule specific validations (TIMED vs MILESTONE, overlaps)
    const validRows = previews.filter((p) => p.data) as PreviewRow<ScheduleRow>[];
    const eventsByDay = new Map<string, { index: number; start: number; end: number; title: string }[]>();

    validRows.forEach((p) => {
      const row = p.data!;
      const isMilestone = row.type === "MILESTONE" || (!row.endTime && !row.endDate);
      const startMin = parseTimeToMinutes(row.startTime);
      if (startMin === null) {
        p.errors.push("Invalid startTime format. Use HH:mm or AM/PM.");
        errors.push({ entity, rowIndex: p.rowIndex, message: "Invalid startTime format" });
      }
      if (isMilestone) {
        row.type = "MILESTONE";
      } else {
        row.type = "TIMED";
        if (!row.endTime) {
          p.errors.push("TIMED events require an endTime.");
          errors.push({ entity, rowIndex: p.rowIndex, message: "TIMED events require an endTime" });
        } else {
          const endMin = parseTimeToMinutes(row.endTime);
          if (endMin === null) {
            p.errors.push("Invalid endTime format. Use HH:mm or AM/PM.");
            errors.push({ entity, rowIndex: p.rowIndex, message: "Invalid endTime format" });
          } else if (startMin !== null && endMin <= startMin) {
            p.errors.push("endTime must be after startTime.");
            errors.push({ entity, rowIndex: p.rowIndex, message: "endTime must be after startTime" });
          } else if (startMin !== null) {
            const dayKey = row.date;
            const existing = eventsByDay.get(dayKey) ?? [];
            for (const other of existing) {
              if (startMin < other.end && endMin > other.start) {
                p.errors.push(`Overlaps with "${other.title}" on ${dayKey}. Shared timeline cannot have overlaps.`);
                errors.push({ entity, rowIndex: p.rowIndex, message: `Overlaps with "${other.title}"` });
              }
            }
            existing.push({ index: p.rowIndex, start: startMin, end: endMin, title: row.activity });
            eventsByDay.set(dayKey, existing);
          }
        }
      }
    });
  }

  return { previews, errors };
}

/** Validates every row in a raw parsed bundle against the shared row schemas for preview UI. */
export function validateBundle(raw: RawBundle): { validated: ValidatedBundle; errors: RowError[] } {
  const campuses = validateRows<CampusRow>("campuses", raw.campuses ?? []);
  const tribes = validateRows<TribeRow>("tribes", raw.tribes ?? []);
  const departments = validateRows<DepartmentRow>("departments", raw.departments ?? []);
  const program_schedule = validateRows<ScheduleRow>("program_schedule", raw.program_schedule ?? []);

  return {
    validated: {
      campuses: campuses.previews,
      tribes: tribes.previews,
      departments: departments.previews,
      program_schedule: program_schedule.previews,
    },
    errors: [...campuses.errors, ...tribes.errors, ...departments.errors, ...program_schedule.errors],
  };
}

/** Extracts only the successfully-validated rows, ready to send to the import mutation. */
export function toImportBundle(validated: ValidatedBundle): ImportBundle {
  const bundle: ImportBundle = {};
  const campuses = validated.campuses.filter((r) => r.data && r.errors.length === 0).map((r) => r.data!);
  const tribes = validated.tribes.filter((r) => r.data && r.errors.length === 0).map((r) => r.data!);
  const departments = validated.departments.filter((r) => r.data && r.errors.length === 0).map((r) => r.data!);
  const program_schedule = validated.program_schedule.filter((r) => r.data && r.errors.length === 0).map((r) => r.data!);

  if (campuses.length) bundle.campuses = campuses;
  if (tribes.length) bundle.tribes = tribes;
  if (departments.length) bundle.departments = departments;
  if (program_schedule.length) bundle.program_schedule = program_schedule;
  return bundle;
}

