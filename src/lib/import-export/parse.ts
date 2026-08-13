import Papa from "papaparse";
import type { EntityKind } from "./types";

export type RawRow = Record<string, unknown>;
export type RawBundle = Partial<Record<EntityKind, RawRow[]>>;

const CAMPUS_HINT_KEYS = ["address", "city", "campuscode", "signupopen", "pastor"];
const TRIBE_HINT_KEYS = ["meaning", "motto", "scripture", "allocationstrategy", "agerange"];
const DEPARTMENT_HINT_KEYS = ["campscoped", "responsibilities"];
const SCHEDULE_HINT_KEYS = ["starttime", "activity", "endtime", "facilitator"];

/** Best-effort entity detection from a row's column headers (case-insensitive). */
export function detectEntityFromHeaders(headers: string[]): EntityKind | null {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  const has = (keys: string[]) => keys.some((k) => normalized.includes(k));
  if (has(SCHEDULE_HINT_KEYS)) return "program_schedule";
  if (has(DEPARTMENT_HINT_KEYS)) return "departments";
  if (has(TRIBE_HINT_KEYS)) return "tribes";
  if (has(CAMPUS_HINT_KEYS)) return "campuses";
  return null;
}

export function normalizeExcelDateTimeValue(v: unknown): unknown {
  if (typeof v === "number") {
    // Excel time-only serial number (0 <= v < 1)
    if (v >= 0 && v < 1) {
      const totalSeconds = Math.round(v * 86400);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
    // Excel date serial number (e.g., 40000..60000)
    if (v >= 1 && v < 100000) {
      // Excel epoch starts Jan 1 1900 (with leap year bug)
      const date = new Date(Math.round((v - 25569) * 86400 * 1000));
      return date.toISOString().split("T")[0];
    }
  }
  return v;
}

/** For XLSX rows only — cell values there are genuinely ambiguous Excel serial numbers. */
function normalizeHeaderRow(row: RawRow): RawRow {
  const out: RawRow = {};
  for (const [key, value] of Object.entries(row)) {
    const trimmedKey = key.trim();
    const normValue = normalizeExcelDateTimeValue(value);
    out[trimmedKey] = typeof normValue === "string" ? normValue.trim() : normValue;
  }
  return out;
}

/**
 * For JSON/CSV rows — just trims keys/strings, no Excel date/time reinterpretation.
 * Using normalizeHeaderRow here previously corrupted plain integers: a JSON
 * `displayOrder: 0` falls in normalizeExcelDateTimeValue's "0 <= v < 1" Excel
 * time-serial range and silently became the string "00:00", failing every
 * campus/tribe row's schema check with "Expected number, received string".
 */
function normalizeRow(row: RawRow): RawRow {
  const out: RawRow = {};
  for (const [key, value] of Object.entries(row)) {
    out[key.trim()] = typeof value === "string" ? value.trim() : value;
  }
  return out;
}

async function parseCsv(text: string, entityHint?: EntityKind): Promise<RawBundle> {
  const result = Papa.parse<RawRow>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const rows = (result.data ?? []).map(normalizeRow);
  const headers = result.meta.fields ?? Object.keys(rows[0] ?? {});
  const entity = entityHint ?? detectEntityFromHeaders(headers);
  if (!entity) {
    throw new Error(
      "Could not determine which entity (Campuses, Tribes, Departments, or Program Schedule) this CSV describes. Select an entity manually before importing."
    );
  }
  return { [entity]: rows };
}

function jsonRowsToBundle(parsed: unknown, entityHint?: EntityKind): RawBundle {
  if (Array.isArray(parsed)) {
    const first = parsed[0] as RawRow | undefined;
    const entity = entityHint ?? (first ? detectEntityFromHeaders(Object.keys(first)) : null);
    if (!entity) {
      throw new Error(
        "Could not determine which entity this JSON array describes. Select an entity manually before importing."
      );
    }
    return { [entity]: (parsed as RawRow[]).map(normalizeRow) };
  }
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    const bundle: RawBundle = {};
    if (Array.isArray(obj.campuses)) bundle.campuses = (obj.campuses as RawRow[]).map(normalizeRow);
    if (Array.isArray(obj.tribes)) bundle.tribes = (obj.tribes as RawRow[]).map(normalizeRow);
    if (Array.isArray(obj.departments)) bundle.departments = (obj.departments as RawRow[]).map(normalizeRow);
    if (Array.isArray(obj.program_schedule) || Array.isArray(obj.schedule)) {
      bundle.program_schedule = ((obj.program_schedule ?? obj.schedule) as RawRow[]).map(normalizeRow);
    }
    if (Object.keys(bundle).length === 0) {
      throw new Error("JSON file did not contain any recognizable campuses, tribes, departments, or schedule data.");
    }
    return bundle;
  }
  throw new Error("Unrecognized JSON structure.");
}

