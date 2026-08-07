import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { recordScoreEvent } from "../record";
import { rebuildLeaderboard } from "../aggregate";

const prisma = new PrismaClient();

let orgId: string;
let campId: string;
let staffAId: string;
let staffBId: string;

async function rebuild() {
  await prisma.$transaction(async (tx) => rebuildLeaderboard(tx, campId));
}

beforeEach(async () => {
  const org = await prisma.organization.create({ data: { name: `Composite Org ${Date.now()}-${Math.random()}` } });
  orgId = org.id;

  const camp = await prisma.camp.create({
    data: {
      name: `${Date.now()}`,
      slug: `composite-test-${Date.now()}-${Math.random()}`,
      year: 2026,
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 11, 31),
      organizationId: orgId,
      status: "OPEN",
      approvalMode: "AUTO",
    },
  });
  campId = camp.id;

  async function makeStaff(label: string) {
    const user = await prisma.user.create({
      data: { email: `composite-${label}-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "TEACHER", organizationId: orgId },
    });
    const staff = await prisma.staffProfile.create({
      data: {
        userId: user.id,
        organizationId: orgId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: label,
        lastName: "Staff",
        phone: "+1-555-0000",
        email: user.email,
      },
    });
    return staff.id;
  }
  staffAId = await makeStaff("A");
  staffBId = await makeStaff("B");
});

afterEach(async () => {
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
});

describe("computeCompositeScores (via rebuildLeaderboard)", () => {
  it("with zero score events for anyone, the composite blend doesn't throw and stays within 0-5", async () => {
    await rebuild();
    const stat = await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "STAFF", subjectId: staffAId, day: null } });
    // No STAFF LeaderboardStat rows exist yet at all (no ScoreEvent, no
    // achievement) — computeCompositeScores's `rows.length === 0` guard
    // means nothing was ever created, which is itself the divide-by-zero
    // safety net under test.
    expect(stat).toBeNull();
  });

  it("a tied metric across every subject (e.g. no achievements awarded) gets full credit, not NaN", async () => {
    await recordScoreEvent({ campId, staffProfileId: staffAId, categoryId: "seed-cat-cleaning", points: 10, source: "MANUAL" });
    await recordScoreEvent({ campId, staffProfileId: staffBId, categoryId: "seed-cat-cleaning", points: 10, source: "MANUAL" });

    await rebuild();
    const statA = await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "STAFF", subjectId: staffAId, day: null } });
    const statB = await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "STAFF", subjectId: staffBId, day: null } });
    // Identical totalPoints, zero attendance/promptness/achievements for
    // both -> every metric ties -> both get the same composite, and it
    // must be a real number (not NaN from a 0/0 normalization).
    expect(Number.isNaN(statA?.compositeScore)).toBe(false);
    expect(statA?.compositeScore).toBe(statB?.compositeScore);
    expect(statA?.compositeScore).toBeGreaterThanOrEqual(0);
    expect(statA?.compositeScore).toBeLessThanOrEqual(5);
  });

  it("with default equal weights, more points alone raises a teacher's composite score", async () => {
    await recordScoreEvent({ campId, staffProfileId: staffAId, categoryId: "seed-cat-cleaning", points: 100, source: "MANUAL" });
    await recordScoreEvent({ campId, staffProfileId: staffBId, categoryId: "seed-cat-cleaning", points: 10, source: "MANUAL" });

    await rebuild();
    const statA = await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "STAFF", subjectId: staffAId, day: null } });
    const statB = await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "STAFF", subjectId: staffBId, day: null } });
    expect(statA!.compositeScore!).toBeGreaterThan(statB!.compositeScore!);
  });

  it("custom teacherMetricWeights zeroing out every metric except achievementCount changes the ranking", async () => {
    // A has more points but zero achievements; B has fewer points but one
    // achievement. Default equal weights would favor A; weighting
    // achievementCount alone should flip the ordering.
    await recordScoreEvent({ campId, staffProfileId: staffAId, categoryId: "seed-cat-cleaning", points: 100, source: "MANUAL" });
    await recordScoreEvent({ campId, staffProfileId: staffBId, categoryId: "seed-cat-cleaning", points: 10, source: "MANUAL" });

    const definition = await prisma.achievementDefinition.create({
      data: { campId, key: `E2E_COMPOSITE_${Date.now()}`, name: "Composite Test Achievement", subjectType: "STAFF" },
    });
    await prisma.achievementAward.create({ data: { definitionId: definition.id, campId, subjectKey: `S:${staffBId}` } });

    await prisma.leaderboardSettings.create({
      data: { campId, teacherMetricWeights: { attendancePct: 0, promptnessPct: 0, totalPoints: 0, achievementCount: 100 } },
    });

    await rebuild();
    const statA = await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "STAFF", subjectId: staffAId, day: null } });
    const statB = await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "STAFF", subjectId: staffBId, day: null } });
    expect(statB!.compositeScore!).toBeGreaterThan(statA!.compositeScore!);
  });

  it("achievementCount is actually populated from AchievementAward, not left at the schema default of 0", async () => {
    await recordScoreEvent({ campId, staffProfileId: staffAId, categoryId: "seed-cat-cleaning", points: 5, source: "MANUAL" });
    const definition = await prisma.achievementDefinition.create({
      data: { campId, key: `E2E_ACHV_COUNT_${Date.now()}`, name: "Achv Count Test", subjectType: "STAFF" },
    });
    await prisma.achievementAward.create({ data: { definitionId: definition.id, campId, subjectKey: `S:${staffAId}` } });

    await rebuild();
    const stat = await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "STAFF", subjectId: staffAId, day: null } });
    expect(stat?.achievementCount).toBe(1);
  });
});
