import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { recordScoreEvent } from "../record";

const prisma = new PrismaClient();

let orgId: string;
let campId: string;
let tribeId: string;

beforeEach(async () => {
  const org = await prisma.organization.create({ data: { name: `LB Org ${Date.now()}-${Math.random()}` } });
  orgId = org.id;

  const camp = await prisma.camp.create({
    data: {
      name: `${Date.now()}`,
      slug: `lb-test-${Date.now()}-${Math.random()}`,
      year: 2026,
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 11, 31),
      organizationId: orgId,
      status: "OPEN",
      approvalMode: "AUTO",
    },
  });
  campId = camp.id;

  const tribe = await prisma.tribe.create({ data: { campId, name: "Judah" } });
  tribeId = tribe.id;
});

afterEach(async () => {
  await prisma.organization.deleteMany({ where: { id: orgId } });
});

async function sumScoreEvents(where: { tribeId: string }) {
  const events = await prisma.scoreEvent.findMany({ where });
  return events.reduce((acc, e) => acc + e.points, 0);
}

describe("recordScoreEvent — Tribe.points parity (Risk #3)", () => {
  it("keeps Tribe.points equal to the sum of its ScoreEvents after a scripted sequence", async () => {
    await recordScoreEvent({ campId, tribeId, categoryId: "seed-cat-attendance", points: 10, source: "MANUAL" });
    await recordScoreEvent({ campId, tribeId, categoryId: "seed-cat-cleaning", points: 15, source: "MANUAL" });
    await recordScoreEvent({ campId, tribeId, categoryId: "seed-cat-penalty", points: -10, source: "MANUAL" });

    const tribe = await prisma.tribe.findUniqueOrThrow({ where: { id: tribeId } });
    const sum = await sumScoreEvents({ tribeId });

    expect(sum).toBe(15);
    expect(tribe.points).toBe(sum);
  });

  it("undo (a negated compensating event) keeps parity too", async () => {
    const original = await recordScoreEvent({ campId, tribeId, categoryId: "seed-cat-sports", points: 20, source: "MANUAL" });
    await recordScoreEvent({
      campId,
      tribeId,
      categoryId: "seed-cat-sports",
      points: -20,
      source: "MANUAL",
      reversesEventId: original!.id,
    });

    const tribe = await prisma.tribe.findUniqueOrThrow({ where: { id: tribeId } });
    const sum = await sumScoreEvents({ tribeId });
    expect(sum).toBe(0);
    expect(tribe.points).toBe(0);

    // the original row is never mutated or deleted
    const stillThere = await prisma.scoreEvent.findUnique({ where: { id: original!.id } });
    expect(stillThere?.points).toBe(20);
  });
});

describe("recordScoreEvent — idempotency", () => {
  it("a duplicate idempotencyKey is a silent no-op, not a double award", async () => {
    const key = `test:${Date.now()}:${Math.random()}`;
    const first = await recordScoreEvent({ campId, tribeId, categoryId: "seed-cat-attendance", points: 10, source: "AUTO", idempotencyKey: key });
    const second = await recordScoreEvent({ campId, tribeId, categoryId: "seed-cat-attendance", points: 10, source: "AUTO", idempotencyKey: key });

    expect(first).not.toBeNull();
    expect(second).toBeNull();

    const tribe = await prisma.tribe.findUniqueOrThrow({ where: { id: tribeId } });
    expect(tribe.points).toBe(10);
    expect(await prisma.scoreEvent.count({ where: { idempotencyKey: key } })).toBe(1);
  });
});

describe("recordScoreEvent — LeaderboardStat", () => {
  it("writes a matching TOTAL row for the tribe", async () => {
    await recordScoreEvent({ campId, tribeId, categoryId: "seed-cat-attendance", points: 10, source: "MANUAL" });
    await recordScoreEvent({ campId, tribeId, categoryId: "seed-cat-cleaning", points: 5, source: "MANUAL" });

    const total = await prisma.leaderboardStat.findFirst({
      where: { campId, subjectType: "TRIBE", subjectId: tribeId, day: null },
    });
    expect(total?.totalPoints).toBe(15);
  });
});