async function parseXlsx(buffer: ArrayBuffer, entityHint?: EntityKind): Promise<RawBundle> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const bundle: RawBundle = {};
  const sheetNameFor: Record<EntityKind, string[]> = {
    campuses: ["Campuses"],
    tribes: ["Tribes"],
    departments: ["Departments"],
    program_schedule: ["Program Schedule", "Schedule", "ProgramSchedule"],
  };

  for (const entity of Object.keys(sheetNameFor) as EntityKind[]) {
    const match = workbook.SheetNames.find((n) =>
      sheetNameFor[entity].some((s) => s.toLowerCase() === n.toLowerCase())
    );
    if (match) {
      const sheet = workbook.Sheets[match];
      bundle[entity] = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: undefined }).map(normalizeHeaderRow);
    }
  }

  if (Object.keys(bundle).length === 0 && workbook.SheetNames.length > 0) {
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: undefined }).map(normalizeHeaderRow);
    const headers = Object.keys(rows[0] ?? {});
    const entity = entityHint ?? detectEntityFromHeaders(headers);
    if (!entity) {
      throw new Error(
        "Could not determine which entity this spreadsheet describes. Name the sheet 'Campuses', 'Tribes', 'Departments', or 'Program Schedule', or select an entity manually."
      );
    }
    bundle[entity] = rows;
  }

  return bundle;
}

/** Parses a GFM markdown table under a `## <Heading>` section into row objects. */
function parseMarkdownTable(lines: string[]): RawRow[] {
  const tableLines = lines.filter((l) => l.trim().startsWith("|"));
  if (tableLines.length < 2) return [];

  const unescape = (cell: string) => cell.replace(/\\\|/g, "|").trim();
  const splitRow = (line: string): string[] => {
    const cells = line.split(/(?<!\\)\|/).map(unescape);
    if (cells[0] === "") cells.shift();
    if (cells[cells.length - 1] === "") cells.pop();
    return cells;
  };

  const headers = splitRow(tableLines[0]);
  const dataLines = tableLines.slice(2);
  return dataLines.map((line) => {
    const cells = splitRow(line);
    const row: RawRow = {};
    headers.forEach((h, i) => {
      const v = cells[i];
      row[h] = v === "" || v === undefined ? undefined : v;
    });
    return normalizeRow(row);
  });
}

function parseMarkdown(text: string): RawBundle {
  const headingFor: Record<EntityKind, RegExp> = {
    campuses: /^#{1,6}\s*campuses\s*$/i,
    tribes: /^#{1,6}\s*tribes\s*$/i,
    departments: /^#{1,6}\s*departments\s*$/i,
    program_schedule: /^#{1,6}\s*(program\s*schedule|schedule)\s*$/i,
  };
  const lines = text.split(/\r?\n/);
  const bundle: RawBundle = {};

  for (const entity of Object.keys(headingFor) as EntityKind[]) {
    const startIdx = lines.findIndex((l) => headingFor[entity].test(l.trim()));
    if (startIdx === -1) continue;
    const nextHeadingIdx = lines.findIndex(
      (l, i) => i > startIdx && /^#{1,6}\s/.test(l.trim())
    );
    const section = lines.slice(startIdx + 1, nextHeadingIdx === -1 ? undefined : nextHeadingIdx);
    const rows = parseMarkdownTable(section);
    if (rows.length > 0) bundle[entity] = rows;
  }

  if (Object.keys(bundle).length === 0) {
    throw new Error(
      "Could not find any '## Campuses', '## Tribes', '## Departments', or '## Program Schedule' sections with a table in this Markdown file."
    );
  }
  return bundle;
}


// Import files are small structured data (campuses/tribes/departments) —
// nothing legitimate approaches this size. Without a cap, the <input> at
// ImportPanel.tsx accepts anything matching the extension list and this
// function reads the whole thing into memory with file.arrayBuffer()/
// file.text(), so a large file freezes or OOMs the admin's tab with no
// feedback.
const MAX_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export async function detectAndParse(
  file: File,
  entityHint?: EntityKind
): Promise<{ bundle: RawBundle; warnings: string[] }> {
  if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
    throw new Error(
      `This file is ${(file.size / (1024 * 1024)).toFixed(1)}MB — the maximum for an import is ${MAX_IMPORT_FILE_SIZE_BYTES / (1024 * 1024)}MB. Split it into smaller files.`
    );
  }
  const warnings: string[] = [];
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "csv") {
    const text = await file.text();
    return { bundle: await parseCsv(text, entityHint), warnings };
  }
  if (ext === "json") {
    const text = await file.text();
    const parsed = JSON.parse(text);
    return { bundle: jsonRowsToBundle(parsed, entityHint), warnings };
  }
  if (ext === "xlsx" || ext === "xls") {
    const buffer = await file.arrayBuffer();
    return { bundle: await parseXlsx(buffer, entityHint), warnings };
  }
  if (ext === "md" || ext === "markdown") {
    const text = await file.text();
    return { bundle: parseMarkdown(text), warnings };
  }
  throw new Error(`Unsupported file type ".${ext}". Use CSV, XLSX, JSON, or Markdown (.md).`);
}
