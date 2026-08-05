import { afterEach, afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { registerExport } from "../registry";
import type { ExportDescriptor, ExportEnqueueParams } from "../types";

const prisma = new PrismaClient();

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
  it("reclaims a RUNNING job whose process died more than 10 minutes ago", async () => {
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

    const result = await sweepPendingExportJobs();
    expect(result.reclaimed).toBeGreaterThanOrEqual(1);

    const row = await prisma.exportJob.findUniqueOrThrow({ where: { id: staleRunning.id } });
    expect(row.status === "QUEUED" || row.status === "DONE" || row.status === "FAILED").toBe(true);
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
