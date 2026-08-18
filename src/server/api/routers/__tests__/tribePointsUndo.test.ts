import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "../../../db";
import { appRouter } from "../../root";

describe("tribeRouter - undoPoints", () => {
  let orgId: string;
  let campId: string;
  let tribeId: string;
  let ownerId: string;

  beforeEach(async () => {
    const org = await prisma.organization.create({
      data: { name: `Tribe Undo Org ${Date.now()}` },
    });
    orgId = org.id;

    const owner = await prisma.user.create({
      data: {
        email: `tribe-owner-${Date.now()}@example.com`,
        password: "test-password-123",
        role: "OWNER",
        organizationId: orgId,
      },
    });
    ownerId = owner.id;

    const camp = await prisma.camp.create({
      data: {
        name: `Tribe Undo Camp ${Date.now()}`,
        slug: `tribe-undo-camp-${Date.now()}`,
        year: 2026,
        organizationId: orgId,
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 86400000),
      },
    });
    campId = camp.id;

    await prisma.organization.update({
      where: { id: orgId },
      data: { activeCampId: campId },
    });

    const tribe = await prisma.tribe.create({
      data: {
        name: `Lion Tribe ${Date.now()}`,
        campId,
        points: 0,
      },
    });
    tribeId = tribe.id;
  });

  afterEach(async () => {
    if (tribeId) {
      await prisma.scoreEvent.deleteMany({ where: { tribeId } });
      await prisma.tribe.delete({ where: { id: tribeId } }).catch(() => {});
    }
    if (campId) {
      await prisma.camp.delete({ where: { id: campId } }).catch(() => {});
    }
    if (ownerId) {
      await prisma.user.delete({ where: { id: ownerId } }).catch(() => {});
    }
    if (orgId) {
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
    }
  });

  it("awards points to a tribe and successfully undoes the award", async () => {
    const caller = appRouter.createCaller({
      prisma,
      session: {
        user: { id: ownerId, email: "owner@test.com", role: "OWNER", organizationId: orgId },
        expires: "",
      },
    } as any);

    // 1. Award +50 points
    await caller.tribe.updatePoints({
      tribeId,
      delta: 50,
      reason: "Excellent clean up",
    });

    const tribeAfterAward = await prisma.tribe.findUniqueOrThrow({ where: { id: tribeId } });
    expect(tribeAfterAward.points).toBe(50);

    const history = await caller.tribe.pointsHistory({ tribeId });
    expect(history.length).toBe(1);
    expect(history[0].delta).toBe(50);
    const scoreEventId = history[0].id;

    // 2. Undo the points award
    const undoResult = await caller.tribe.undoPoints({
      tribeId,
      scoreEventId,
      reason: "Mistaken points entry",
    });

    expect(undoResult.success).toBe(true);

    const tribeAfterUndo = await prisma.tribe.findUniqueOrThrow({ where: { id: tribeId } });
    expect(tribeAfterUndo.points).toBe(0);

    // 3. Attempting to undo the same event again throws conflict
    await expect(
      caller.tribe.undoPoints({
        tribeId,
        scoreEventId,
      })
    ).rejects.toThrow(/already undone/);
  });
});
