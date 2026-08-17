import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { artifactStore } from "./artifactStore";
import { fetchBlob } from "./blobStore";
import { getPartRefs, stagePart, deletePartBlobs } from "./partStore";
import { getExportDescriptor } from "./registry";
import type { ExportEnqueueParams, ExportProgress } from "./types";
import "./builders";

const MAX_ATTEMPTS = 3;
const EXPORT_TTL_HOURS = 24;
// A job is only ever reclaimed while it has stopped reporting progress, not
// merely because it has run for a while — see sweepPendingExportJobs. 10
// minutes gives a genuinely slow chunk (see idCards.ts's PART_SIZE_CARDS
// comment) ample room without leaving a truly dead job stuck for too long.
const STALE_RUNNING_MINUTES = 10;
// Leaves margin inside a single Vercel function invocation (maxDuration=300s
// on the cron routes that drive this) so a resumable build that hits this
// budget still returns, persists its progress, and lets the caller decide
// whether to continue — mirrors SWEEP_WALL_CLOCK_BUDGET_MS in
// src/server/registration/effects.ts.
const CHUNK_BUDGET_MS = 240_000;
// Overall budget for one processExportJob call's resumable loop, so it
// can't itself run past the function's own maxDuration even if every
// individual buildChunk call finishes quickly. Mutable (not const) so tests
// can force "this invocation stops after exactly one chunk" deterministically
// without waiting on real wall-clock time — see __testing__ below, mirroring
// the pattern in src/server/email/campaign/sender.ts's __testing__ export.
const DEFAULT_RESUMABLE_LOOP_BUDGET_MS = 260_000;
let resumableLoopBudgetMs = DEFAULT_RESUMABLE_LOOP_BUDGET_MS;

class ExportCancelledError extends Error {
  constructor() {
    super("Export cancelled");
    this.name = "ExportCancelledError";
  }
}

/**
 * Creates the job row, authorizes it against the caller, and fires off
 * generation immediately (un-awaited) so a normal export starts within
 * milliseconds when the process happens to survive long enough. This is a
 * latency optimization, not the correctness mechanism — production runs on
 * Vercel, where the function backing this request can be frozen or reclaimed
 * the instant the response is sent, killing an in-flight render at an
 * arbitrary point. `sweepPendingExportJobs` (wired to run every minute via
 * vercel.json) is what actually guarantees a job completes: it resumes any
 * job that didn't finish in its own request, using the durable
 * resumeIndex/partRefs state a resumable builder persists after every chunk.
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
  await runJob(job);
}

/**
 * Continues a resumable job that is already RUNNING — the state a job is
 * left in when a previous `processExportJob` call returned because its own
 * resumable-loop budget ran out, not because it finished or crashed. Only
 * ever called from `sweepPendingExportJobs`'s advisory-lock-protected
 * section: outside that lock there is no way to be sure a second
 * `processExportJob`-style entry point isn't racing this same row (the
 * QUEUED->RUNNING claim in `processExportJob` above is what makes *that*
 * path safe without a lock; a RUNNING row has no equivalent atomic claim of
 * its own, so the lock is what takes its place here).
 */
async function resumeRunningJob(id: string) {
  const job = await prisma.exportJob.findUnique({ where: { id, status: "RUNNING" } });
  if (!job) return;
  await runJob(job);
}

