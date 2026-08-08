import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { appRouter } from "../../root";
import { recordScoreEvent } from "../../../leaderboard/record";

const prisma = new PrismaClient();

let orgId: string;
let campId: string;
let tribeAId: string;
let tribeBId: string;
let adminId: string;

function callerAs(role: "ADMIN", userId: string, organizationId: string) {
  return appRouter.createCaller({
    prisma,
    session: { user: { id: userId, email: "x@test.com", role, organizationId }, expires: "" },
  });
}

beforeEach(async () => {
  const org = await prisma.organization.create({ data: { name: `RankHist Org ${Date.now()}-${Math.random()}` } });
  orgId = org.id;

  const camp = await prisma.camp.create({
    data: {
      name: `${Date.now()}`,
      slug: `rankhist-${Date.now()}-${Math.random()}`,
      year: 2026,
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 11, 31),
      organizationId: orgId,
      status: "OPEN",
      approvalMode: "AUTO",
    },
  });
  campId = camp.id;

  const tribeA = await prisma.tribe.create({ data: { campId, name: "Judah", color: "#ff0000" } });
  tribeAId = tribeA.id;
  const tribeB = await prisma.tribe.create({ data: { campId, name: "Levi", color: "#00ff00" } });
  tribeBId = tribeB.id;

  const admin = await prisma.user.create({
    data: { email: `rankhist-admin-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "ADMIN", organizationId: orgId },
  });
  adminId = admin.id;
});

afterEach(async () => {
  await prisma.scoreEvent.deleteMany({ where: { campId } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
});

describe("leaderboard.rankHistory", () => {
  it("ranks flip across days as a multi-day fixture's cumulative points cross over", async () => {
    const day1 = new Date("2026-08-08T10:00:00.000Z");
    const day2 = new Date("2026-08-09T10:00:00.000Z");

    // Written via recordScoreEvent (the live write path), not a raw
    // ScoreEvent.create + rebuildLeaderboard — rebuildLeaderboard only
    // recomputes the all-time TOTAL row, not per-day LeaderboardStat rows
    // (those are only ever maintained incrementally by applyStatDelta on
    // the write path), so a raw-insert-then-rebuild fixture would see no
    // day rows at all for rankHistory to read.

    // Day 1: A leads (10 vs 5).
    await recordScoreEvent({ campId, tribeId: tribeAId, categoryId: "seed-cat-cleaning", points: 10, source: "MANUAL", occurredAt: day1 });
    await recordScoreEvent({ campId, tribeId: tribeBId, categoryId: "seed-cat-cleaning", points: 5, source: "MANUAL", occurredAt: day1 });
    // Day 2: B overtakes on cumulative total (5 + 20 = 25 > 10 + 0 = 10).
    await recordScoreEvent({ campId, tribeId: tribeBId, categoryId: "seed-cat-cleaning", points: 20, source: "MANUAL", occurredAt: day2 });

    const admin = callerAs("ADMIN", adminId, orgId);
    const result = await admin.leaderboard.rankHistory({ campId });

    expect(result.days).toEqual(["2026-08-08", "2026-08-09"]);
    const seriesA = result.series.find((s) => s.id === tribeAId)!;
    const seriesB = result.series.find((s) => s.id === tribeBId)!;

    expect(seriesA.ranks[0]).toBe(1); // A leads day 1
    expect(seriesB.ranks[0]).toBe(2);
    expect(seriesB.ranks[1]).toBe(1); // B overtakes on cumulative day 2
    // A has no ScoreEvent (and so no LeaderboardStat day row) on day 2 — the
    // procedure's documented approximation: no rank entry that day, not a
    // rank of "unchanged". BumpChart's connectNulls bridges this visually.
    expect(seriesA.ranks[1]).toBeNull();
  });

  it("returns empty days/series with no scoring history, not an error", async () => {
    const admin = callerAs("ADMIN", adminId, orgId);
    const result = await admin.leaderboard.rankHistory({ campId });
    expect(result.days).toEqual([]);
    expect(result.series).toEqual([]);
  });
});

// Matches the repo convention (e.g. accommodation/__tests__/engine.test.ts):
// disconnect once at module teardown, not per test. Vitest reuses fork
// workers across files, so a leaked PrismaClient here keeps a connection
// pool + query engine alive inside a reused worker for the rest of the run.
afterAll(async () => {
  await prisma.$disconnect();
});
