export const EXPORT_FORMAT = "camply-export" as const;
export const EXPORT_VERSION = 1 as const;

export type EntityKind = "campuses" | "tribes" | "departments" | "program_schedule";

export interface CampusRow {
  name: string;
  address: string;
  city: string;
  country: string;
  state?: string;
  zipCode?: string;
  pastor?: string;
  phone?: string;
  email?: string;
  campusCode?: string;
  suspended?: boolean;
  displayOrder?: number;
}

export interface TribeRow {
  name: string;
  code?: string;
  color?: string;
  description?: string;
  meaning?: string;
  motto?: string;
  scripture?: string;
  gender?: "MALE" | "FEMALE" | "MIXED";
  ageRange?: string;
  maxCapacity?: number;
  allocationStrategy?: "MANUAL" | "AUTOMATIC" | "INVITE_ONLY";
  displayOrder?: number;
  logoUrl?: string;
  bannerUrl?: string;
}

export interface DepartmentRow {
  name: string;
  description?: string;
  maxCapacity?: number;
  responsibilities?: string[];
  status?: "ACTIVE" | "INACTIVE";
  campScoped?: boolean;
}

export interface ScheduleRow {
  date: string;
  startTime: string;
  endDate?: string;
  endTime?: string;
  activity: string;
  facilitator?: string;
  location?: string;
  type?: "TIMED" | "MILESTONE";
  notes?: string;
}

export interface ImportBundle {
  campuses?: CampusRow[];
  tribes?: TribeRow[];
  departments?: DepartmentRow[];
  program_schedule?: ScheduleRow[];
}

export interface ExportBundle {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  campuses?: CampusRow[];
  tribes?: TribeRow[];
  departments?: DepartmentRow[];
  program_schedule?: ScheduleRow[];
}

export interface RowError {
  entity: EntityKind;
  rowIndex: number;
  field?: string;
  message: string;
}

export interface EntityImportResult {
  created: number;
  updated: number;
  errors: { rowIndex: number; name: string; message: string }[];
  warnings: { rowIndex: number; name: string; message: string }[];
}

export interface ImportResult {
  campuses?: EntityImportResult;
  tribes?: EntityImportResult;
  departments?: EntityImportResult;
  program_schedule?: EntityImportResult;
}

/** Single source of truth for column order/labels across CSV, XLSX, MD, and the Format Guide UI. */
export const CAMPUS_COLUMNS: { key: keyof CampusRow; required: boolean; type: string; example: string }[] = [
  { key: "name", required: true, type: "text", example: "Lekki Campus" },
  { key: "address", required: true, type: "text", example: "12 Admiralty Way" },
  { key: "city", required: true, type: "text", example: "Lagos" },
  { key: "country", required: true, type: "text", example: "Nigeria" },
  { key: "state", required: false, type: "text", example: "Lagos State" },
  { key: "zipCode", required: false, type: "text", example: "101233" },
  { key: "pastor", required: false, type: "text", example: "Pastor John Doe" },
  { key: "phone", required: false, type: "text", example: "+2348012345678" },
  { key: "email", required: false, type: "text", example: "lekki@church.org" },
  { key: "campusCode", required: false, type: "text", example: "LEK" },
  { key: "suspended", required: false, type: "boolean (default false)", example: "false" },
  { key: "displayOrder", required: false, type: "integer (default 0)", example: "1" },
];

export const TRIBE_COLUMNS: { key: keyof TribeRow; required: boolean; type: string; example: string }[] = [
  { key: "name", required: true, type: "text", example: "Agape" },
  { key: "code", required: false, type: "text (max 10 chars)", example: "AGP" },
  { key: "color", required: false, type: "hex color", example: "#E11D48" },
  { key: "description", required: false, type: "text", example: "Love in action" },
  { key: "meaning", required: false, type: "text", example: "Unconditional love" },
  { key: "motto", required: false, type: "text", example: "Love never fails" },
  { key: "scripture", required: false, type: "text", example: "1 Corinthians 13:4-8" },
  { key: "gender", required: false, type: "MALE | FEMALE | MIXED", example: "MIXED" },
  { key: "ageRange", required: false, type: "text", example: "6-17" },
  { key: "maxCapacity", required: false, type: "integer >= 1", example: "50" },
  { key: "allocationStrategy", required: false, type: "MANUAL | AUTOMATIC | INVITE_ONLY (default MANUAL)", example: "MANUAL" },
  { key: "displayOrder", required: false, type: "integer (default 0)", example: "1" },
  { key: "logoUrl", required: false, type: "URL", example: "https://example.com/logo.png" },
  { key: "bannerUrl", required: false, type: "URL", example: "https://example.com/banner.png" },
];

export const DEPARTMENT_COLUMNS: { key: keyof DepartmentRow; required: boolean; type: string; example: string }[] = [
  { key: "name", required: true, type: "text", example: "Registration" },
  { key: "description", required: false, type: "text", example: "Handles camper check-in" },
  { key: "maxCapacity", required: false, type: "integer >= 1", example: "20" },
  { key: "responsibilities", required: false, type: "pipe-separated list", example: "Setup|Teardown|Security" },
  { key: "status", required: false, type: "ACTIVE | INACTIVE (default ACTIVE)", example: "ACTIVE" },
  { key: "campScoped", required: false, type: "boolean (default false)", example: "false" },
];

export const SCHEDULE_COLUMNS: { key: keyof ScheduleRow; required: boolean; type: string; example: string }[] = [
  { key: "date", required: true, type: "YYYY-MM-DD", example: "2026-08-12" },
  { key: "startTime", required: true, type: "HH:mm or AM/PM", example: "08:00" },
  { key: "endDate", required: false, type: "YYYY-MM-DD", example: "2026-08-12" },
  { key: "endTime", required: false, type: "HH:mm or AM/PM (required for TIMED)", example: "09:00" },
  { key: "activity", required: true, type: "text", example: "Praise Session" },
  { key: "facilitator", required: false, type: "text", example: "Worship Team" },
  { key: "location", required: false, type: "text (required before publish)", example: "Main Auditorium" },
  { key: "type", required: false, type: "TIMED | MILESTONE (default TIMED)", example: "TIMED" },
  { key: "notes", required: false, type: "text", example: "Bring notebooks" },
];