async function runJob(job: Awaited<ReturnType<typeof prisma.exportJob.findUniqueOrThrow>>) {
  const id = job.id;
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

    if (descriptor.buildChunk) {
      await runResumableBuild(descriptor, job, params, onProgress);
    } else {
      if (!descriptor.build) throw new Error(`Export kind ${job.kind} defines neither build() nor buildChunk()`);
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
    }
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

/**
 * Drives a `buildChunk`-based export to completion or until this
 * invocation's overall budget runs out. Each `buildChunk` call renders at
 * least one sub-batch (the builder's own responsibility — see
 * idCards.ts's SUB_BATCH_SIZE) and stages it as a durable part *before*
 * returning, so `resumeIndex`/`partRefs` persisted right after the call
 * reflect real, retrievable bytes — never in-memory-only progress that a
 * killed process would lose.
 *
 * Self-continues in-process (mirroring
 * src/server/registration/effects.ts's sweepPendingSideEffects) so a job
 * that fits inside one function's time budget completes in a single
 * processExportJob call without waiting on the next cron tick. A job that
 * doesn't fit simply returns with status still RUNNING and progress
 * recorded — the next sweep tick resumes it exactly where it left off.
 */
async function runResumableBuild(
  descriptor: ReturnType<typeof getExportDescriptor>,
  job: { id: string; resumeIndex: number | null },
  params: ExportEnqueueParams,
  onProgress: (p: ExportProgress) => Promise<void>
) {
  const id = job.id;
  const loopDeadline = Date.now() + resumableLoopBudgetMs;
  let resumeIndex = job.resumeIndex ?? 0;

  const ctx = {
    prisma,
    jobId: id,
    stagePart: (data: Buffer, meta: { fileName: string; mimeType: string; cardCount: number; sheetCount: number }) =>
      stagePart(id, data, meta),
  };

  while (true) {
    const stillRunning = await prisma.exportJob.findFirst({ where: { id, status: "RUNNING" }, select: { id: true } });
    if (!stillRunning) return;

    const chunkDeadline = Math.min(Date.now() + CHUNK_BUDGET_MS, loopDeadline);
    const outcome = await descriptor.buildChunk!(ctx, params, params.format, resumeIndex, chunkDeadline, onProgress);
    resumeIndex = outcome.resumeIndex;

    // Persist immediately — this is the checkpoint the reclaim/retry logic
    // depends on. A process killed one line after this returns has already
    // lost nothing: the part is uploaded, and resumeIndex says so.
    const checkpointed = await prisma.exportJob.updateMany({
      where: { id, status: "RUNNING" },
      data: { resumeIndex },
    });
    if (checkpointed.count !== 1) return; // cancelled mid-chunk

    if (!outcome.done) {
      if (Date.now() >= loopDeadline) return; // let the next sweep tick continue
      continue;
    }

    await finalizeResumableJob(id);
    return;
  }
}

/**
 * A finished resumable job's deliverable is either a single promoted
 * artifact (exactly one part was ever staged — the common case, a plain
 * download indistinguishable from any other export) or the staged parts
 * list itself (a genuinely large export). Decided here, once, rather than
 * asking every builder to know about promotion.
 */
async function finalizeResumableJob(id: string) {
  const job = await prisma.exportJob.findUniqueOrThrow({ where: { id }, select: { partRefs: true, fileName: true } });
  const parts = getPartRefs(job);

  if (parts.length === 1) {
    const only = parts[0];
    const data = await fetchBlob(only.blobKey);
    await artifactStore.put(id, { fileName: job.fileName ?? only.fileName, mimeType: only.mimeType, data });
    await deletePartBlobs(job);
    const completed = await prisma.exportJob.updateMany({
      where: { id, status: "RUNNING" },
      data: { status: "DONE", progress: 100, stage: "Ready", completedAt: new Date(), partRefs: [] },
    });
    if (completed.count !== 1) await artifactStore.delete(id);
    return;
  }

  // Multiple parts: nothing more to build. The parts are already durably
  // stored; the download route serves them by index.
  const completed = await prisma.exportJob.updateMany({
    where: { id, status: "RUNNING" },
    data: { status: "DONE", progress: 100, stage: "Ready", completedAt: new Date() },
  });
  if (completed.count !== 1) await deletePartBlobs(job);
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
  const existing = await prisma.exportJob.findUnique({ where: { id }, select: { partRefs: true } });
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
      blobKey: null,
      resumeIndex: null,
      partRefs: Prisma.JsonNull,
      runAfter: new Date(),
    },
  });
  if (reset.count !== 1) return { retried: false };
  // Any parts staged before the failure/cancellation are orphaned by the
  // reset above (resumeIndex/partRefs both cleared) — clean them up so a
  // retry doesn't leak blob storage for work that will be re-rendered.
  if (existing) await deletePartBlobs(existing);
  await artifactStore.delete(id);
  void processExportJob(id).catch((error) => {
    console.error(`[export] retry kick-off failed for job ${id}:`, error);
  });
  return { retried: true };
}

export async function cancelExportJob(id: string) {
  const existing = await prisma.exportJob.findUnique({ where: { id }, select: { partRefs: true } });
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
  if (result.count === 1 && existing) await deletePartBlobs(existing);
  return { cancelled: result.count === 1 };
}

// Arbitrary constant identifying this sweep's Postgres advisory lock —
// unique within the app (see the SIDE_EFFECT sweep's own SWEEP_LOCK_KEY in
// src/server/registration/effects.ts, which this deliberately does not
// collide with), never reused for anything else.
const SWEEP_LOCK_KEY = 501_774_223;

/**
 * Sweeps due, non-terminal jobs; resumes RUNNING jobs that returned early
 * because their own budget ran out (see runResumableBuild); and reclaims
 * RUNNING jobs whose process died mid-generation. This is load-bearing, not
 * a backstop: production runs on Vercel, so every export beyond what fits in
 * one request's lifetime depends on this actually running — see
 * enqueueExportJob's comment. Scheduled every minute via vercel.json.
 *
 * Serialized by a Postgres advisory lock, same technique as
 * sweepPendingSideEffects in src/server/registration/effects.ts and for the
 * same reason: Vercel Cron can fire the next tick before a slow previous
 * invocation has returned (a resumable build's own budget can run up to
 * ~260s, longer than the 60s tick interval), and a RUNNING job has no atomic
 * per-job claim of its own the way a QUEUED job does — the lock is what
 * makes it safe to hand a RUNNING job to processExportJob's "resume" path
 * (resumeRunningJob) without two overlapping sweeps racing on the same row.
 * A losing caller returns immediately rather than queueing behind the
 * winner, matching sweepPendingSideEffects's non-blocking design.
 */
