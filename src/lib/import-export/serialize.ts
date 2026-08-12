import Papa from "papaparse";
import {
  CAMPUS_COLUMNS,
  DEPARTMENT_COLUMNS,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  SCHEDULE_COLUMNS,
  TRIBE_COLUMNS,
  type CampusRow,
  type DepartmentRow,
  type EntityKind,
  type ExportBundle,
  type ScheduleRow,
  type TribeRow,
} from "./types";

type AnyRow = CampusRow | TribeRow | DepartmentRow | ScheduleRow;

const COLUMNS_FOR: Record<EntityKind, { key: string }[]> = {
  campuses: CAMPUS_COLUMNS,
  tribes: TRIBE_COLUMNS,
  departments: DEPARTMENT_COLUMNS,
  program_schedule: SCHEDULE_COLUMNS,
};

function cellValue(row: AnyRow, key: string): string {
  const v = (row as unknown as Record<string, unknown>)[key];
  if (v === undefined || v === null) return "";
  if (Array.isArray(v)) return v.join("|");
  return String(v);
}

// A leading =, +, -, or @ makes Excel/Sheets interpret a CSV cell as a formula
// rather than text — user-entered fields (names, allergies, notes, etc.) must
// never reach a spreadsheet unescaped. Prefixing with a straight quote forces
// text interpretation without changing the visible value.
export function escapeFormula(v: string): string {
  return /^[=+\-@]/.test(v) ? `'${v}` : v;
}

export function toJsonBundle(data: {
  campuses?: CampusRow[];
  tribes?: TribeRow[];
  departments?: DepartmentRow[];
  program_schedule?: ScheduleRow[];
}): ExportBundle {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    campuses: data.campuses,
    tribes: data.tribes,
    departments: data.departments,
    program_schedule: data.program_schedule,
  };
}

export function toCsv(entity: EntityKind, rows: AnyRow[]): string {
  const columns = COLUMNS_FOR[entity];
  const headers = columns.map((c) => c.key);
  const body = rows.map((row) => columns.map((c) => escapeFormula(cellValue(row, c.key))));
  return Papa.unparse({ fields: headers, data: body });
}

export async function toXlsxWorkbook(data: {
  campuses?: CampusRow[];
  tribes?: TribeRow[];
  departments?: DepartmentRow[];
  program_schedule?: ScheduleRow[];
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

  if (data.campuses) addSheet("Campuses", "campuses", data.campuses);
  if (data.tribes) addSheet("Tribes", "tribes", data.tribes);
  if (data.departments) addSheet("Departments", "departments", data.departments);
  if (data.program_schedule) addSheet("Program Schedule", "program_schedule", data.program_schedule);

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

export function toMarkdown(data: {
  campuses?: CampusRow[];
  tribes?: TribeRow[];
  departments?: DepartmentRow[];
  program_schedule?: ScheduleRow[];
}): string {
  const sections = [
    `# Camply Export\n\nExported ${new Date().toISOString()}`,
    data.campuses ? `## Campuses\n\n${data.campuses.length ? markdownTable("campuses", data.campuses) : "_No campuses._"}` : "",
    data.tribes ? `## Tribes\n\n${data.tribes.length ? markdownTable("tribes", data.tribes) : "_No tribes._"}` : "",
    data.departments ? `## Departments\n\n${data.departments.length ? markdownTable("departments", data.departments) : "_No departments._"}` : "",
    data.program_schedule ? `## Program Schedule\n\n${data.program_schedule.length ? markdownTable("program_schedule", data.program_schedule) : "_No program schedule._"}` : "",
  ].filter(Boolean);
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

export function exportUserDataToCsv(rows: Record<string, any>[]): string {
  if (!rows || rows.length === 0) return "";
  const escapedRows = rows.map((row) => {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = v === null || v === undefined ? v : escapeFormula(String(v));
    }
    return out;
  });
  return Papa.unparse(escapedRows);
}

export async function exportUserDataToXlsx(rows: Record<string, any>[]): Promise<Blob> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();

  if (!rows || rows.length === 0) {
    const sheet = XLSX.utils.aoa_to_sheet([["No records match the requested filters"]]);
    XLSX.utils.book_append_sheet(workbook, sheet, "User Data");
  } else {
    // Collect all unique header keys across all objects to handle dynamic custom fields
    const headerSet = new Set<string>();
    for (const r of rows) {
      for (const k of Object.keys(r)) {
        headerSet.add(k);
      }
    }
    const headers = Array.from(headerSet);
    const body = rows.map((r) =>
      headers.map((h) => (r[h] !== undefined && r[h] !== null ? escapeFormula(String(r[h])) : ""))
    );

    const sheet = XLSX.utils.aoa_to_sheet([headers, ...body]);

    // Format column widths nicely
    const colWidths = headers.map((h) => ({
      wch: Math.max(h.length, 15),
    }));
    sheet["!cols"] = colWidths;

    XLSX.utils.book_append_sheet(workbook, sheet, "User & Camper Data");
  }

  const arrayBuffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return new Blob([arrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
