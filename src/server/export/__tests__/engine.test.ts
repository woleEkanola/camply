import { afterEach, afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { registerExport } from "../registry";
import type { ExportChunkOutcome, ExportDescriptor, ExportEnqueueParams, ExportPart } from "../types";

const prisma = new PrismaClient();

/**
 * No real BLOB_READ_WRITE_TOKEN exists locally or in CI, so every test that
 * touches the resumable/staged-part path needs blobStore's network calls
 * replaced with an in-memory store. partStore.ts and artifactStore.ts both
 * import blobStore.ts by the same relative specifier, so this one mock
 * covers the whole chain engine.ts exercises them through.
 */
const blobFixtureStore = new Map<string, Buffer>();
let blobCounter = 0;
vi.mock("../blobStore", () => ({
  uploadBlob: vi.fn(async (jobId: string, data: Buffer) => {
    const url = `mock-blob://${jobId}/${blobCounter++}`;
    blobFixtureStore.set(url, data);
    return { url, size: data.byteLength };
  }),
  fetchBlob: vi.fn(async (url: string) => {
    const data = blobFixtureStore.get(url);
    if (!data) throw new Error(`mock blob not found: ${url}`);
    return data;
  }),
  streamBlob: vi.fn(async (url: string) => {
    const data = blobFixtureStore.get(url);
    if (!data) throw new Error(`mock blob not found: ${url}`);
    return {
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(data));
          controller.close();
        },
      }),
      contentLength: data.byteLength,
    };
  }),
  deleteBlob: vi.fn(async (url: string) => {
    blobFixtureStore.delete(url);
  }),
  deleteBlobs: vi.fn(async (urls: string[]) => {
    for (const url of urls) blobFixtureStore.delete(url);
  }),
  hasRealBlobToken: vi.fn(() => true),
}));

let orgId: string;
let adminId: string;

// A stub descriptor registered under the TEMPLATE kind (not yet given a real
// builder — see backlog.md Phase 5) so this suite exercises engine.ts's
// state machine without depending on any concrete builder module.
let authorizeSpy: ReturnType<typeof vi.fn>;
let buildSpy: ReturnType<typeof vi.fn>;

function makeStubDescriptor(): ExportDescriptor<any> {
  authorizeSpy = vi.fn(async (_ctx, params: ExportEnqueueParams) => {
    if (params.filters?.forbid) throw new Error("FORBIDDEN in test stub");
  });
  buildSpy = vi.fn(async (_ctx, params: ExportEnqueueParams, _format, onProgress) => {
    if (params.filters?.fail) throw new Error("Simulated build failure: timeout");
    await onProgress({ processed: 1, total: 2, stage: "Working…" });
    if (params.filters?.cancelMidBuild) {
      const running = await prisma.exportJob.findFirstOrThrow({
        where: { organizationId: params.organizationId, status: "RUNNING" },
        orderBy: { createdAt: "desc" },
      });
      const { cancelExportJob } = await import("../engine");
      await cancelExportJob(running.id);
    }
    await onProgress({ processed: 2, total: 2, stage: "Done" });
    return { fileName: "test.csv", mimeType: "text/csv", data: Buffer.from("a,b\n1,2\n") };
  });
  return {
    kind: "TEMPLATE",
    label: "Stub",
    formats: ["CSV"],
    presets: [],
    filterSchema: { parse: (v: unknown) => v } as any,
    authorize: authorizeSpy as any,
    count: vi.fn(async () => 1),
    build: buildSpy as any,
    fileName: () => "test.csv",
  };
}

