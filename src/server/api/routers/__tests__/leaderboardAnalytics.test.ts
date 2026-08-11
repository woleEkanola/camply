import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { appRouter } from "../../root";
import { recordScoreEvent } from "../../../leaderboard/record";
import { rebuildLeaderboard } from "../../../leaderboard/aggregate";

const prisma = new PrismaClient();

let orgId: string;
let campId: string;
let campusId: string;
let tribeId: string;
let adminId: string;
const registrationIds: string[] = [];

function caller() {
  return appRouter.createCaller({
    prisma,
    session: { user: { id: adminId, email: "x@test.com", role: "ADMIN", organizationId: orgId }, expires: "" },
  });
}

async function makeCamper(label: string) {
  const parent = await prisma.user.create({
    data: { email: `analytics-parent-${label}-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "PARENT", organizationId: orgId },
  });
  const camper = await prisma.camper.create({
    data: {
      name: `Analytics ${label}`,
      firstName: "Analytics",
      lastName: label,
      dateOfBirth: new Date(2013, 5, 1),
      gender: "MALE",
      userId: parent.id,
      organizationId: orgId,
      homeCampusId: campusId,
    },
  });
  const reg = await prisma.registration.create({
    data: { camperId: camper.id, campId, campusId, tribeId, status: "CHECKED_IN" },
  });
  registrationIds.push(reg.id);
  return reg.id;
}

beforeEach(async () => {
  registrationIds.length = 0;
  const org = await prisma.organization.create({ data: { name: `Analytics Org ${Date.now()}-${Math.random()}` } });
  orgId = org.id;

  const camp = await prisma.camp.create({
    data: {
      name: `${Date.now()}`,
      slug: `analytics-${Date.now()}-${Math.random()}`,
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
      name: `Analytics Campus ${Date.now()}`,
      slug: `analytics-campus-${Date.now()}-${Math.random()}`,
      address: "1 Test St",
      city: "Testville",
      country: "Testland",
      organizationId: orgId,
      campusCode: "ANL",
    },
  });
  campusId = campus.id;

  const tribe = await prisma.tribe.create({ data: { campId, name: "Judah" } });
  tribeId = tribe.id;

  const admin = await prisma.user.create({
    data: { email: `analytics-admin-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "ADMIN", organizationId: orgId },
  });
  adminId = admin.id;
});

