import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { sweepPendingSideEffects } from "../effects";

// Same advisory lock key as SWEEP_LOCK_KEY in effects.ts — deliberately
// duplicated rather than imported, since it's not exported (and shouldn't be,
// it's an internal implementation detail); this test only needs to hold the
// *same numeric lock*, not reach into the module.
const SWEEP_LOCK_KEY = 847_362_910;

const lockHolder = new PrismaClient();
const testPrisma = new PrismaClient();
const stamp = `${Date.now()}-${Math.random()}`.replace(".", "-");

afterAll(async () => {
  await testPrisma.sideEffect.deleteMany({ where: { deliverySource: `sweep-test-${stamp}` } });
  await lockHolder.$disconnect();
  await testPrisma.$disconnect();
});

describe("sweepPendingSideEffects", () => {
  it("is a no-op when another process already holds the sweep lock", async () => {
    let releaseLock: () => void = () => {};
    const held = new Promise<void>((resolve) => { releaseLock = resolve; });

    // Pin a single connection for the duration of this transaction so the
    // advisory lock (session-scoped) stays held while the real sweep runs
    // concurrently on a different connection from a different PrismaClient.
    //
    // Acquiring it isn't guaranteed on the first try: this lock key is
    // shared across the whole DB, and in a full (non-isolated) suite run
    // another test file can legitimately be mid-sweep at the same instant
    // (e.g. a campaign send's immediate post-enqueue kick) and briefly hold
    // it first. Retry rather than asserting the very first attempt wins —
    // that's a real, expected race between two legitimate callers, not a
    // bug in either.
    let resolveAcquired: () => void = () => {};
    const acquired = new Promise<void>((resolve) => { resolveAcquired = resolve; });
    let acquireFailed = false;
    const holderDone = lockHolder.$transaction(async (tx) => {
      let gotIt = false;
      for (let attempt = 0; attempt < 30 && !gotIt; attempt++) {
        const rows = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(${SWEEP_LOCK_KEY}) AS locked`;
        gotIt = !!rows[0]?.locked;
        if (!gotIt) await new Promise((resolve) => setTimeout(resolve, 200));
      }
      acquireFailed = !gotIt;
      resolveAcquired();
      if (!gotIt) return;
      await held;
      // Advisory locks are session-scoped, not transaction-scoped — COMMIT
      // alone would leave this pooled connection holding the lock forever.
      await tx.$queryRaw`SELECT pg_advisory_unlock(${SWEEP_LOCK_KEY})`;
    });

    try {
      await acquired;
      expect(acquireFailed).toBe(false);
      const result = await sweepPendingSideEffects();
      expect(result).toEqual({ processed: 0, skipped: true });
    } finally {
      releaseLock();
      await holderDone;
    }
  });

  it("self-continues past a single run's limit until the due queue drains", async () => {
    const past = new Date(Date.now() - 1000);
    await testPrisma.sideEffect.createMany({
      data: Array.from({ length: 3 }, () => ({
        type: "REGISTRATION_APPROVED",
        registrationId: null,
        status: "QUEUED" as const,
        runAfter: past,
        deliverySource: `sweep-test-${stamp}`,
      })),
    });

    // limit=1 forces processed(1) >= limit on the first run, triggering
    // self-continuation; poll until all 3 dummy effects are DONE rather than
    // asserting on the immediate return value, since continuation runs are
    // fire-and-forget (setImmediate) and finish after this call returns.
    await sweepPendingSideEffects(1);

    const deadline = Date.now() + 10_000;
    let remaining = 3;
    while (Date.now() < deadline) {
      remaining = await testPrisma.sideEffect.count({
        where: { deliverySource: `sweep-test-${stamp}`, status: "QUEUED" },
      });
      if (remaining === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    expect(remaining).toBe(0);
    const doneCount = await testPrisma.sideEffect.count({
      where: { deliverySource: `sweep-test-${stamp}`, status: "DONE" },
    });
    expect(doneCount).toBe(3);
  }, 15_000);
});
