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
  "LEADERBOARD_SCORES",
  "PROGRAM_SCHEDULE",
  "ROOMING_LIST",
  "ROOM_DOOR_SHEETS",
  "STAFF_ROOMING_LIST",
  "STAFF_DUPLICATES",
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

/**
 * A single durably-stored chunk of a resumable export (see engine.ts's
 * `runResumableBuild`). `partNumber` is 1-based and dense — the engine relies
 * on that to detect "exactly one part" and promote it to a plain artifact.
 */
export interface ExportPart {
  partNumber: number;
  fileName: string;
  mimeType: string;
  size: number;
  cardCount: number;
  sheetCount: number;
  /** Blob URL this part's bytes live at — see blobStore.ts's privacy note before using this outside a server-to-server fetch. */
  blobKey: string;
}

/**
 * Result of one `buildChunk` call. A call renders as much as fits in its
 * budget (at least one sub-batch — see idCards.ts's SUB_BATCH_SIZE — so
 * forward progress is guaranteed every call) and stages it as a durable part
 * before returning, so a process killed immediately after this call returns
 * loses nothing already reported here.
 */
export interface ExportChunkOutcome {
  /** True once every source row has been consumed (rendered or skipped). */
  done: boolean;
  /** Row-offset cursor to resume from on the next call. */
  resumeIndex: number;
  /** The chunk staged by this call, if any rows were consumed. */
  part?: ExportPart;
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
  /**
   * Required unless `buildChunk` is implemented — the engine calls exactly
   * one of the two (buildChunk takes priority when both are present, though
   * no descriptor currently defines both).
   */
  build?(
    ctx: { prisma: any },
    params: ExportEnqueueParams,
    format: ExportFormat,
    onProgress: (p: ExportProgress) => Promise<void>
  ): Promise<ExportArtifact>;
  fileName(params: ExportEnqueueParams, format: ExportFormat): string;
  /**
   * Optional resumable path, used instead of `build()` when present. Only
   * kinds whose output can outgrow one function invocation's memory/time
   * budget implement this (ID_CARDS, STAFF_ID_CARDS) — everything else
   * (CSV/XLSX/JSON exports) is small enough that the plain `build()` call
   * above is correct and simpler.
   *
   * Each call must render at least one sub-batch before returning (guaranteed
   * forward progress) and stage what it rendered as a durable `ExportPart` via
   * `ctx.stagePart` before returning — the engine persists `resumeIndex` and
   * the returned part reference immediately after this call returns, so nothing
   * reported here can be lost even if the process is killed a moment later.
   */
  buildChunk?(
    ctx: { prisma: any; jobId: string; stagePart: (data: Buffer, meta: { fileName: string; mimeType: string; cardCount: number; sheetCount: number }) => Promise<ExportPart> },
    params: ExportEnqueueParams,
    format: ExportFormat,
    resumeIndex: number,
    deadline: number,
    onProgress: (p: ExportProgress) => Promise<void>
  ): Promise<ExportChunkOutcome>;
}
