import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { recordScoreEvent } from "../record";
import { rebuildLeaderboard } from "../aggregate";
import { voidScoreEvent, VoidError } from "../void";

const prisma = new PrismaClient();

let orgId: string;
let campId: string;
let tribeId: string;
let actorId: string;

beforeEach(async () => {
  const stamp = `${Date.now()}-${Math.random()}`;
  const org = await prisma.organization.create({ data: { name: `Void Org ${stamp}` } });
  orgId = org.id;
  const actor = await prisma.user.create({ data: { email: `void-actor-${stamp}@test.com`, password: "x", role: "ADMIN", organizationId: orgId } });
  actorId = actor.id;
  const camp = await prisma.camp.create({
    data: {
      name: `Void Camp ${stamp}`,
      slug: `void-camp-${stamp}`,
      year: 2026,
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 11, 31),
      organizationId: orgId,
      status: "OPEN",
      approvalMode: "AUTO",
    },
  });
  campId = camp.id;
  const tribe = await prisma.tribe.create({ data: { campId, name: `Tribe ${stamp}` } });
  tribeId = tribe.id;
});

afterEach(async () => {
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
});

describe("voidScoreEvent", () => {
  it("nets points to zero and stamps voidedAt on both the original and its compensation", async () => {
    const event = await recordScoreEvent({ campId, tribeId, categoryId: "seed-cat-attendance", points: 25, source: "MANUAL", createdById: actorId });
    expect(event).toBeTruthy();

    const { original, compensating } = await voidScoreEvent({ eventId: event!.id, actorId, reason: "Duplicate scan" });
    expect(original.voidedAt).toBeTruthy();
    expect(compensating.voidedAt).toBeTruthy();
    expect(compensating.points).toBe(-25);
    expect(compensating.reversesEventId).toBe(original.id);

    const events = await prisma.scoreEvent.findMany({ where: { tribeId } });
    expect(events.reduce((sum, e) => sum + e.points, 0)).toBe(0);

    const tribe = await prisma.tribe.findUniqueOrThrow({ where: { id: tribeId } });
    expect(tribe.points).toBe(0);
  });

  it("rejects a double-void with CONFLICT rather than a double-negative", async () => {
    const event = await recordScoreEvent({ campId, tribeId, categoryId: "seed-cat-attendance", points: 10, source: "MANUAL", createdById: actorId });
    await voidScoreEvent({ eventId: event!.id, actorId, reason: "First void" });
    await expect(voidScoreEvent({ eventId: event!.id, actorId, reason: "Second void" })).rejects.toThrow(VoidError);

    const tribe = await prisma.tribe.findUniqueOrThrow({ where: { id: tribeId } });
    expect(tribe.points).toBe(0); // not -10 from a second compensating event
  });

  it("produces totals identical to a full rebuild — the core invariant a hard delete would break", async () => {
    await recordScoreEvent({ campId, tribeId, categoryId: "seed-cat-attendance", points: 10, source: "MANUAL", createdById: actorId });
    const toVoid = await recordScoreEvent({ campId, tribeId, categoryId: "seed-cat-cleaning", points: 40, source: "MANUAL", createdById: actorId });
    await recordScoreEvent({ campId, tribeId, categoryId: "seed-cat-penalty", points: -5, source: "MANUAL", createdById: actorId });
    await voidScoreEvent({ eventId: toVoid!.id, actorId, reason: "Fraudulent entry" });

    const beforeRebuild = await prisma.tribe.findUniqueOrThrow({ where: { id: tribeId } });
    expect(beforeRebuild.points).toBe(5); // 10 - 5, the voided 40 nets to 0

    const statBefore = await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "TRIBE", subjectId: tribeId, day: null } });

    await prisma.$transaction((tx) => rebuildLeaderboard(tx, campId));

    const statAfter = await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "TRIBE", subjectId: tribeId, day: null } });
    expect(statAfter?.totalPoints).toBe(statBefore?.totalPoints ?? 0);
    expect(statAfter?.totalPoints).toBe(5);
  });
});
