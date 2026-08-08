import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { recordScoreEvent } from "../record";
import { rebuildLeaderboard } from "../aggregate";

const prisma = new PrismaClient();

let orgId: string;
let campId: string;
let campusId: string;
let tribeId: string;

async function makeCamper(label: string) {
  const parent = await prisma.user.create({
    data: { email: `participation-parent-${label}-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "PARENT", organizationId: orgId },
  });
  const camper = await prisma.camper.create({
    data: {
      name: `Participation ${label}`,
      firstName: "Participation",
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
  return reg.id;
}

async function makeStaff(label: string) {
  const user = await prisma.user.create({
    data: { email: `participation-staff-${label}-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "TEACHER", organizationId: orgId },
  });
  const staff = await prisma.staffProfile.create({
    data: {
      userId: user.id,
      organizationId: orgId,
      campId,
      type: "TEACHER",
      status: "APPROVED",
      firstName: "Participation",
      lastName: label,
      phone: "+1-555-0000",
      email: user.email,
    },
  });
  return { staffId: staff.id, userId: user.id };
}

beforeEach(async () => {
  const org = await prisma.organization.create({ data: { name: `Participation Org ${Date.now()}-${Math.random()}` } });
  orgId = org.id;

  const camp = await prisma.camp.create({
    data: {
      name: `${Date.now()}`,
      slug: `participation-${Date.now()}-${Math.random()}`,
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
      name: `Participation Campus ${Date.now()}`,
      slug: `participation-campus-${Date.now()}-${Math.random()}`,
      address: "1 Test St",
      city: "Testville",
      country: "Testland",
      organizationId: orgId,
      campusCode: "PRT",
    },
  });
  campusId = campus.id;

  const tribe = await prisma.tribe.create({ data: { campId, name: "Judah" } });
  tribeId = tribe.id;
});

afterEach(async () => {
  await prisma.scoreEvent.deleteMany({ where: { campId } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
});

describe("participation metric", () => {
  it("rewards breadth over volume — identical total points, more categories wins", async () => {
    const broad = await makeCamper("Broad");
    const narrow = await makeCamper("Narrow");

    // Both end on exactly 60 points; only the spread differs. This is the
    // whole point of the metric, so the totals are held equal deliberately.
    for (const categoryId of ["seed-cat-bible-quiz", "seed-cat-sports", "seed-cat-service", "seed-cat-leadership", "seed-cat-teamwork", "seed-cat-cleaning"]) {
      await recordScoreEvent({ campId, registrationId: broad, tribeId, campusId, categoryId, points: 10, source: "MANUAL" });
    }
    await recordScoreEvent({ campId, registrationId: narrow, tribeId, campusId, categoryId: "seed-cat-cleaning", points: 60, source: "MANUAL" });

    await prisma.leaderboardSettings.create({ data: { campId, camperMetricWeights: { participation: 100 } } });
    await prisma.$transaction(async (tx) => rebuildLeaderboard(tx, campId));

    const broadStat = await prisma.leaderboardStat.findFirstOrThrow({ where: { campId, subjectType: "CAMPER", subjectId: broad, day: null } });
    const narrowStat = await prisma.leaderboardStat.findFirstOrThrow({ where: { campId, subjectType: "CAMPER", subjectId: narrow, day: null } });

    expect(broadStat.totalPoints).toBe(narrowStat.totalPoints);
    expect(broadStat.compositeScore!).toBeGreaterThan(narrowStat.compositeScore!);
  });

  it("a subject who has scored in nothing at all is not penalized into a NaN", async () => {
    const only = await makeCamper("Only");
    await recordScoreEvent({ campId, registrationId: only, tribeId, campusId, categoryId: "seed-cat-cleaning", points: 5, source: "MANUAL" });

    await prisma.leaderboardSettings.create({ data: { campId, camperMetricWeights: { participation: 100 } } });
    await prisma.$transaction(async (tx) => rebuildLeaderboard(tx, campId));

    const stat = await prisma.leaderboardStat.findFirstOrThrow({ where: { campId, subjectType: "CAMPER", subjectId: only, day: null } });
    // Sole subject -> every metric ties -> full credit, not 0/0.
    expect(Number.isNaN(stat.compositeScore)).toBe(false);
    expect(stat.compositeScore).not.toBeNull();
  });
});

describe("sessionManagement metric", () => {
  it("counts only the attendance sessions that staff member ran, scoped to the camp", async () => {
    const busy = await makeStaff("Busy");
    const elsewhere = await makeStaff("Elsewhere");
    const none = await makeStaff("None");

    // All three score identically, so sessions-run is the only differentiator.
    for (const s of [busy, elsewhere, none]) {
      await recordScoreEvent({ campId, staffProfileId: s.staffId, categoryId: "seed-cat-cleaning", points: 10, source: "MANUAL" });
    }

    for (let i = 0; i < 3; i++) {
      await prisma.attendanceSession.create({
        data: { campId, name: `Session ${i}`, date: new Date(), createdById: busy.userId, tribeId },
      });
    }

    // `elsewhere` ran a session, but in a DIFFERENT camp — it must not count.
    const otherCamp = await prisma.camp.create({
      data: {
        name: `${Date.now()}-other`,
        slug: `participation-other-${Date.now()}-${Math.random()}`,
        year: 2026,
        startDate: new Date(2026, 0, 1),
        endDate: new Date(2026, 11, 31),
        organizationId: orgId,
        status: "OPEN",
        approvalMode: "AUTO",
      },
    });
    await prisma.attendanceSession.create({
      data: { campId: otherCamp.id, name: "Elsewhere", date: new Date(), createdById: elsewhere.userId },
    });

    // Note: configured weights MERGE over the defaults rather than replacing
    // them, so the other default metrics still contribute — which is why the
    // scoping assertion below compares `elsewhere` to `none` rather than
    // expecting an absolute zero.
    await prisma.leaderboardSettings.create({ data: { campId, teacherMetricWeights: { sessionManagement: 100 } } });
    await prisma.$transaction(async (tx) => rebuildLeaderboard(tx, campId));

    const stat = async (staffId: string) =>
      prisma.leaderboardStat.findFirstOrThrow({ where: { campId, subjectType: "STAFF", subjectId: staffId, day: null } });
    const busyStat = await stat(busy.staffId);
    const elsewhereStat = await stat(elsewhere.staffId);
    const noneStat = await stat(none.staffId);

    // Running sessions in THIS camp raises the score…
    expect(busyStat.compositeScore!).toBeGreaterThan(elsewhereStat.compositeScore!);
    // …while a session in another camp is worth exactly as much as no session
    // at all, which is what proves the campId scoping.
    expect(elsewhereStat.compositeScore).toBe(noneStat.compositeScore);
  });
});
