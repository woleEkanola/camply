import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { recordScoreEvent } from "../record";

const prisma = new PrismaClient();

let orgId: string;
let campId: string;
let adminId: string;
let parentId: string;
let tribeAId: string;
let tribeBId: string;
let tribeCId: string;
let tribeDId: string;

beforeEach(async () => {
  const org = await prisma.organization.create({ data: { name: `Notify Org ${Date.now()}-${Math.random()}` } });
  orgId = org.id;

  const camp = await prisma.camp.create({
    data: {
      name: `${Date.now()}`,
      slug: `notify-test-${Date.now()}-${Math.random()}`,
      year: 2026,
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 11, 31),
      organizationId: orgId,
      status: "OPEN",
      approvalMode: "AUTO",
    },
  });
  campId = camp.id;

  const admin = await prisma.user.create({
    data: { email: `notify-admin-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "ADMIN", organizationId: orgId },
  });
  adminId = admin.id;

  const campus = await prisma.campus.create({
    data: {
      name: `Notify Campus ${Date.now()}`,
      slug: `notify-campus-${Date.now()}-${Math.random()}`,
      address: "1 Test St",
      city: "Testville",
      country: "Testland",
      organizationId: orgId,
      campusCode: "NTF",
    },
  });

  const parent = await prisma.user.create({
    data: { email: `notify-parent-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "PARENT", organizationId: orgId },
  });
  parentId = parent.id;

  const [a, b, c, d] = await Promise.all([
    prisma.tribe.create({ data: { campId, name: "Judah" } }),
    prisma.tribe.create({ data: { campId, name: "Levi" } }),
    prisma.tribe.create({ data: { campId, name: "Dan" } }),
    prisma.tribe.create({ data: { campId, name: "Asher" } }),
  ]);
  tribeAId = a.id;
  tribeBId = b.id;
  tribeCId = c.id;
  tribeDId = d.id;

  // A parent with a camper in tribe D, so tribe D entering Top 3 has
  // someone concrete to notify besides org admins.
  const camper = await prisma.camper.create({
    data: {
      name: "Notify Camper",
      firstName: "Notify",
      lastName: "Camper",
      dateOfBirth: new Date(2013, 5, 1),
      gender: "MALE",
      userId: parentId,
      organizationId: orgId,
      homeCampusId: campus.id,
    },
  });
  await prisma.registration.create({ data: { camperId: camper.id, campId, campusId: campus.id, tribeId: tribeDId, status: "APPROVED" } });
});

afterEach(async () => {
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
});

