import { z } from "zod";

export const EXPORT_FORMATS = ["XLSX", "CSV", "JSON", "MD", "PDF"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_SCOPES = ["CURRENT_FILTER", "ALL", "SELECTED"] as const;
export type ExportScope = (typeof EXPORT_SCOPES)[number];

export const EXPORT_KINDS = [
  "CAMPERS",
  "CAMPERS_MEDICAL",
  "ID_CARDS",
  "ATTENDANCE_SHEET",
  "REGISTRATIONS",
  "STAFF",
  "STAFF_ID_CARDS",
  "REPORT_OPERATIONS",
  "CONFIG_BUNDLE",
  "TEMPLATE",
] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export interface ExportEnqueueParams {
  organizationId: string;
  kind: ExportKind;
  format: ExportFormat;
  scope: ExportScope;
  presetId?: string;
  filters: Record<string, unknown>;
  selectedIds?: string[];
}

export interface ExportProgress {
  processed?: number;
  total?: number;
  stage?: string;
}

export interface ExportArtifact {
  fileName: string;
  mimeType: string;
  data: Buffer;
}

export interface ExportPreset<F> {
  id: string;
  label: string;
  filters: Partial<F>;
}

/**
 * The contract every export kind implements. `registry.ts` is the only file
 * a new page/kind needs to touch — everything else (dialog, engine, center,
 * download route) is generic over this interface.
 */
export interface ExportDescriptor<F = Record<string, unknown>> {
  kind: ExportKind;
  label: string;
  formats: ExportFormat[];
  presets: ExportPreset<F>[];
  filterSchema: z.ZodType<F>;
  /** Re-checked both at enqueue time and again inside the job processor. */
  authorize(ctx: { prisma: any; session: any }, params: ExportEnqueueParams): Promise<void>;
  /** Drives the dialog's live summary (record count, estimated size). */
  count(ctx: { prisma: any }, params: ExportEnqueueParams): Promise<number>;
  build(
    ctx: { prisma: any },
    params: ExportEnqueueParams,
    format: ExportFormat,
    onProgress: (p: ExportProgress) => Promise<void>
  ): Promise<ExportArtifact>;
  fileName(params: ExportEnqueueParams, format: ExportFormat): string;
}
