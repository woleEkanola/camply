import type { z } from "zod";
import { campusRowSchema, tribeRowSchema, departmentRowSchema } from "./schemas";
import type { RawBundle, RawRow } from "./parse";
import type { CampusRow, DepartmentRow, EntityKind, ImportBundle, RowError, TribeRow } from "./types";

const SCHEMA_FOR: Record<EntityKind, z.ZodTypeAny> = {
  campuses: campusRowSchema,
  tribes: tribeRowSchema,
  departments: departmentRowSchema,
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

  return { previews, errors };
}

/** Validates every row in a raw parsed bundle against the shared row schemas for preview UI. */
export function validateBundle(raw: RawBundle): { validated: ValidatedBundle; errors: RowError[] } {
  const campuses = validateRows<CampusRow>("campuses", raw.campuses ?? []);
  const tribes = validateRows<TribeRow>("tribes", raw.tribes ?? []);
  const departments = validateRows<DepartmentRow>("departments", raw.departments ?? []);

  return {
    validated: { campuses: campuses.previews, tribes: tribes.previews, departments: departments.previews },
    errors: [...campuses.errors, ...tribes.errors, ...departments.errors],
  };
}

/** Extracts only the successfully-validated rows, ready to send to the import mutation. */
export function toImportBundle(validated: ValidatedBundle): ImportBundle {
  const bundle: ImportBundle = {};
  const campuses = validated.campuses.filter((r) => r.data).map((r) => r.data!);
  const tribes = validated.tribes.filter((r) => r.data).map((r) => r.data!);
  const departments = validated.departments.filter((r) => r.data).map((r) => r.data!);
  if (campuses.length) bundle.campuses = campuses;
  if (tribes.length) bundle.tribes = tribes;
  if (departments.length) bundle.departments = departments;
  return bundle;
}
