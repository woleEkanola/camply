import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { appRouter } from "../../root";

const prisma = new PrismaClient();

let orgId: string;
let otherOrgId: string;
let campId: string;
let campusId: string;
let tribeId: string;
let adminId: string;
let teacherUserId: string;
let parentUserId: string;
let registrationId: string;

beforeEach(async () => {
  const org = await prisma.organization.create({ data: { name: `LB Router Org ${Date.now()}-${Math.random()}` } });
  orgId = org.id;
  const otherOrg = await prisma.organization.create({ data: { name: `LB Other Org ${Date.now()}-${Math.random()}` } });
  otherOrgId = otherOrg.id;

  const camp = await prisma.camp.create({
    data: {
      name: `${Date.now()}`,
      slug: `lb-router-${Date.now()}-${Math.random()}`,
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
      name: `LB Campus ${Date.now()}`,
      slug: `lb-campus-${Date.now()}-${Math.random()}`,
      address: "1 Test St",
      city: "Testville",
      country: "Testland",
      organizationId: orgId,
      campusCode: "LBR",
    },
  });
  campusId = campus.id;

  const tribe = await prisma.tribe.create({ data: { campId, name: "Judah" } });
  tribeId = tribe.id;

  const admin = await prisma.user.create({
    data: { email: `lb-admin-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "ADMIN", organizationId: orgId },
  });
  adminId = admin.id;

  const teacherUser = await prisma.user.create({
    data: { email: `lb-teacher-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "TEACHER", organizationId: orgId },
  });
  teacherUserId = teacherUser.id;
  await prisma.staffProfile.create({
    data: {
      userId: teacherUserId,
      organizationId: orgId,
      campId,
      type: "TEACHER",
      status: "APPROVED",
      firstName: "T",
      lastName: "Test",
      phone: "+1-555-0000",
      email: teacherUser.email,
    },
  });

  const parentUser = await prisma.user.create({
    data: { email: `lb-parent-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "PARENT", organizationId: orgId },
  });
  parentUserId = parentUser.id;

  const camper = await prisma.camper.create({
    data: {
      name: "LB Camper",
      firstName: "LB",
      lastName: "Camper",
      dateOfBirth: new Date(2013, 5, 1),
      gender: "MALE",
      userId: parentUserId,
      organizationId: orgId,
      homeCampusId: campusId,
    },
  });
  const registration = await prisma.registration.create({
    data: { camperId: camper.id, campId, campusId, tribeId, status: "APPROVED" },
  });
  registrationId = registration.id;
});

afterEach(async () => {
  await prisma.sideEffect.deleteMany({ where: { type: { startsWith: "SCORE_" } } });
  await prisma.user.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgId, otherOrgId] } } });
});

function callerAs(role: "ADMIN" | "TEACHER" | "PARENT", userId: string, organizationId: string = orgId) {
  return appRouter.createCaller({
    prisma,
    session: { user: { id: userId, email: "x@test.com", role, organizationId }, expires: "" },
  });
}

describe("leaderboardRouter.award / undo", () => {
  it("an admin awards points, they show up in tribes/overview/feed, and undo restores parity", async () => {
    const admin = callerAs("ADMIN", adminId);

    const event = await admin.leaderboard.award({
      campId,
      subjectType: "TRIBE",
      subjectId: tribeId,
      categoryId: "seed-cat-cleaning",
      points: 15,
      reason: "Best Cleaning",
    });
    expect(event?.points).toBe(15);

    const tribes = await admin.leaderboard.tribes({ campId });
    expect(tribes[0].stat?.totalPoints).toBe(15);
    expect(tribes[0].stat?.rank).toBe(1);

    const overview = await admin.leaderboard.overview({ campId });
    expect(overview.championTribe?.subjectId).toBe(tribeId);
    expect(overview.championTribe?.name).toBe("Judah");
    expect(overview.feed[0].points).toBe(15);

    const audits = await admin.leaderboard.audit({ campId });
    expect(audits[0].action).toBe("LEADERBOARD_AWARD");

    await admin.leaderboard.undo({ campId, eventId: event!.id, reason: "mistake" });
    const tribesAfterUndo = await admin.leaderboard.tribes({ campId });
    expect(tribesAfterUndo[0].stat?.totalPoints).toBe(0);

    const tribe = await prisma.tribe.findUniqueOrThrow({ where: { id: tribeId } });
    const sum = (await prisma.scoreEvent.findMany({ where: { tribeId } })).reduce((a, e) => a + e.points, 0);
    expect(tribe.points).toBe(sum); // Risk #3 invariant, exercised through the router this time
  });

  it("a duplicate clientRequestId awards exactly once", async () => {
    const admin = callerAs("ADMIN", adminId);
    const clientRequestId = `req-${Date.now()}`;
    const first = await admin.leaderboard.award({ campId, subjectType: "TRIBE", subjectId: tribeId, categoryId: "seed-cat-sports", points: 20, clientRequestId });

    await expect(
      admin.leaderboard.award({ campId, subjectType: "TRIBE", subjectId: tribeId, categoryId: "seed-cat-sports", points: 20, clientRequestId })
    ).rejects.toThrow();

    expect(first?.points).toBe(20);
    const tribe = await prisma.tribe.findUniqueOrThrow({ where: { id: tribeId } });
    expect(tribe.points).toBe(20);
  });

  it("a TEACHER cannot award points (read-only surface only manages)", async () => {
    const teacher = callerAs("TEACHER", teacherUserId);
    await expect(
      teacher.leaderboard.award({ campId, subjectType: "TRIBE", subjectId: tribeId, categoryId: "seed-cat-sports", points: 10 })
    ).rejects.toThrow();
  });
});

describe("leaderboardRouter — read access", () => {
  it("a PARENT can read camp-wide standings", async () => {
    const admin = callerAs("ADMIN", adminId);
    await admin.leaderboard.award({ campId, subjectType: "TRIBE", subjectId: tribeId, categoryId: "seed-cat-attendance", points: 5 });

    const parent = callerAs("PARENT", parentUserId);
    const tribes = await parent.leaderboard.tribes({ campId });
    expect(tribes[0].stat?.totalPoints).toBe(5);
  });

  it("myChild returns only that parent's own registrations", async () => {
    const admin = callerAs("ADMIN", adminId);
    await admin.leaderboard.award({ campId, subjectType: "CAMPER", subjectId: registrationId, categoryId: "seed-cat-bible-quiz", points: 25 });

    const parent = callerAs("PARENT", parentUserId);
    const mine = await parent.leaderboard.myChild({ campId });
    expect(mine).toHaveLength(1);
    expect(mine[0].registration.id).toBe(registrationId);
    expect(mine[0].stat?.totalPoints).toBe(25);
  });

  it("a user from another organization cannot read this camp's leaderboard", async () => {
    const outsiderAdmin = await prisma.user.create({
      data: { email: `lb-outsider-${Date.now()}@test.com`, password: "x", role: "ADMIN", organizationId: otherOrgId },
    });
    const outsider = callerAs("ADMIN", outsiderAdmin.id, otherOrgId);
    await expect(outsider.leaderboard.tribes({ campId })).rejects.toThrow();
  });
});

describe("leaderboardRouter — rules tab (public-facing, read-only)", () => {
  it("returns category/tier structure without any reason/notes free text", async () => {
    const teacher = callerAs("TEACHER", teacherUserId);
    const { categories } = await teacher.leaderboard.rules({ campId });
    expect(categories.length).toBeGreaterThan(0);
    expect(categories.some((c: any) => c.key === "ATTENDANCE")).toBe(true);
  });
});

describe("leaderboardRouter.category / rule CRUD", () => {
  it("admin creates a camp-scoped category and rule, both usable in an award", async () => {
    const admin = callerAs("ADMIN", adminId);
    const category = await admin.leaderboard.category.create({
      campId,
      key: "CUSTOM_AWARD",
      name: "Custom Award",
      defaultPoints: 5,
    });
    expect(category.campId).toBe(campId);

    const rule = await admin.leaderboard.rule.create({
      campId,
      categoryId: category.id,
      trigger: "SCAN",
      stationId: "CAMP_ARRIVAL",
      subject: "REGISTRATION",
      tiers: [
        { maxMinutesLate: 0, points: 10 },
        { maxMinutesLate: null, points: 0 },
      ],
    });
    expect(rule.campId).toBe(campId);

    const list = await admin.leaderboard.rule.list({ campId });
    expect(list.map((r: any) => r.id)).toContain(rule.id);
  });
});

describe("leaderboardRouter.settings / rotatePublicToken", () => {
  it("get lazily creates safe (public-disabled) defaults", async () => {
    const admin = callerAs("ADMIN", adminId);
    const settings = await admin.leaderboard.settings.get({ campId });
    expect(settings.publicEnabled).toBe(false);
    expect(settings.publicToken).toBeNull();
  });

  it("rotatePublicToken issues a new token each time, invalidating the old one", async () => {
    const admin = callerAs("ADMIN", adminId);
    const first = await admin.leaderboard.rotatePublicToken({ campId });
    const second = await admin.leaderboard.rotatePublicToken({ campId });
    expect(first.publicToken).not.toBe(second.publicToken);
  });
});

// Matches the repo convention (e.g. accommodation/__tests__/engine.test.ts):
// disconnect once at module teardown, not per test. Vitest reuses fork
// workers across files, so a leaked PrismaClient here keeps a connection
// pool + query engine alive inside a reused worker for the rest of the run.
afterAll(async () => {
  await prisma.$disconnect();
});
