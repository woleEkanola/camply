import { prisma } from "../db";
import { artifactStore } from "./artifactStore";
import { getExportDescriptor } from "./registry";
import type { ExportEnqueueParams, ExportProgress } from "./types";
import "./builders";

const MAX_ATTEMPTS = 3;
const EXPORT_TTL_HOURS = 24;
const STALE_RUNNING_MINUTES = 10;

class ExportCancelledError extends Error {
  constructor() {
    super("Export cancelled");
    this.name = "ExportCancelledError";
  }
}

/**
 * Creates the job row, authorizes it against the caller, and fires off
 * generation immediately (un-awaited) so a normal export starts within
 * milliseconds. `sweepPendingExportJobs` is the retry/crash backstop, not
 * the primary path — Render cron granularity would otherwise make every
 * export a minute slow.
 */
export async function enqueueExportJob(
  ctx: { prisma: any; session: any },
  params: ExportEnqueueParams,
  label: string
) {
  const descriptor = getExportDescriptor(params.kind);
  await descriptor.authorize(ctx, params);

  const userId = ctx.session.user.id;
  const job = await prisma.exportJob.create({
    data: {
      organizationId: params.organizationId,
      userId,
      kind: params.kind,
      format: params.format,
      label,
      params: params as any,
      status: "QUEUED",
      expiresAt: new Date(Date.now() + EXPORT_TTL_HOURS * 60 * 60 * 1000),
    },
  });

  void processExportJob(job.id).catch((error) => {
    console.error(`[export] immediate kick-off failed for job ${job.id}:`, error);
  });

  return job;
}

/**
 * Processes one queued export job. Never throws — failures are recorded on
 * the row with a backoff `runAfter` so the sweep can retry, mirroring
 * src/server/registration/effects.ts's processSideEffect.
 */
export async function processExportJob(id: string) {
  const claimed = await prisma.exportJob.updateMany({
    where: { id, status: "QUEUED", runAfter: { lte: new Date() } },
    data: { status: "RUNNING", startedAt: new Date(), stage: "Preparing export…" },
  });
  if (claimed.count !== 1) return;
  const job = await prisma.exportJob.findUniqueOrThrow({ where: { id } });

  try {
    const descriptor = getExportDescriptor(job.kind as any);
    const params = job.params as unknown as ExportEnqueueParams;

    // Re-check authorization against the owner's *current* permissions, not
    // just what was true at enqueue time — a revoked role must still block
    // a job that was already queued.
    const owner = await prisma.user.findUnique({
      where: { id: job.userId },
      select: { id: true, role: true, organizationId: true },
    });
    if (!owner) throw new Error("Export owner no longer exists");
    await descriptor.authorize({ prisma, session: { user: owner } }, params);

    let latestProgress = job.progress;
    const onProgress = async (p: ExportProgress) => {
      // Row preparation is not the end of the export: workbook/PDF generation
      // and artifact persistence still remain. Reserve 100% for a downloadable
      // artifact so the UI never looks complete while generation is ongoing.
      latestProgress = p.total && p.total > 0
        ? Math.min(95, Math.round(((p.processed ?? 0) / p.total) * 100))
        : latestProgress;
      const progressUpdate = await prisma.exportJob.updateMany({
        where: { id, status: "RUNNING" },
        data: {
          ...(p.processed !== undefined ? { processed: p.processed } : {}),
          ...(p.total !== undefined ? { total: p.total } : {}),
          ...(p.stage !== undefined ? { stage: p.stage } : {}),
          progress: latestProgress,
        },
      });
      // Cancelling changes the status immediately. Builders report progress at
      // their natural checkpoints, so this also cooperatively stops expensive
      // row/card generation instead of continuing invisibly in the background.
      if (progressUpdate.count !== 1) throw new ExportCancelledError();
    };

    const artifact = await descriptor.build({ prisma }, params, job.format as any, onProgress);
    const stillRunning = await prisma.exportJob.findFirst({ where: { id, status: "RUNNING" }, select: { id: true } });
    if (!stillRunning) return;
    await artifactStore.put(id, artifact);

    const completed = await prisma.exportJob.updateMany({
      where: { id, status: "RUNNING" },
      data: { status: "DONE", progress: 100, stage: "Ready", completedAt: new Date() },
    });
    // Cancellation can race with artifact persistence. Never retain bytes for
    // a job that did not make the guarded RUNNING -> DONE transition.
    if (completed.count !== 1) await artifactStore.delete(id);
  } catch (error) {
    if (error instanceof ExportCancelledError) return;
    const attempts = job.attempts + 1;
    const backoffMinutes = Math.min(2 ** attempts, 30);
    const message = error instanceof Error ? error.message : String(error);
    await prisma.exportJob.updateMany({
      where: { id, status: "RUNNING" },
      data: {
        attempts,
        status: attempts >= MAX_ATTEMPTS ? "FAILED" : "QUEUED",
        error: message,
        errorHint: hintForError(message),
        runAfter: new Date(Date.now() + backoffMinutes * 60 * 1000),
      },
    });
  }
}

