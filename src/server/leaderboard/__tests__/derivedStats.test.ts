import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { recordScoreEvent } from "../record";
import { rebuildLeaderboard } from "../aggregate";

const prisma = new PrismaClient();

let orgId: string;
let campId: string;
let tribeId: string;
let campusId: string;
let registrationId: string;

async function rebuild() {
  await prisma.$transaction(async (tx) => rebuildLeaderboard(tx, campId));
}

beforeEach(async () => {
  const org = await prisma.organization.create({ data: { name: `Derived Org ${Date.now()}-${Math.random()}` } });
  orgId = org.id;

  const camp = await prisma.camp.create({
    data: {
      name: `${Date.now()}`,
      slug: `derived-test-${Date.now()}-${Math.random()}`,
      year: 2026,
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 11, 31),
      organizationId: orgId,
      status: "OPEN",
      approvalMode: "AUTO",
    },
  });
  campId = camp.id;

  const campus = await prisma.campus.create({
    data: {
      name: `Derived Campus ${Date.now()}`,
      slug: `derived-campus-${Date.now()}-${Math.random()}`,
      address: "1 Test St",
      city: "Testville",
      country: "Testland",
      organizationId: orgId,
      campusCode: "DRV",
    },
  });
  campusId = campus.id;

  const tribe = await prisma.tribe.create({ data: { campId, name: "Judah" } });
  tribeId = tribe.id;

  const parent = await prisma.user.create({
    data: { email: `derived-parent-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "PARENT", organizationId: orgId },
  });
  const camper = await prisma.camper.create({
    data: {
      name: "Derived Camper",
      firstName: "Derived",
      lastName: "Camper",
      dateOfBirth: new Date(2013, 5, 1),
      gender: "MALE",
      userId: parent.id,
      organizationId: orgId,
      homeCampusId: campusId,
    },
  });
  const registration = await prisma.registration.create({
    data: { camperId: camper.id, campId, campusId, tribeId, status: "CHECKED_IN" },
  });
  registrationId = registration.id;
});

afterEach(async () => {
  // Delete users first (cascades through Camper -> Registration) before
  // Organization, whose cascade to Campus can otherwise race Registration's
  // non-cascading FK to Campus — see queue.test.ts's identical fix.
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
});

describe("computeDerivedStats (via rebuildLeaderboard)", () => {
  it("computes campersPresent from Registration.status = CHECKED_IN", async () => {
    await rebuild();
    const stat = await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "TRIBE", subjectId: tribeId, day: null } });
    expect(stat?.campersPresent).toBe(1);
  });

  it("computes attendancePct/promptnessPct from session-tied ScoreEvents vs total sessions", async () => {
    // Two days in the past, relative to whenever this test actually runs —
    // totalSessions only counts sessions dated <= today, so a fixed future
    // literal here would silently zero the denominator.
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60_000);
    const yesterday = new Date(Date.now() - 1 * 24 * 60 * 60_000);
    const session1 = await prisma.scoredSession.create({
      data: { campId, name: "S1", date: twoDaysAgo, startsAt: twoDaysAgo, categoryId: "seed-cat-attendance" },
    });
    await prisma.scoredSession.create({
      data: { campId, name: "S2", date: yesterday, startsAt: yesterday, categoryId: "seed-cat-attendance" },
    });

    // Attended session 1 on time (positive points); never attended session 2.
    await recordScoreEvent({
      campId,
      registrationId,
      tribeId,
      categoryId: "seed-cat-attendance",
      scoredSessionId: session1.id,
      points: 10,
      source: "AUTO",
      occurredAt: twoDaysAgo,
    });

    await rebuild();
    const stat = await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "CAMPER", subjectId: registrationId, day: null } });
    expect(stat?.attendancePct).toBe(50); // 1 of 2 sessions
    expect(stat?.promptnessPct).toBe(50); // that 1 attended session was on-time (points > 0)
  });

  it("promptnessPct is lower than attendancePct when a session is attended but late (0 points)", async () => {
    const yesterday = new Date(Date.now() - 1 * 24 * 60 * 60_000);
    const session1 = await prisma.scoredSession.create({
      data: { campId, name: "S1", date: yesterday, startsAt: yesterday, categoryId: "seed-cat-attendance" },
    });

    await recordScoreEvent({
      campId,
      registrationId,
      tribeId,
      categoryId: "seed-cat-attendance",
      scoredSessionId: session1.id,
      points: 0, // attended, but after cutoff per rules.ts's tier semantics
      source: "AUTO",
      occurredAt: yesterday,
    });

    await rebuild();
    const stat = await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "CAMPER", subjectId: registrationId, day: null } });
    expect(stat?.attendancePct).toBe(100); // attended the only session
    expect(stat?.promptnessPct).toBe(0); // but not on time
  });

  it("computes currentStreak as consecutive days with net-positive points", async () => {
    const day1 = new Date("2026-08-08T10:00:00.000Z");
    const day2 = new Date("2026-08-09T10:00:00.000Z");
    const day4 = new Date("2026-08-11T10:00:00.000Z"); // gap on day 3

    for (const occurredAt of [day1, day2, day4]) {
      await recordScoreEvent({ campId, tribeId, categoryId: "seed-cat-attendance", points: 5, source: "MANUAL", occurredAt });
    }

    await rebuild();
    const stat = await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "TRIBE", subjectId: tribeId, day: null } });
    // Most recent scored day is day4, alone (day3 has no events) -> streak 1
    expect(stat?.currentStreak).toBe(1);
  });

  it("a real unbroken streak counts every consecutive day", async () => {
    const day1 = new Date("2026-08-08T10:00:00.000Z");
    const day2 = new Date("2026-08-09T10:00:00.000Z");
    const day3 = new Date("2026-08-10T10:00:00.000Z");

    for (const occurredAt of [day1, day2, day3]) {
      await recordScoreEvent({ campId, tribeId, categoryId: "seed-cat-attendance", points: 5, source: "MANUAL", occurredAt });
    }

    await rebuild();
    const stat = await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "TRIBE", subjectId: tribeId, day: null } });
    expect(stat?.currentStreak).toBe(3);
  });

  it("computes avgScoreToday as the mean of today's events for that subject", async () => {
    const now = new Date();
    await recordScoreEvent({ campId, tribeId, categoryId: "seed-cat-attendance", points: 10, source: "MANUAL", occurredAt: now });
    await recordScoreEvent({ campId, tribeId, categoryId: "seed-cat-sports", points: 20, source: "MANUAL", occurredAt: now });

    await rebuild();
    const stat = await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "TRIBE", subjectId: tribeId, day: null } });
    expect(stat?.avgScoreToday).toBe(15);
  });
});