describe("notifyTribeEnteredTopThree (via recordScoreEvent)", () => {
  it("notifies org admins and the tribe's camper-parents only on the transition into the top 3", async () => {
    // Fill ranks 1-4 with A/B/C/D — none of these fire a notification,
    // since every tribe's *first-ever* rank assignment has previousRank
    // null, which deliberately doesn't count as "entering the Top 3" (or a
    // brand-new camp's first round of awards would fire a simultaneous
    // burst for every tribe the moment scoring begins).
    await recordScoreEvent({ campId, tribeId: tribeAId, categoryId: "seed-cat-attendance", points: 30, source: "MANUAL" });
    await recordScoreEvent({ campId, tribeId: tribeBId, categoryId: "seed-cat-attendance", points: 20, source: "MANUAL" });
    await recordScoreEvent({ campId, tribeId: tribeCId, categoryId: "seed-cat-attendance", points: 10, source: "MANUAL" });
    await recordScoreEvent({ campId, tribeId: tribeDId, categoryId: "seed-cat-sports", points: 1, source: "MANUAL" }); // D starts at rank 4

    const notificationsAfterFirstFour = await prisma.notification.count({ where: { organizationId: orgId } });
    expect(notificationsAfterFirstFour).toBe(0);

    // Now D overtakes C (1 -> 15 pts) from a genuine prior rank of 4 — a real transition into the top 3.
    await recordScoreEvent({ campId, tribeId: tribeDId, categoryId: "seed-cat-sports", points: 14, source: "MANUAL" });

    const adminNotification = await prisma.notification.findFirst({ where: { organizationId: orgId, userId: adminId } });
    expect(adminNotification?.title).toContain("Asher");
    expect(adminNotification?.title).toContain("Top 3");

    const parentNotification = await prisma.notification.findFirst({ where: { organizationId: orgId, userId: parentId } });
    expect(parentNotification).not.toBeNull();
    expect(parentNotification?.link).toBe("/leaderboard");
  });

  it("does not notify again for a tribe that is already in the top 3 and gains more points", async () => {
    await recordScoreEvent({ campId, tribeId: tribeAId, categoryId: "seed-cat-attendance", points: 30, source: "MANUAL" });
    await recordScoreEvent({ campId, tribeId: tribeBId, categoryId: "seed-cat-attendance", points: 20, source: "MANUAL" });
    await recordScoreEvent({ campId, tribeId: tribeCId, categoryId: "seed-cat-attendance", points: 10, source: "MANUAL" });
    await recordScoreEvent({ campId, tribeId: tribeDId, categoryId: "seed-cat-sports", points: 1, source: "MANUAL" }); // D starts at rank 4
    await recordScoreEvent({ campId, tribeId: tribeDId, categoryId: "seed-cat-sports", points: 14, source: "MANUAL" }); // D enters top 3 from a real rank 4

    const countAfterEntry = await prisma.notification.count({ where: { organizationId: orgId } });
    expect(countAfterEntry).toBeGreaterThan(0);

    // D gains more points but is still comfortably top-3 — no new notification.
    await recordScoreEvent({ campId, tribeId: tribeDId, categoryId: "seed-cat-sports", points: 5, source: "MANUAL" });
    const countAfterMore = await prisma.notification.count({ where: { organizationId: orgId } });
    expect(countAfterMore).toBe(countAfterEntry);
  });
});

describe("notifyAchievementAwarded (via the router)", () => {
  it("notifies the camper's own parent and org admins when an achievement is awarded", async () => {
    const campus = await prisma.campus.findFirstOrThrow({ where: { organizationId: orgId } });
    const camper = await prisma.camper.create({
      data: {
        name: "Achiever",
        firstName: "Achiever",
        lastName: "Kid",
        dateOfBirth: new Date(2013, 5, 1),
        gender: "MALE",
        userId: parentId,
        organizationId: orgId,
        homeCampusId: campus.id,
      },
    });
    const registration = await prisma.registration.create({ data: { camperId: camper.id, campId, campusId: campus.id, status: "APPROVED" } });

    const { appRouter } = await import("../../api/root");
    const caller = appRouter.createCaller({
      prisma,
      session: { user: { id: adminId, email: "x@test.com", role: "ADMIN", organizationId: orgId }, expires: "" },
    });

    const def = await prisma.achievementDefinition.create({ data: { campId, key: "TEST_ACH", name: "Test Achievement", subjectType: "CAMPER" } });
    await caller.leaderboard.achievement.award({ campId, definitionId: def.id, subjectType: "CAMPER", subjectId: registration.id });

    const parentNotification = await prisma.notification.findFirst({ where: { organizationId: orgId, userId: parentId } });
    expect(parentNotification?.title).toContain("Test Achievement");

    const adminNotification = await prisma.notification.findFirst({ where: { organizationId: orgId, userId: adminId } });
    expect(adminNotification?.title).toContain("Test Achievement");
  });
});

// Matches the repo convention (e.g. accommodation/__tests__/engine.test.ts):
// disconnect once at module teardown, not per test. Vitest reuses fork
// workers across files, so a leaked PrismaClient here keeps a connection
// pool + query engine alive inside a reused worker for the rest of the run.
afterAll(async () => {
  await prisma.$disconnect();
});
