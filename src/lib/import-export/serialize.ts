import Papa from "papaparse";
import {
  CAMPUS_COLUMNS,
  DEPARTMENT_COLUMNS,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  TRIBE_COLUMNS,
  type CampusRow,
  type DepartmentRow,
  type EntityKind,
  type ExportBundle,
  type TribeRow,
} from "./types";

type AnyRow = CampusRow | TribeRow | DepartmentRow;

const COLUMNS_FOR: Record<EntityKind, { key: string }[]> = {
  campuses: CAMPUS_COLUMNS,
  tribes: TRIBE_COLUMNS,
  departments: DEPARTMENT_COLUMNS,
};

function cellValue(row: AnyRow, key: string): string {
  const v = (row as unknown as Record<string, unknown>)[key];
  if (v === undefined || v === null) return "";
  if (Array.isArray(v)) return v.join("|");
  return String(v);
}

export function toJsonBundle(data: { campuses: CampusRow[]; tribes: TribeRow[]; departments: DepartmentRow[] }): ExportBundle {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    campuses: data.campuses,
    tribes: data.tribes,
    departments: data.departments,
  };
}

export function toCsv(entity: EntityKind, rows: AnyRow[]): string {
  const columns = COLUMNS_FOR[entity];
  const headers = columns.map((c) => c.key);
  const body = rows.map((row) => columns.map((c) => cellValue(row, c.key)));
  return Papa.unparse({ fields: headers, data: body });
}

export async function toXlsxWorkbook(data: {
  campuses: CampusRow[];
  tribes: TribeRow[];
  departments: DepartmentRow[];
}): Promise<Blob> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();

  const addSheet = (name: string, entity: EntityKind, rows: AnyRow[]) => {
    const columns = COLUMNS_FOR[entity];
    const headers = columns.map((c) => c.key);
    const aoa = [headers, ...rows.map((row) => columns.map((c) => cellValue(row, c.key)))];
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  };

  addSheet("Campuses", "campuses", data.campuses);
  addSheet("Tribes", "tribes", data.tribes);
  addSheet("Departments", "departments", data.departments);

  const arrayBuffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return new Blob([arrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function escapePipe(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function markdownTable(entity: EntityKind, rows: AnyRow[]): string {
  const columns = COLUMNS_FOR[entity];
  const headers = columns.map((c) => c.key);
  const headerLine = `| ${headers.join(" | ")} |`;
  const separatorLine = `| ${headers.map(() => "---").join(" | ")} |`;
  const rowLines = rows.map(
    (row) => `| ${columns.map((c) => escapePipe(cellValue(row, c.key))).join(" | ")} |`
  );
  return [headerLine, separatorLine, ...rowLines].join("\n");
}

export function toMarkdown(data: { campuses: CampusRow[]; tribes: TribeRow[]; departments: DepartmentRow[] }): string {
  const sections = [
    `# Camply Export\n\nExported ${new Date().toISOString()}`,
    `## Campuses\n\n${data.campuses.length ? markdownTable("campuses", data.campuses) : "_No campuses._"}`,
    `## Tribes\n\n${data.tribes.length ? markdownTable("tribes", data.tribes) : "_No tribes._"}`,
    `## Departments\n\n${data.departments.length ? markdownTable("departments", data.departments) : "_No departments._"}`,
  ];
  return sections.join("\n\n");
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