function hintForError(message: string): string | undefined {
  if (/timeout/i.test(message)) {
    return "The export took too long. Try narrowing the filters (e.g. by Campus or Tribe).";
  }
  if (/too large|max.*size|exceeds/i.test(message)) {
    return "This export exceeds the maximum size. Try exporting by Campus or Tribe.";
  }
  return undefined;
}

/** Resets a FAILED (or CANCELLED) job back to QUEUED and kicks it off again. */
export async function retryExportJob(id: string) {
  const reset = await prisma.exportJob.updateMany({
    where: { id, status: { in: ["FAILED", "CANCELLED"] } },
    data: {
      status: "QUEUED",
      attempts: 0,
      progress: 0,
      processed: null,
      total: null,
      stage: "Queued",
      error: null,
      errorHint: null,
      startedAt: null,
      completedAt: null,
      fileName: null,
      mimeType: null,
      fileSize: null,
      fileData: null,
      runAfter: new Date(),
    },
  });
  if (reset.count !== 1) return { retried: false };
  void processExportJob(id).catch((error) => {
    console.error(`[export] retry kick-off failed for job ${id}:`, error);
  });
  return { retried: true };
}

export async function cancelExportJob(id: string) {
  const result = await prisma.exportJob.updateMany({
    where: { id, status: { in: ["QUEUED", "RUNNING"] } },
    data: {
      status: "CANCELLED",
      stage: "Cancelled",
      error: null,
      errorHint: "Cancelled by you. You can retry this export at any time.",
      completedAt: new Date(),
    },
  });
  return { cancelled: result.count === 1 };
}

/**
 * Sweeps due, non-terminal jobs and reclaims RUNNING jobs whose process died
 * mid-generation. Intended to be hit by a cron/pinger every minute or so.
 */
export async function sweepPendingExportJobs(limit = 25) {
  const staleCutoff = new Date(Date.now() - STALE_RUNNING_MINUTES * 60 * 1000);
  const reclaimed = await prisma.exportJob.updateMany({
    where: { status: "RUNNING", startedAt: { lt: staleCutoff } },
    data: { status: "QUEUED", runAfter: new Date() },
  });

  const due = await prisma.exportJob.findMany({
    where: { status: "QUEUED", runAfter: { lte: new Date() } },
    take: limit,
    orderBy: { runAfter: "asc" },
  });
  for (const job of due) {
    await processExportJob(job.id);
  }
  return { processed: due.length, reclaimed: reclaimed.count };
}

/** Hard-deletes ExportJob rows past their expiresAt. Called from the trash purge sweep. */
export async function purgeExpiredExports() {
  const result = await prisma.exportJob.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return { purged: result.count };
}
