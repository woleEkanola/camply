import { prisma } from "../db";
import { uploadBlob, deleteBlobs } from "./blobStore";
import type { ExportPart } from "./types";

/**
 * Durably stores one chunk of a resumable export and appends it to the job's
 * `partRefs`. Called by a builder's `buildChunk` (via the `ctx.stagePart`
 * the engine hands it) once it has rendered as much as fits in its budget.
 *
 * The read-modify-write of `partRefs` runs inside a transaction: this
 * function is only ever called by the single worker holding a job's
 * exclusive RUNNING claim (see engine.ts), so concurrent callers for the
 * same job aren't expected — the transaction protects against a stale read
 * if that invariant is ever loosened, not a currently-observed race.
 */
export async function stagePart(
  jobId: string,
  data: Buffer,
  meta: { fileName: string; mimeType: string; cardCount: number; sheetCount: number }
): Promise<ExportPart> {
  const uploaded = await uploadBlob(jobId, data, meta.mimeType);
  return prisma.$transaction(async (tx) => {
    const job = await tx.exportJob.findUniqueOrThrow({ where: { id: jobId }, select: { partRefs: true } });
    const existing = (job.partRefs as unknown as ExportPart[] | null) ?? [];
    const part: ExportPart = {
      partNumber: existing.length + 1,
      fileName: meta.fileName,
      mimeType: meta.mimeType,
      size: uploaded.size,
      cardCount: meta.cardCount,
      sheetCount: meta.sheetCount,
      blobKey: uploaded.url,
    };
    await tx.exportJob.update({ where: { id: jobId }, data: { partRefs: [...existing, part] as any } });
    return part;
  });
}

export function getPartRefs(job: { partRefs: unknown }): ExportPart[] {
  return (job.partRefs as ExportPart[] | null) ?? [];
}

/** Deletes every staged part's blob for a job — call once the job reaches a terminal state and its parts are no longer needed (promoted into a single artifact, or the job failed/was cancelled/expired). */
export async function deletePartBlobs(job: { partRefs: unknown }): Promise<void> {
  const parts = getPartRefs(job);
  if (parts.length === 0) return;
  await deleteBlobs(parts.map((p) => p.blobKey));
}