beforeAll(async () => {
  const org = await prisma.organization.create({ data: { name: `ExportTest Org ${Date.now()}-${Math.random()}` } });
  orgId = org.id;
  const admin = await prisma.user.create({
    data: {
      email: `export-test-admin-${Date.now()}@camply.test`,
      password: "x",
      role: "ADMIN",
      organizationId: orgId,
    },
  });
  adminId = admin.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

beforeEach(() => {
  registerExport(makeStubDescriptor());
});

afterEach(async () => {
  await prisma.exportJob.deleteMany({ where: { organizationId: orgId } });
});

const baseParams: ExportEnqueueParams = {
  organizationId: "",
  kind: "TEMPLATE",
  format: "CSV",
  scope: "ALL",
  filters: {},
};

describe("enqueueExportJob / processExportJob", () => {
  it("authorizes, runs the un-awaited kick-off, and reaches DONE with the artifact persisted", async () => {
    const { enqueueExportJob } = await import("../engine");
    const params = { ...baseParams, organizationId: orgId };
    const job = await enqueueExportJob({ prisma, session: { user: { id: adminId, role: "ADMIN", organizationId: orgId } } }, params, "Test export");

    // enqueueExportJob fires processExportJob un-awaited; poll briefly.
    let final = await prisma.exportJob.findUniqueOrThrow({ where: { id: job.id } });
    for (let i = 0; i < 20 && final.status !== "DONE" && final.status !== "FAILED"; i++) {
      await new Promise((r) => setTimeout(r, 25));
      final = await prisma.exportJob.findUniqueOrThrow({ where: { id: job.id } });
    }

    expect(final.status).toBe("DONE");
    expect(final.progress).toBe(100);
    expect(final.fileData).not.toBeNull();
    expect(final.fileName).toBe("test.csv");
    expect(final.processed).toBe(2);
    expect(final.total).toBe(2);
  });

  it("rejects enqueue when authorize() throws, without creating a job row", async () => {
    const { enqueueExportJob } = await import("../engine");
    const params = { ...baseParams, organizationId: orgId, filters: { forbid: true } };
    await expect(
      enqueueExportJob({ prisma, session: { user: { id: adminId, role: "ADMIN", organizationId: orgId } } }, params, "Forbidden export")
    ).rejects.toThrow();

    const count = await prisma.exportJob.count({ where: { organizationId: orgId } });
    expect(count).toBe(0);
  });

  it("re-checks authorization against the owner's current role at process time", async () => {
    const { processExportJob } = await import("../engine");
    const job = await prisma.exportJob.create({
      data: {
        organizationId: orgId,
        userId: adminId,
        kind: "TEMPLATE",
        format: "CSV",
        label: "Direct job",
        params: { ...baseParams, organizationId: orgId, filters: { forbid: true } } as any,
        status: "QUEUED",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await processExportJob(job.id);

    const final = await prisma.exportJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(final.status).toBe("QUEUED"); // attempt 1 of MAX_ATTEMPTS=3, backed off
    expect(final.attempts).toBe(1);
    expect(final.error).toContain("FORBIDDEN");
  });

  it("moves to FAILED only after exhausting MAX_ATTEMPTS, with a size/timeout hint surfaced", async () => {
    const { processExportJob } = await import("../engine");
    const job = await prisma.exportJob.create({
      data: {
        organizationId: orgId,
        userId: adminId,
        kind: "TEMPLATE",
        format: "CSV",
        label: "Failing job",
        params: { ...baseParams, organizationId: orgId, filters: { fail: true } } as any,
        status: "QUEUED",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    // MAX_ATTEMPTS is 3 — run the processor directly three times to exhaust it
    // without waiting on the real backoff delay.
    for (let i = 0; i < 3; i++) {
      await prisma.exportJob.update({ where: { id: job.id }, data: { status: "QUEUED", runAfter: new Date() } });
      await processExportJob(job.id);
    }

    const final = await prisma.exportJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(final.status).toBe("FAILED");
    expect(final.attempts).toBe(3);
    expect(final.errorHint).toMatch(/Campus or Tribe/);
  });

  it("processExportJob is a no-op for a job already DONE or CANCELLED", async () => {
    const { processExportJob } = await import("../engine");
    const doneJob = await prisma.exportJob.create({
      data: {
        organizationId: orgId,
        userId: adminId,
        kind: "TEMPLATE",
        format: "CSV",
        label: "Already done",
        params: { ...baseParams, organizationId: orgId } as any,
        status: "DONE",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await processExportJob(doneJob.id);
    expect(buildSpy).not.toHaveBeenCalled();
  });
});

describe("cancellation", () => {
  it("stops at the next progress checkpoint when a running export is cancelled", async () => {
    const { enqueueExportJob } = await import("../engine");
    const params = { ...baseParams, organizationId: orgId, filters: { cancelMidBuild: true } };
    const job = await enqueueExportJob(
      { prisma, session: { user: { id: adminId, role: "ADMIN", organizationId: orgId } } },
      params,
      "Cancelled during build",
    );

    let row = await prisma.exportJob.findUniqueOrThrow({ where: { id: job.id } });
    for (let i = 0; i < 20 && row.status !== "CANCELLED"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      row = await prisma.exportJob.findUniqueOrThrow({ where: { id: job.id } });
    }

    expect(row.status).toBe("CANCELLED");
    expect(row.stage).toBe("Cancelled");
    expect(row.errorHint).toMatch(/retry/i);
    expect(row.completedAt).not.toBeNull();
    expect(row.fileData).toBeNull();
  });

  it("cancels only active jobs and reports when a job already finished", async () => {
    const { cancelExportJob } = await import("../engine");
    const running = await prisma.exportJob.create({
      data: {
        organizationId: orgId,
        userId: adminId,
        kind: "TEMPLATE",
        format: "CSV",
        label: "Running",
        params: { ...baseParams, organizationId: orgId } as any,
        status: "RUNNING",
        progress: 95,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const done = await prisma.exportJob.create({
      data: {
        organizationId: orgId,
        userId: adminId,
        kind: "TEMPLATE",
        format: "CSV",
        label: "Done",
        params: { ...baseParams, organizationId: orgId } as any,
        status: "DONE",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await expect(cancelExportJob(running.id)).resolves.toEqual({ cancelled: true });
    await expect(cancelExportJob(done.id)).resolves.toEqual({ cancelled: false });
    expect((await prisma.exportJob.findUniqueOrThrow({ where: { id: running.id } })).status).toBe("CANCELLED");
    expect((await prisma.exportJob.findUniqueOrThrow({ where: { id: done.id } })).status).toBe("DONE");
  });
});

describe("retryExportJob", () => {
  it("resets a FAILED job back to QUEUED and clears the error", async () => {
    const { retryExportJob } = await import("../engine");
    const job = await prisma.exportJob.create({
      data: {
        organizationId: orgId,
        userId: adminId,
        kind: "TEMPLATE",
        format: "CSV",
        label: "Retryable",
        params: { ...baseParams, organizationId: orgId } as any,
        status: "FAILED",
        attempts: 3,
        error: "boom",
        errorHint: "hint",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await retryExportJob(job.id);
    let row = await prisma.exportJob.findUniqueOrThrow({ where: { id: job.id } });
    // retryExportJob also fires processExportJob un-awaited; poll for it to settle.
    for (let i = 0; i < 20 && row.status === "QUEUED"; i++) {
      await new Promise((r) => setTimeout(r, 25));
      row = await prisma.exportJob.findUniqueOrThrow({ where: { id: job.id } });
    }
    expect(row.attempts === 0 || row.status === "DONE").toBe(true);
  });
});

describe("sweepPendingExportJobs", () => {
  /**
   * @updatedAt is normally auto-set, but Prisma's typed client does honour an
   * explicit value passed in `data` — unlike a raw `$executeRaw` write of a
   * JS `Date` into this timestamp(3)-without-timezone column, which was
   * verified (while writing this test) to round-trip an hour off on this
   * machine's Postgres setup. Worth knowing for any other raw-SQL DateTime
   * write in this codebase — CLAUDE.md's existing raw-query timezone caveat
   * only calls out `@db.Date` columns via `$queryRawUnsafe`; this is the
   * same class of bug via a different query method against a different
   * column type.
   */
  async function backdateUpdatedAt(id: string, minutesAgo: number) {
    await prisma.exportJob.update({ where: { id }, data: { updatedAt: new Date(Date.now() - minutesAgo * 60 * 1000) } });
  }

  it("reclaims a RUNNING job that has stopped reporting progress for more than 10 minutes", async () => {
    const { sweepPendingExportJobs } = await import("../engine");
    const staleRunning = await prisma.exportJob.create({
      data: {
        organizationId: orgId,
        userId: adminId,
        kind: "TEMPLATE",
        format: "CSV",
        label: "Stale",
        params: { ...baseParams, organizationId: orgId } as any,
        status: "RUNNING",
        startedAt: new Date(Date.now() - 15 * 60 * 1000),
        runAfter: new Date(Date.now() + 60 * 60 * 1000), // not due — reclamation must not depend on runAfter
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await backdateUpdatedAt(staleRunning.id, 15);

    const result = await sweepPendingExportJobs();
    expect(result.reclaimed).toBeGreaterThanOrEqual(1);

    const row = await prisma.exportJob.findUniqueOrThrow({ where: { id: staleRunning.id } });
    expect(row.status === "QUEUED" || row.status === "DONE" || row.status === "FAILED").toBe(true);
    expect(row.attempts).toBeGreaterThanOrEqual(1);
  });

  it("does NOT reclaim a job with an old startedAt but a fresh updatedAt", async () => {
    // The regression this covers: the reclaim used to key on startedAt, so a
    // genuinely live long-running job (progress checkpointed throughout, so
    // updatedAt stays fresh) got reclaimed anyway — and the same sweep call
    // immediately re-picked up what it had just reclaimed, running a second
    // concurrent render of the same rows every ~10 minutes.
    const { sweepPendingExportJobs } = await import("../engine");
    const stillWorking = await prisma.exportJob.create({
      data: {
        organizationId: orgId,
        userId: adminId,
        kind: "TEMPLATE",
        format: "CSV",
        label: "Long-running but alive",
        params: { ...baseParams, organizationId: orgId } as any,
        status: "RUNNING",
        startedAt: new Date(Date.now() - 20 * 60 * 1000), // started 20 minutes ago
        runAfter: new Date(Date.now() + 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    // updatedAt defaults to "now" at create() — deliberately left fresh.

    const result = await sweepPendingExportJobs();
    expect(result.reclaimed).toBe(0);

    const row = await prisma.exportJob.findUniqueOrThrow({ where: { id: stillWorking.id } });
    expect(row.status).toBe("RUNNING");
    expect(row.attempts).toBe(0);
  });

  it("increments attempts on each reclaim and reaches FAILED after MAX_ATTEMPTS, without ever calling the descriptor's build", async () => {
    const { sweepPendingExportJobs } = await import("../engine");
    const stuck = await prisma.exportJob.create({
      data: {
        organizationId: orgId,
        userId: adminId,
        kind: "TEMPLATE",
        format: "CSV",
        label: "Stuck forever",
        params: { ...baseParams, organizationId: orgId } as any,
        status: "RUNNING",
        attempts: 2, // one reclaim away from MAX_ATTEMPTS (3)
        startedAt: new Date(Date.now() - 15 * 60 * 1000),
        runAfter: new Date(Date.now() + 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await backdateUpdatedAt(stuck.id, 15);

    await sweepPendingExportJobs();

    const row = await prisma.exportJob.findUniqueOrThrow({ where: { id: stuck.id } });
    expect(row.status).toBe("FAILED");
    expect(row.attempts).toBe(3);
    expect(row.error).toMatch(/stopped making progress/i);
  });

  it("does not touch a QUEUED job whose runAfter is still in the future", async () => {
    const { sweepPendingExportJobs } = await import("../engine");
    const notDue = await prisma.exportJob.create({
      data: {
        organizationId: orgId,
        userId: adminId,
        kind: "TEMPLATE",
        format: "CSV",
        label: "Not due",
        params: { ...baseParams, organizationId: orgId, filters: { fail: true } } as any,
        status: "QUEUED",
        runAfter: new Date(Date.now() + 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await sweepPendingExportJobs();
    const row = await prisma.exportJob.findUniqueOrThrow({ where: { id: notDue.id } });
    expect(row.status).toBe("QUEUED");
    expect(row.attempts).toBe(0);
  });
});

describe("resumable builds (buildChunk)", () => {
  /**
   * Registers a chunked stub under TEMPLATE, overriding the plain-build stub
   * the outer beforeEach registers — registerExport (registry.ts) keys by
   * `kind`, so the later registration for this describe block's tests wins.
   * Each call consumes exactly one "row" and stages a tiny fake PDF part,
   * mirroring the real contract idCards.ts's buildIdCardChunk fulfils:
   * forward progress every call, a durable part staged before returning.
   */
  let chunkCalls: number;
  function makeChunkedStub(totalRows: number) {
    chunkCalls = 0;
    const buildChunk = vi.fn(
      async (ctx: any, _params: ExportEnqueueParams, _format: any, resumeIndex: number, _deadline: number, onProgress: any): Promise<ExportChunkOutcome> => {
        chunkCalls++;
        const nextIndex = resumeIndex + 1;
        await onProgress({ processed: nextIndex, total: totalRows, stage: "Rendering…" });
        const part: ExportPart = await ctx.stagePart(Buffer.from(`part-${nextIndex}`), {
          fileName: "test.pdf",
          mimeType: "application/pdf",
          cardCount: 1,
          sheetCount: 1,
        });
        return { done: nextIndex >= totalRows, resumeIndex: nextIndex, part };
      }
    );
    const descriptor: ExportDescriptor<any> = {
      kind: "TEMPLATE",
      label: "Chunked stub",
      formats: ["PDF"],
      presets: [],
      filterSchema: { parse: (v: unknown) => v } as any,
      authorize: vi.fn(async () => {}) as any,
      count: vi.fn(async () => totalRows),
      buildChunk: buildChunk as any,
      fileName: () => "test.pdf",
    };
    registerExport(descriptor);
    return { buildChunk };
  }

  async function createQueuedJob(kind = "TEMPLATE") {
    return prisma.exportJob.create({
      data: {
        organizationId: orgId,
        userId: adminId,
        kind: kind as any,
        format: "PDF",
        label: "Chunked job",
        params: { ...baseParams, organizationId: orgId, format: "PDF" } as any,
        status: "QUEUED",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
  }

  afterEach(async () => {
    const { __testing__ } = await import("../engine");
    __testing__.resetResumableLoopBudgetMs();
  });

  it("spans multiple invocations (processExportJob, then sweepPendingExportJobs resuming) without losing, skipping, or duplicating chunks", async () => {
    makeChunkedStub(3);
    const { processExportJob, sweepPendingExportJobs, __testing__ } = await import("../engine");
    // Forces runResumableBuild to stop after exactly one chunk per call,
    // simulating "this invocation's time budget ran out" deterministically
    // instead of depending on real wall-clock time.
    __testing__.setResumableLoopBudgetMs(0);

    const job = await createQueuedJob();

    // First invocation: the normal QUEUED->RUNNING claim.
    await processExportJob(job.id);
    let row = await prisma.exportJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.status).toBe("RUNNING");
    expect(row.resumeIndex).toBe(1);
    expect((row.partRefs as any[]).length).toBe(1);

    // Second and third invocations: this job is RUNNING now, not QUEUED — the
    // only path that can continue it is the sweep's resume-RUNNING-jobs
    // branch, exactly as in production (see enqueueExportJob's comment on
    // why the request-triggered kick alone can't be relied on).
    await sweepPendingExportJobs();
    row = await prisma.exportJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.status).toBe("RUNNING");
    expect(row.resumeIndex).toBe(2);
    expect((row.partRefs as any[]).length).toBe(2);

    await sweepPendingExportJobs();
    row = await prisma.exportJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(chunkCalls).toBe(3);
    expect(row.resumeIndex).toBe(3);
    expect(row.status).toBe("DONE"); // 3rd chunk completed the job
  });

  it("promotes a job that only ever staged one part to a plain single-file artifact", async () => {
    makeChunkedStub(1);
    const { processExportJob } = await import("../engine");
    const job = await createQueuedJob();

    await processExportJob(job.id);

    const row = await prisma.exportJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.status).toBe("DONE");
    expect(row.fileName).toBe("test.pdf");
    expect(row.fileData).not.toBeNull(); // small artifact — bytea path, not blob
    expect((row.partRefs as any[]).length).toBe(0); // staged part cleared after promotion
  });

  it("exposes multiple staged parts, unpromoted, for a job that never collapses to one part", async () => {
    makeChunkedStub(3);
    const { processExportJob } = await import("../engine");
    const job = await createQueuedJob();

    await processExportJob(job.id); // runs to completion in one call — real deadline is generous

    const row = await prisma.exportJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.status).toBe("DONE");
    const parts = row.partRefs as any[];
    expect(parts.length).toBe(3);
    expect(parts.map((p) => p.partNumber)).toEqual([1, 2, 3]);
    // Never promoted — no plain fileData/fileName for a genuinely multi-part job.
    expect(row.fileData).toBeNull();
    expect(row.fileName).toBeNull();
  });

  it("stops checkpointing once the job is cancelled mid-build", async () => {
    const { buildChunk } = makeChunkedStub(5);
    const { processExportJob, cancelExportJob } = await import("../engine");
    const job = await createQueuedJob();

    buildChunk.mockImplementationOnce(async (ctx: any, _p: any, _f: any, resumeIndex: number, _d: number, onProgress: any) => {
      await onProgress({ processed: 1, total: 5, stage: "Rendering…" });
      await cancelExportJob(job.id); // simulates the user cancelling while this chunk was in flight
      const part = await ctx.stagePart(Buffer.from("part-1"), { fileName: "test.pdf", mimeType: "application/pdf", cardCount: 1, sheetCount: 1 });
      return { done: false, resumeIndex: resumeIndex + 1, part };
    });

    await processExportJob(job.id);

    const row = await prisma.exportJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.status).toBe("CANCELLED");
    expect(buildChunk).toHaveBeenCalledTimes(1); // the loop did not continue past the cancellation
  });
});

describe("purgeExpiredExports", () => {
  it("hard-deletes jobs past their expiresAt and leaves unexpired jobs alone", async () => {
    const { purgeExpiredExports } = await import("../engine");
    const expired = await prisma.exportJob.create({
      data: {
        organizationId: orgId,
        userId: adminId,
        kind: "TEMPLATE",
        format: "CSV",
        label: "Expired",
        params: { ...baseParams, organizationId: orgId } as any,
        status: "DONE",
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const fresh = await prisma.exportJob.create({
      data: {
        organizationId: orgId,
        userId: adminId,
        kind: "TEMPLATE",
        format: "CSV",
        label: "Fresh",
        params: { ...baseParams, organizationId: orgId } as any,
        status: "DONE",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const result = await purgeExpiredExports();
    expect(result.purged).toBeGreaterThanOrEqual(1);

    expect(await prisma.exportJob.findUnique({ where: { id: expired.id } })).toBeNull();
    expect(await prisma.exportJob.findUnique({ where: { id: fresh.id } })).not.toBeNull();
  });
});

describe("artifactStore storage routing", () => {
  it("stores artifacts in Postgres bytea (fileData) when under 30MB or when Blob token is missing", async () => {
    const { artifactStore } = await import("../artifactStore");
    const { hasRealBlobToken } = await import("../blobStore");

    const job = await prisma.exportJob.create({
      data: {
        organizationId: orgId,
        userId: adminId,
        kind: "TEMPLATE",
        format: "PDF",
        label: "Medium PDF Export",
        params: { ...baseParams, organizationId: orgId } as any,
        status: "RUNNING",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    // 10MB data (under 30MB) with hasRealBlobToken = true
    const tenMbBuffer = Buffer.alloc(10 * 1024 * 1024, "a");
    await artifactStore.put(job.id, { fileName: "10mb.pdf", mimeType: "application/pdf", data: tenMbBuffer });

    let row = await prisma.exportJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.fileData).not.toBeNull();
    expect(row.blobKey).toBeNull();
    expect(row.fileSize).toBe(tenMbBuffer.byteLength);

    // When hasRealBlobToken is false, even large files stay in bytea rather than writing invalid local-blob URLs
    vi.mocked(hasRealBlobToken).mockReturnValueOnce(false);
    const thirtyFiveMbBuffer = Buffer.alloc(35 * 1024 * 1024, "b");
    await artifactStore.put(job.id, { fileName: "35mb.pdf", mimeType: "application/pdf", data: thirtyFiveMbBuffer });

    row = await prisma.exportJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.fileData).not.toBeNull();
    expect(row.blobKey).toBeNull();
    expect(row.fileSize).toBe(thirtyFiveMbBuffer.byteLength);
  });
});

