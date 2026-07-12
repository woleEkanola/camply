import {
  CAMPUS_COLUMNS,
  DEPARTMENT_COLUMNS,
  TRIBE_COLUMNS,
  type CampusRow,
  type DepartmentRow,
  type EntityKind,
  type TribeRow,
} from "./types";
import { toCsv, toMarkdown, toXlsxWorkbook } from "./serialize";

function exampleRow<T>(columns: { key: string; example: string }[]): T {
  const row: Record<string, string> = {};
  columns.forEach((c) => (row[c.key] = c.example));
  return row as T;
}

export function templateRows(entity: EntityKind): (CampusRow | TribeRow | DepartmentRow)[] {
  if (entity === "campuses") return [exampleRow<CampusRow>(CAMPUS_COLUMNS), exampleRow<CampusRow>(CAMPUS_COLUMNS)];
  if (entity === "tribes") return [exampleRow<TribeRow>(TRIBE_COLUMNS), exampleRow<TribeRow>(TRIBE_COLUMNS)];
  return [exampleRow<DepartmentRow>(DEPARTMENT_COLUMNS), exampleRow<DepartmentRow>(DEPARTMENT_COLUMNS)];
}

export function templateCsv(entity: EntityKind): string {
  return toCsv(entity, templateRows(entity));
}

export function templateJson(entity: EntityKind): string {
  return JSON.stringify(templateRows(entity), null, 2);
}

export function templateMarkdown(entity: EntityKind): string {
  const empty = { campuses: [] as CampusRow[], tribes: [] as TribeRow[], departments: [] as DepartmentRow[] };
  empty[entity] = templateRows(entity) as any;
  return toMarkdown(empty);
}

export async function templateXlsx(): Promise<Blob> {
  return toXlsxWorkbook({
    campuses: templateRows("campuses") as CampusRow[],
    tribes: templateRows("tribes") as TribeRow[],
    departments: templateRows("departments") as DepartmentRow[],
  });
}