afterEach(async () => {
  await prisma.scoreEvent.deleteMany({ where: { campId } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
});

describe("leaderboard.scoreDistribution", () => {
  it("buckets subjects across the observed range, counting every subject exactly once", async () => {
    const ids = await Promise.all([makeCamper("A"), makeCamper("B"), makeCamper("C"), makeCamper("D")]);
    const points = [10, 20, 80, 100];
    for (const [i, id] of ids.entries()) {
      await recordScoreEvent({ campId, registrationId: id, tribeId, campusId, categoryId: "seed-cat-cleaning", points: points[i], source: "MANUAL" });
    }
    await prisma.$transaction(async (tx) => rebuildLeaderboard(tx, campId));

    const result = await caller().leaderboard.scoreDistribution({ campId, subjectType: "CAMPER", buckets: 3 });
    expect(result.total).toBe(4);
    expect(result.buckets.length).toBe(3);
    // No subject may be dropped or double-counted by the binning.
    expect(result.buckets.reduce((sum, b) => sum + b.value, 0)).toBe(4);
    // The max value must land in the last bucket, not overflow past it.
    expect(result.buckets[result.buckets.length - 1].value).toBeGreaterThanOrEqual(1);
  });

  it("collapses to a single bucket when every subject has the same score, rather than dividing by zero", async () => {
    const ids = await Promise.all([makeCamper("E"), makeCamper("F")]);
    for (const id of ids) {
      await recordScoreEvent({ campId, registrationId: id, tribeId, campusId, categoryId: "seed-cat-cleaning", points: 50, source: "MANUAL" });
    }
    await prisma.$transaction(async (tx) => rebuildLeaderboard(tx, campId));

    const result = await caller().leaderboard.scoreDistribution({ campId, subjectType: "CAMPER" });
    expect(result.buckets.length).toBe(1);
    expect(result.buckets[0].value).toBe(2);
  });

  it("returns an empty result for a camp with no scores at all", async () => {
    const result = await caller().leaderboard.scoreDistribution({ campId, subjectType: "CAMPER" });
    expect(result.total).toBe(0);
    expect(result.buckets).toEqual([]);
  });
});

describe("leaderboard.attendanceTrend", () => {
  it("reports per-day check-in counts and punctuality from ScoreEvent, not day rows", async () => {
    const regId = await makeCamper("G");
    const day1 = new Date("2026-08-08T10:00:00.000Z");
    const day2 = new Date("2026-08-09T10:00:00.000Z");

    const s1 = await prisma.scoredSession.create({
      data: { campId, name: "S1", date: day1, startsAt: day1, categoryId: "seed-cat-attendance" },
    });
    const s2 = await prisma.scoredSession.create({
      data: { campId, name: "S2", date: day2, startsAt: day2, categoryId: "seed-cat-attendance" },
    });

    // Day 1 on time; day 2 late (0 points is what a past-cutoff arrival scores).
    await recordScoreEvent({ campId, registrationId: regId, tribeId, categoryId: "seed-cat-attendance", scoredSessionId: s1.id, points: 10, source: "AUTO", occurredAt: day1 });
    await recordScoreEvent({ campId, registrationId: regId, tribeId, categoryId: "seed-cat-attendance", scoredSessionId: s2.id, points: 0, source: "AUTO", occurredAt: day2 });

    const trend = await caller().leaderboard.attendanceTrend({ campId });
    expect(trend.length).toBe(2);
    expect(trend[0].attendedCount).toBe(1);
    expect(trend[0].promptnessPct).toBe(100);
    expect(trend[1].attendedCount).toBe(1);
    expect(trend[1].promptnessPct).toBe(0);
  });

  it("returns an empty series when nothing is session-tied", async () => {
    const regId = await makeCamper("H");
    await recordScoreEvent({ campId, registrationId: regId, tribeId, categoryId: "seed-cat-cleaning", points: 10, source: "MANUAL" });
    const trend = await caller().leaderboard.attendanceTrend({ campId });
    expect(trend).toEqual([]);
  });
});

describe("leaderboard.mostActiveStaff", () => {
  it("ranks staff by points they awarded, resolving real names", async () => {
    const staffUser = await prisma.user.create({
      data: { email: `analytics-staff-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "TEACHER", organizationId: orgId },
    });
    await prisma.staffProfile.create({
      data: {
        userId: staffUser.id,
        organizationId: orgId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: "Active",
        lastName: "Teacher",
        phone: "+1-555-0000",
        email: staffUser.email,
      },
    });

    const regId = await makeCamper("I");
    for (let i = 0; i < 3; i++) {
      await recordScoreEvent({
        campId,
        registrationId: regId,
        tribeId,
        categoryId: "seed-cat-cleaning",
        points: 5,
        source: "MANUAL",
        createdById: staffUser.id,
      });
    }

    const result = await caller().leaderboard.mostActiveStaff({ campId });
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("Active Teacher");
    expect(result[0].awards).toBe(3);
  });

  it("returns empty when nobody has awarded anything", async () => {
    const result = await caller().leaderboard.mostActiveStaff({ campId });
    expect(result).toEqual([]);
  });
});

// Matches the repo convention (e.g. accommodation/__tests__/engine.test.ts):
// disconnect once at module teardown, not per test. Vitest reuses fork
// workers across files, so a leaked PrismaClient here keeps a connection
// pool + query engine alive inside a reused worker for the rest of the run.
afterAll(async () => {
  await prisma.$disconnect();
});
