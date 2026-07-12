import Papa from "papaparse";
import type { EntityKind } from "./types";

export type RawRow = Record<string, unknown>;
export type RawBundle = Partial<Record<EntityKind, RawRow[]>>;

const CAMPUS_HINT_KEYS = ["address", "city", "campuscode", "signupopen", "pastor"];
const TRIBE_HINT_KEYS = ["meaning", "motto", "scripture", "allocationstrategy", "agerange"];
const DEPARTMENT_HINT_KEYS = ["campscoped", "responsibilities"];

/** Best-effort entity detection from a row's column headers (case-insensitive). */
export function detectEntityFromHeaders(headers: string[]): EntityKind | null {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  const has = (keys: string[]) => keys.some((k) => normalized.includes(k));
  if (has(DEPARTMENT_HINT_KEYS)) return "departments";
  if (has(TRIBE_HINT_KEYS)) return "tribes";
  if (has(CAMPUS_HINT_KEYS)) return "campuses";
  return null;
}

function normalizeHeaderRow(row: RawRow): RawRow {
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
  const rows = (result.data ?? []).map(normalizeHeaderRow);
  const headers = result.meta.fields ?? Object.keys(rows[0] ?? {});
  const entity = entityHint ?? detectEntityFromHeaders(headers);
  if (!entity) {
    throw new Error(
      "Could not determine which entity (Campuses, Tribes, or Departments) this CSV describes. Select an entity manually before importing."
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
    return { [entity]: parsed as RawRow[] };
  }
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    const bundle: RawBundle = {};
    if (Array.isArray(obj.campuses)) bundle.campuses = obj.campuses as RawRow[];
    if (Array.isArray(obj.tribes)) bundle.tribes = obj.tribes as RawRow[];
    if (Array.isArray(obj.departments)) bundle.departments = obj.departments as RawRow[];
    if (Object.keys(bundle).length === 0) {
      throw new Error("JSON file did not contain any recognizable campuses, tribes, or departments data.");
    }
    return bundle;
  }
  throw new Error("Unrecognized JSON structure.");
}

async function parseXlsx(buffer: ArrayBuffer, entityHint?: EntityKind): Promise<RawBundle> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array" });
  const bundle: RawBundle = {};
  const sheetNameFor: Record<EntityKind, string> = {
    campuses: "Campuses",
    tribes: "Tribes",
    departments: "Departments",
  };

  for (const entity of Object.keys(sheetNameFor) as EntityKind[]) {
    const match = workbook.SheetNames.find((n) => n.toLowerCase() === sheetNameFor[entity].toLowerCase());
    if (match) {
      const sheet = workbook.Sheets[match];
      bundle[entity] = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: undefined }).map(normalizeHeaderRow);
    }
  }

  if (Object.keys(bundle).length === 0 && workbook.SheetNames.length > 0) {
    // Single unrecognized sheet — fall back to header detection / explicit hint.
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: undefined }).map(normalizeHeaderRow);
    const headers = Object.keys(rows[0] ?? {});
    const entity = entityHint ?? detectEntityFromHeaders(headers);
    if (!entity) {
      throw new Error(
        "Could not determine which entity this spreadsheet describes. Name the sheet 'Campuses', 'Tribes', or 'Departments', or select an entity manually."
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
    // Split on unescaped pipes, trim the leading/trailing empty cells from the outer |...|
    const cells = line.split(/(?<!\\)\|/).map(unescape);
    if (cells[0] === "") cells.shift();
    if (cells[cells.length - 1] === "") cells.pop();
    return cells;
  };

  const headers = splitRow(tableLines[0]);
  // tableLines[1] is the --- separator row
  const dataLines = tableLines.slice(2);
  return dataLines.map((line) => {
    const cells = splitRow(line);
    const row: RawRow = {};
    headers.forEach((h, i) => {
      const v = cells[i];
      row[h] = v === "" || v === undefined ? undefined : v;
    });
    return row;
  });
}

function parseMarkdown(text: string): RawBundle {
  const headingFor: Record<EntityKind, RegExp> = {
    campuses: /^#{1,6}\s*campuses\s*$/i,
    tribes: /^#{1,6}\s*tribes\s*$/i,
    departments: /^#{1,6}\s*departments\s*$/i,
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
      "Could not find any '## Campuses', '## Tribes', or '## Departments' sections with a table in this Markdown file."
    );
  }
  return bundle;
}

export async function detectAndParse(
  file: File,
  entityHint?: EntityKind
): Promise<{ bundle: RawBundle; warnings: string[] }> {
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
