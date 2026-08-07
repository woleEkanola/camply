import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { recordScoreEvent } from "../record";
import { rebuildLeaderboard } from "../aggregate";
import { awardTeacherOfTheDay } from "../dailyOps";

const prisma = new PrismaClient();

let orgId: string;
let campId: string;
let staffId: string;
let tribeId: string;

async function rebuild() {
  return prisma.$transaction(async (tx) => rebuildLeaderboard(tx, campId));
}

beforeEach(async () => {
  const org = await prisma.organization.create({ data: { name: `DailyOps Org ${Date.now()}-${Math.random()}` } });
  orgId = org.id;

  const camp = await prisma.camp.create({
    data: {
      name: `${Date.now()}`,
      slug: `dailyops-${Date.now()}-${Math.random()}`,
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

  const staffUser = await prisma.user.create({
    data: { email: `dailyops-staff-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "TEACHER", organizationId: orgId },
  });
  const staff = await prisma.staffProfile.create({
    data: {
      userId: staffUser.id,
      organizationId: orgId,
      campId,
      type: "TEACHER",
      status: "APPROVED",
      firstName: "T",
      lastName: "Test",
      phone: "+1-555-0000",
      email: staffUser.email,
    },
  });
  staffId = staff.id;
});

afterEach(async () => {
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
});

describe("awardTeacherOfTheDay", () => {
  it("fires exactly once for a given camp-day, not re-fired on a second call the same day", async () => {
    await recordScoreEvent({ campId, staffProfileId: staffId, categoryId: "seed-cat-cleaning", points: 20, source: "MANUAL" });

    const first = await awardTeacherOfTheDay(campId);
    expect(first?.staffProfileId).toBe(staffId);

    const second = await awardTeacherOfTheDay(campId);
    expect(second).toBeNull();

    const auditRows = await prisma.auditLog.findMany({ where: { action: "LEADERBOARD_TEACHER_OF_THE_DAY", organizationId: orgId } });
    expect(auditRows.length).toBe(1);
  });

  it("returns null when nobody has scored today", async () => {
    const result = await awardTeacherOfTheDay(campId);
    expect(result).toBeNull();
  });
});

describe("awardEligiblePerfectAttendance (via rebuildLeaderboard)", () => {
  it("awards Perfect Attendance to a tribe at 100% attendance with enough sessions, and does not re-award on a second rebuild", async () => {
    const days = [
      new Date(Date.now() - 3 * 24 * 60 * 60_000),
      new Date(Date.now() - 2 * 24 * 60 * 60_000),
      new Date(Date.now() - 1 * 24 * 60 * 60_000),
    ];
    for (const [i, day] of days.entries()) {
      const session = await prisma.scoredSession.create({
        data: { campId, name: `S${i}`, date: day, startsAt: day, categoryId: "seed-cat-attendance" },
      });
      await recordScoreEvent({
        campId,
        tribeId,
        categoryId: "seed-cat-attendance",
        scoredSessionId: session.id,
        points: 10,
        source: "AUTO",
        occurredAt: day,
      });
    }

    const first = await rebuild();
    expect(first.perfectAttendanceAwards).toEqual([{ tribeId, achievementName: "Perfect Attendance" }]);

    const awards = await prisma.achievementAward.findMany({ where: { campId, subjectKey: `T:${tribeId}` } });
    expect(awards.length).toBe(1);

    const second = await rebuild();
    expect(second.perfectAttendanceAwards).toEqual([]);

    const awardsAfterSecond = await prisma.achievementAward.findMany({ where: { campId, subjectKey: `T:${tribeId}` } });
    expect(awardsAfterSecond.length).toBe(1);
  });

  it("does not award below the minimum session threshold, even at 100% attendance", async () => {
    const day = new Date(Date.now() - 1 * 24 * 60 * 60_000);
    const session = await prisma.scoredSession.create({
      data: { campId, name: "OnlySession", date: day, startsAt: day, categoryId: "seed-cat-attendance" },
    });
    await recordScoreEvent({
      campId,
      tribeId,
      categoryId: "seed-cat-attendance",
      scoredSessionId: session.id,
      points: 10,
      source: "AUTO",
      occurredAt: day,
    });

    const result = await rebuild();
    expect(result.perfectAttendanceAwards).toEqual([]);
  });
});