export async function sweepPendingExportJobs(limit = 25) {
  const result = await prisma.$transaction(
    async (tx) => {
      const lockRows = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(${SWEEP_LOCK_KEY}) AS locked`;
      if (!lockRows[0]?.locked) return { processed: 0, reclaimed: 0, skipped: true as const };
      try {
        return { ...(await runExportSweep(limit)), skipped: false as const };
      } finally {
        await tx.$queryRaw`SELECT pg_advisory_unlock(${SWEEP_LOCK_KEY})`;
      }
    },
    { timeout: 60_000, maxWait: 10_000 }
  );
  return result;
}

async function runExportSweep(limit: number) {
  const staleCutoff = new Date(Date.now() - STALE_RUNNING_MINUTES * 60 * 1000);
  const runningJobs = await prisma.exportJob.findMany({
    where: { status: "RUNNING" },
    select: { id: true, kind: true, attempts: true, updatedAt: true },
  });

  let reclaimed = 0;
  const resumable: { id: string }[] = [];
  for (const job of runningJobs) {
    if (job.updatedAt < staleCutoff) {
      // Stopped reporting progress — either genuinely dead, or (far less
      // likely, given the loop budget is well under this 10-minute window)
      // a single chunk that's taking unusually long. Reclaimed unconditionally
      // rather than resumed, so a job stuck for this long doesn't camp on the
      // sweep's per-tick time budget indefinitely.
      const attempts = job.attempts + 1;
      const reclaimResult = await prisma.exportJob.updateMany({
        where: { id: job.id, status: "RUNNING", updatedAt: { lt: staleCutoff } },
        data: attempts >= MAX_ATTEMPTS
          ? { status: "FAILED", attempts, error: "Export stopped making progress and was not resumed in time.", errorHint: "This may be a large export — try narrowing the filters (e.g. by Campus or Tribe) and retry." }
          : { status: "QUEUED", attempts, runAfter: new Date(), stage: "Resumed after an interruption…" },
      });
      reclaimed += reclaimResult.count;
      continue;
    }
    // Fresh updatedAt: a previous invocation checkpointed real progress and
    // returned normally (its own budget ran out), or this job is between
    // chunks of the very sweep call currently running — either way, safe to
    // hand to resumeRunningJob only for kinds whose builder actually supports
    // being resumed; anything else staying RUNNING with a fresh updatedAt is
    // mid-flight in a `build()` call that owns this row exclusively already.
    try {
      if (getExportDescriptor(job.kind as any).buildChunk) resumable.push({ id: job.id });
    } catch {
      // Unknown kind (shouldn't happen) — leave it for the stale reclaim path.
    }
  }

  const sweepDeadline = Date.now() + 45_000; // leaves margin inside a one-minute cron tick
  const due = await prisma.exportJob.findMany({
    where: { status: "QUEUED", runAfter: { lte: new Date() } },
    take: limit,
    orderBy: { runAfter: "asc" },
  });

  let processedCount = 0;
  for (const dueJob of due) {
    if (Date.now() >= sweepDeadline) return { processed: processedCount, reclaimed };
    await processExportJob(dueJob.id);
    processedCount++;
  }
  for (const job of resumable) {
    if (Date.now() >= sweepDeadline) break;
    await resumeRunningJob(job.id);
    processedCount++;
  }
  return { processed: processedCount, reclaimed };
}

/** Deletes a job the user dismissed, cleaning up any blob storage it holds — mirrors what purgeExpiredExports does on expiry. */
export async function deleteExportJob(id: string) {
  const job = await prisma.exportJob.findUnique({ where: { id }, select: { blobKey: true, partRefs: true } });
  if (job?.blobKey) await deleteBlobFor(job.blobKey);
  if (job) await deletePartBlobs(job);
  await prisma.exportJob.delete({ where: { id } });
}

/** Hard-deletes ExportJob rows past their expiresAt, and any blob storage they hold. */
export async function purgeExpiredExports() {
  const expired = await prisma.exportJob.findMany({
    where: { expiresAt: { lt: new Date() } },
    select: { id: true, blobKey: true, partRefs: true },
  });
  for (const job of expired) {
    if (job.blobKey) await deleteBlobFor(job.blobKey);
    await deletePartBlobs(job);
  }
  const result = await prisma.exportJob.deleteMany({ where: { id: { in: expired.map((j) => j.id) } } });
  return { purged: result.count };
}

async function deleteBlobFor(url: string) {
  const { deleteBlob } = await import("./blobStore");
  await deleteBlob(url);
}

export const __testing__ = {
  setResumableLoopBudgetMs: (ms: number) => { resumableLoopBudgetMs = ms; },
  resetResumableLoopBudgetMs: () => { resumableLoopBudgetMs = DEFAULT_RESUMABLE_LOOP_BUDGET_MS; },
};
