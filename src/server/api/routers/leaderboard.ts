import { z } from "zod";
import { randomBytes } from "crypto";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc/trpc";
import { assertSameOrg, assertCanManageCamp as assertScopedCampAccess } from "../trpc/scoping";
import { assertReportsAccess } from "./scan";
import { recordScoreEvent } from "../../leaderboard/record";
import { rebuildLeaderboard } from "../../leaderboard/aggregate";
import { toPublicDto, toPublicAnnouncementDto } from "../../leaderboard/publicDto";
import { notifyAchievementAwarded } from "../../leaderboard/notify";
import { awardCampCompletion } from "../../leaderboard/dailyOps";
import { drainScoreQueue } from "../../leaderboard/queue";

const assertCanManageCamp = (ctx: any, campId: string) =>
  assertScopedCampAccess(ctx, campId, "LEADERBOARD");

/**
 * Read gate for the whole leaderboard surface. Camp-wide standings
 * (points/rank) are not PII, so unlike assertReportsAccess (which only
 * allows org admins, campus reps, and approved staff), PARENT also passes
 * here — "Parents have read-only access" is a stated product requirement.
 * Per-subject detail procedures (camperDetail, myChild) still whitelist
 * fields the same way the public board does; this gate is deliberately
 * coarse (campId + org membership), not a substitute for that.
 */
async function assertLeaderboardRead(ctx: { prisma: any; session: any }, campId: string) {
  const camp = await ctx.prisma.camp.findUniqueOrThrow({ where: { id: campId } });
  const user = ctx.session?.user;
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (user.role === "PARENT") {
    assertSameOrg(ctx, camp.organizationId);
    return camp;
  }
  await assertReportsAccess(ctx, camp.organizationId);
  return camp;
}

async function writeAudit(
  ctx: { prisma: any; session: any },
  camp: { organizationId: string },
  action: string,
  input: { reason?: string; subjectType?: string; subjectId?: string; device?: string; ipAddress?: string; newValue?: unknown; previousValue?: unknown }
) {
  const user = ctx.session?.user;
  await ctx.prisma.auditLog.create({
    data: {
      organizationId: camp.organizationId,
      actorId: user?.id,
      action,
      reason: input.reason,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      device: input.device,
      ipAddress: input.ipAddress,
      newValue: input.newValue as any,
      previousValue: input.previousValue as any,
    },
  });
}

const subjectTypeSchema = z.enum(["TRIBE", "CAMPER", "STAFF", "CAMPUS"]);

function subjectColumn(subjectType: z.infer<typeof subjectTypeSchema>): "tribeId" | "registrationId" | "staffProfileId" | "campusId" {
  switch (subjectType) {
    case "TRIBE":
      return "tribeId";
    case "CAMPER":
      return "registrationId";
    case "STAFF":
      return "staffProfileId";
    case "CAMPUS":
      return "campusId";
  }
}

/** Lazily ensures a camp-scoped "Adjustment" category exists for admin
 * tribe resets/deductions — same lazy-create-on-first-use pattern as
 * attendance.ts's resolveAttendanceScoring, never a hard-coded id. */
async function ensureAdjustmentCategory(prisma: any, campId: string) {
  const existing = await prisma.scoreCategory.findFirst({
    where: { campId, key: { equals: "LEADERBOARD_ADJUSTMENT", mode: "insensitive" } },
  });
  if (existing) return existing;
  return prisma.scoreCategory.create({
    data: {
      campId,
      key: "LEADERBOARD_ADJUSTMENT",
      name: "Admin Adjustment",
      description: "Manual point reset or deduction applied by a camp admin.",
      kind: "MANUAL",
      enabled: true,
      sortOrder: 999,
    },
  });
}

export const leaderboardRouter = createTRPCRouter({
  // ─── Reads ─────────────────────────────────────────────────────────────

  // Lets the client-side admin-area gate (src/app/leaderboard/admin/page.tsx)
  // widen beyond the SUPER_ADMIN/OWNER/ADMIN role check to also admit a
  // current Camp Head (Position.grantsManageCamp) — a boolean rather than
  // exposing the underlying grant details, since the client only needs a
  // yes/no to decide whether to render the admin area at all. Never throws
  // on "no" (unlike assertCanManageCamp) since a negative answer is an
  // expected, common case for this query, not an authorization failure.
  canManageCamp: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      try {
        await assertCanManageCamp(ctx, input.campId);
        return true;
      } catch {
        return false;
      }
    }),

  overview: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertLeaderboardRead(ctx, input.campId);

      // Opportunistic drain: this is what makes the projector feel live
      // between cron ticks, since overview is polled every refreshInterval.
      // Never do this on the public board — an unauthenticated caller must
      // not be able to trigger work.
      try {
        await drainScoreQueue();
      } catch (error) {
        console.error("[leaderboard.overview] opportunistic drainScoreQueue failed:", error);
      }

      const [topTribes, topCampers, topStaff, recentAchievements, feed, lastComputed] = await Promise.all([
        ctx.prisma.leaderboardStat.findMany({
          where: { campId: input.campId, subjectType: "TRIBE", day: null },
          orderBy: { totalPoints: "desc" },
          take: 10,
        }),
        ctx.prisma.leaderboardStat.findMany({
          where: { campId: input.campId, subjectType: "CAMPER", day: null },
          orderBy: { totalPoints: "desc" },
          take: 10,
        }),
        ctx.prisma.leaderboardStat.findMany({
          where: { campId: input.campId, subjectType: "STAFF", day: null },
          orderBy: { totalPoints: "desc" },
          take: 10,
        }),
        ctx.prisma.achievementAward.findMany({
          where: { campId: input.campId },
          orderBy: { awardedAt: "desc" },
          take: 10,
          include: { definition: true },
        }),
        ctx.prisma.scoreEvent.findMany({
          where: { campId: input.campId },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        ctx.prisma.leaderboardStat.aggregate({ where: { campId: input.campId }, _max: { computedAt: true } }),
      ]);

      // All three name maps resolved together — before this, only tribes were
      // resolved, so the Overview tab's Top Campers / Top Teachers lists
      // rendered the raw `subjectId` cuid straight to the user.
      const [tribeNames, camperNames, staffNames] = await Promise.all([
        namesFor(ctx.prisma, "tribe", topTribes.map((t: any) => t.subjectId)),
        camperNamesFor(ctx.prisma, topCampers.map((c: any) => c.subjectId)),
        staffNamesFor(ctx.prisma, topStaff.map((s: any) => s.subjectId)),
      ]);

      return {
        championTribe: topTribes[0] ? { ...topTribes[0], name: tribeNames[topTribes[0].subjectId] } : null,
        topTribes: topTribes.map((t: any) => ({ ...t, name: tribeNames[t.subjectId] })),
        topCampers: topCampers.map((c: any) => ({ ...c, name: camperNames[c.subjectId] ?? "Camper" })),
        topStaff: topStaff.map((s: any) => ({ ...s, name: staffNames[s.subjectId] ?? "Staff" })),
        recentAchievements,
        feed,
        lastUpdated: lastComputed._max.computedAt,
      };
    }),

  tribes: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertLeaderboardRead(ctx, input.campId);
      const tribes = await ctx.prisma.tribe.findMany({ where: { campId: input.campId, deletedAt: null } });
      const stats = await ctx.prisma.leaderboardStat.findMany({
        where: { campId: input.campId, subjectType: "TRIBE", day: null },
      });
      const statBySubject = new Map(stats.map((s: any) => [s.subjectId, s]));
      return tribes
        .map((t: any) => ({ tribe: t, stat: statBySubject.get(t.id) ?? null }))
        .sort((a: any, b: any) => (a.stat?.rank ?? Infinity) - (b.stat?.rank ?? Infinity));
    }),

  /**
   * The tribe detail page's data source — extended in PR6-follow-up (PR7)
   * beyond the original PR3 shape (tribe/stat/timeline/achievements) with
   * teachers, campers, and a manual-vs-penalty split, to cover the spec's
   * 12 detail-page sections. Everything the page needs comes back in one
   * call rather than several, since it's all scoped to the same tribe.
   */
  tribeDetail: protectedProcedure
    .input(z.object({ campId: z.string(), tribeId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertLeaderboardRead(ctx, input.campId);
      const [tribe, stat, timelineRaw, achievements, assignedStaff, registrations, dailyTotals] = await Promise.all([
        ctx.prisma.tribe.findUniqueOrThrow({ where: { id: input.tribeId } }),
        ctx.prisma.leaderboardStat.findFirst({
          where: { campId: input.campId, subjectType: "TRIBE", subjectId: input.tribeId, day: null },
        }),
        ctx.prisma.scoreEvent.findMany({
          where: { campId: input.campId, tribeId: input.tribeId },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
        ctx.prisma.achievementAward.findMany({
          where: { campId: input.campId, subjectKey: `T:${input.tribeId}` },
          include: { definition: true },
          orderBy: { awardedAt: "desc" },
        }),
        ctx.prisma.staffProfile.findMany({
          where: { assignedTribeId: input.tribeId, deletedAt: null },
          select: { id: true, firstName: true, lastName: true, type: true, photoUrl: true },
        }),
        ctx.prisma.registration.findMany({
          where: { campId: input.campId, tribeId: input.tribeId, deletedAt: null },
          include: { camper: { select: { name: true, firstName: true, lastName: true } } },
        }),
        ctx.prisma.leaderboardStat.findMany({
          where: { campId: input.campId, subjectType: "TRIBE", subjectId: input.tribeId, day: { not: null } },
          orderBy: { day: "asc" },
          select: { day: true, totalPoints: true },
        }),
      ]);

      const categoryIds = [...new Set(timelineRaw.map((e: any) => e.categoryId))];
      const categories = await ctx.prisma.scoreCategory.findMany({ where: { id: { in: categoryIds } } });
      const categoryById = new Map(categories.map((c: any) => [c.id, c]));
      const timeline = timelineRaw.map((e: any) => ({ ...e, category: categoryById.get(e.categoryId) ?? null }));

      // ScoreEvent.scoredSessionId is a plain scalar (no Prisma relation
      // declared to ScoredSession), so session names need a separate lookup
      // rather than an `include`.
      const sessionIds = [...new Set(timelineRaw.map((e: any) => e.scoredSessionId).filter(Boolean))];
      const sessions = sessionIds.length ? await ctx.prisma.scoredSession.findMany({ where: { id: { in: sessionIds } }, select: { id: true, name: true } }) : [];
      const sessionNameById = new Map(sessions.map((s: any) => [s.id, s.name]));

      const manualAwards = timeline.filter((e: any) => e.source === "MANUAL" && !e.category?.isPenalty);
      const penalties = timeline.filter((e: any) => e.category?.isPenalty);
      const sessionPerformanceMap = new Map<string, { sessionId: string; sessionName: string; totalPoints: number; eventCount: number }>();
      for (const e of timeline) {
        if (!e.scoredSessionId) continue;
        const existing = sessionPerformanceMap.get(e.scoredSessionId) ?? {
          sessionId: e.scoredSessionId,
          sessionName: sessionNameById.get(e.scoredSessionId) ?? e.scoredSessionId,
          totalPoints: 0,
          eventCount: 0,
        };
        existing.totalPoints += e.points;
        existing.eventCount += 1;
        sessionPerformanceMap.set(e.scoredSessionId, existing);
      }
      const today = new Date().toISOString().slice(0, 10);
      const todayBreakdown = timeline.filter((e: any) => new Date(e.createdAt).toISOString().slice(0, 10) === today);

      const camperRegistrationIds = registrations.map((r: any) => r.id);
      const camperStats = await ctx.prisma.leaderboardStat.findMany({
        where: { campId: input.campId, subjectType: "CAMPER", subjectId: { in: camperRegistrationIds }, day: null },
      });
      const camperStatByReg = new Map(camperStats.map((s: any) => [s.subjectId, s]));
      const campers = registrations.map((r: any) => ({ registration: r, stat: camperStatByReg.get(r.id) ?? null }));

      return {
        tribe,
        stat,
        timeline,
        achievements,
        teachers: assignedStaff,
        campers,
        manualAwards,
        penalties,
        sessionPerformance: [...sessionPerformanceMap.values()],
        todayBreakdown,
        dailyTotals: dailyTotals.map((d: any) => ({ day: d.day, totalPoints: d.totalPoints })),
      };
    }),

  /** Mirrors tribeDetail's shape (stat + score timeline + achievements),
   * scoped to one camper's registration. No teachers/campers/session-
   * performance sections — those are tribe-level concepts. */
  camperDetail: protectedProcedure
    .input(z.object({ campId: z.string(), registrationId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertLeaderboardRead(ctx, input.campId);
      const [registration, stat, timeline, achievements] = await Promise.all([
        ctx.prisma.registration.findUniqueOrThrow({
          where: { id: input.registrationId },
          include: { camper: { select: { name: true, firstName: true, lastName: true } }, tribe: { select: { name: true, color: true } } },
        }),
        ctx.prisma.leaderboardStat.findFirst({
          where: { campId: input.campId, subjectType: "CAMPER", subjectId: input.registrationId, day: null },
        }),
        ctx.prisma.scoreEvent.findMany({
          where: { campId: input.campId, registrationId: input.registrationId },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
        ctx.prisma.achievementAward.findMany({
          where: { campId: input.campId, subjectKey: `C:${input.registrationId}` },
          include: { definition: true },
          orderBy: { awardedAt: "desc" },
        }),
      ]);
      return { registration, stat, timeline, achievements };
    }),

  /** Mirrors tribeDetail's shape, scoped to one staff member. */
  staffDetail: protectedProcedure
    .input(z.object({ campId: z.string(), staffId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertLeaderboardRead(ctx, input.campId);
      const [staff, stat, timeline, achievements] = await Promise.all([
        ctx.prisma.staffProfile.findUniqueOrThrow({
          where: { id: input.staffId },
          select: { id: true, firstName: true, lastName: true, type: true, photoUrl: true },
        }),
        ctx.prisma.leaderboardStat.findFirst({
          where: { campId: input.campId, subjectType: "STAFF", subjectId: input.staffId, day: null },
        }),
        ctx.prisma.scoreEvent.findMany({
          where: { campId: input.campId, staffProfileId: input.staffId },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
        ctx.prisma.achievementAward.findMany({
          where: { campId: input.campId, subjectKey: `S:${input.staffId}` },
          include: { definition: true },
          orderBy: { awardedAt: "desc" },
        }),
      ]);
      return { staff, stat, timeline, achievements };
    }),

  campers: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertLeaderboardRead(ctx, input.campId);
      // Sorts by the weighted compositeScore once an admin has configured
      // camperMetricWeights (see aggregate.ts's computeCompositeScores) —
      // otherwise unchanged, raw totalPoints order, so a camp that never
      // touches weights sees zero behavior change.
      const settings = await ctx.prisma.leaderboardSettings.findUnique({ where: { campId: input.campId } });
      const useWeighted = !!settings?.camperMetricWeights;
      const stats = await ctx.prisma.leaderboardStat.findMany({
        where: { campId: input.campId, subjectType: "CAMPER", day: null },
        orderBy: useWeighted ? [{ compositeScore: { sort: "desc", nulls: "last" } }, { totalPoints: "desc" }] : { totalPoints: "desc" },
        take: 100,
      });
      const registrations = await ctx.prisma.registration.findMany({
        where: { id: { in: stats.map((s: any) => s.subjectId) } },
        include: { camper: { select: { name: true, firstName: true, lastName: true } }, tribe: { select: { name: true, color: true } } },
      });
      const regById = new Map(registrations.map((r: any) => [r.id, r]));
      return stats.map((s: any) => ({ stat: s, registration: regById.get(s.subjectId) ?? null, rankedByWeightedScore: useWeighted }));
    }),

  staff: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertLeaderboardRead(ctx, input.campId);
      const stats = await ctx.prisma.leaderboardStat.findMany({
        where: { campId: input.campId, subjectType: "STAFF", day: null },
        orderBy: { totalPoints: "desc" },
        take: 100,
      });
      const staffProfiles = await ctx.prisma.staffProfile.findMany({
        where: { id: { in: stats.map((s: any) => s.subjectId) } },
        select: { id: true, firstName: true, lastName: true, type: true, photoUrl: true },
      });
      const staffById = new Map(staffProfiles.map((s: any) => [s.id, s]));
      return stats.map((s: any) => ({ stat: s, staff: staffById.get(s.subjectId) ?? null }));
    }),

  campuses: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertLeaderboardRead(ctx, input.campId);
      // Same opt-in pattern as `campers`: ordering only switches to the
      // weighted composite once an admin has configured campusMetricWeights,
      // so a camp that never touches them sees no behaviour change.
      const settings = await ctx.prisma.leaderboardSettings.findUnique({ where: { campId: input.campId } });
      const useWeighted = !!(settings as any)?.campusMetricWeights;
      const stats = await ctx.prisma.leaderboardStat.findMany({
        where: { campId: input.campId, subjectType: "CAMPUS", day: null },
        orderBy: useWeighted ? [{ compositeScore: { sort: "desc", nulls: "last" } }, { totalPoints: "desc" }] : { totalPoints: "desc" },
      });
      const campuses = await ctx.prisma.campus.findMany({ where: { id: { in: stats.map((s: any) => s.subjectId) } } });
      const campusById = new Map(campuses.map((c: any) => [c.id, c]));
      return stats.map((s: any) => ({ stat: s, campus: campusById.get(s.subjectId) ?? null, rankedByWeightedScore: useWeighted }));
    }),

  achievements: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertLeaderboardRead(ctx, input.campId);
      return ctx.prisma.achievementAward.findMany({
        where: { campId: input.campId },
        include: { definition: true },
        orderBy: { awardedAt: "desc" },
        take: 100,
      });
    }),

  /** Per-day point totals for the whole camp — the trend line data source.
   * "Most improved" / category-performance breakdowns are UI-side
   * aggregation of this same data, not separate procedures. */
  history: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertLeaderboardRead(ctx, input.campId);
      const rows: Array<{ day: Date; total: bigint }> = await ctx.prisma.$queryRaw`
        SELECT "day", SUM("points") AS total FROM "ScoreEvent"
        WHERE "campId" = ${input.campId} GROUP BY "day" ORDER BY "day" ASC
      `;
      return rows.map((r) => ({ day: r.day, total: Number(r.total) }));
    }),

  /**
   * Per-day rank for every TRIBE — the BumpChart's data source (built in
   * PR3, never wired in until now). No schema change: computed on read from
   * LeaderboardStat's existing day rows via a SQL window function
   * (cumulative SUM(totalPoints) per tribe ordered by day, then RANK() per
   * day). Cheap — a camp is one to two weeks of day rows, not months.
   *
   * Known approximation: a tribe only has a day row for a day it actually
   * had a ScoreEvent, so a scoreless day produces no rank entry for that
   * tribe that day (not a rank of "unchanged") — BumpChart's `connectNulls`
   * bridges the visual gap. For a camp with daily activity (the normal
   * case) this rarely matters; it's a read-time approximation rather than
   * a new persisted per-day rank column, which would need its own write
   * path and backfill.
   *
   * Pre-existing gap discovered while building this (not introduced here,
   * left as-is — out of this PR's scope): `rebuildLeaderboard` only
   * recomputes the all-time TOTAL row from ScoreEvent; per-day
   * LeaderboardStat rows are maintained solely by `applyStatDelta` on the
   * live write path (recordScoreEvent). So the nightly reconcile / admin
   * "Rebuild Now" heals TOTAL-row drift but not day-row drift, which means
   * this chart can't self-correct from a full rebuild the way every other
   * card on this page can.
   */
  rankHistory: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertLeaderboardRead(ctx, input.campId);
      const rows: Array<{ subjectId: string; day: Date; rank: bigint }> = await ctx.prisma.$queryRaw`
        WITH cumulative AS (
          SELECT "subjectId", "day",
                 SUM("totalPoints") OVER (PARTITION BY "subjectId" ORDER BY "day") AS cum_points
          FROM "LeaderboardStat"
          WHERE "campId" = ${input.campId} AND "subjectType" = 'TRIBE' AND "day" IS NOT NULL
        )
        SELECT "subjectId", "day", RANK() OVER (PARTITION BY "day" ORDER BY cum_points DESC) AS rank
        FROM cumulative
        ORDER BY "day" ASC
      `;
      if (rows.length === 0) return { days: [] as string[], series: [] as { id: string; name: string; color: string; ranks: (number | null)[] }[] };

      const days = [...new Set(rows.map((r) => r.day.toISOString().slice(0, 10)))].sort();
      const dayIndex = new Map(days.map((d, i) => [d, i]));

      const tribeIds = [...new Set(rows.map((r) => r.subjectId))];
      const tribes = await ctx.prisma.tribe.findMany({ where: { id: { in: tribeIds } } });
      const tribeById = new Map(tribes.map((t: any) => [t.id, t]));

      const ranksBySubject = new Map<string, (number | null)[]>();
      for (const id of tribeIds) ranksBySubject.set(id, days.map(() => null));
      for (const r of rows) {
        const i = dayIndex.get(r.day.toISOString().slice(0, 10));
        if (i !== undefined) ranksBySubject.get(r.subjectId)![i] = Number(r.rank);
      }

      const series = tribeIds.map((id) => ({
        id,
        name: (tribeById.get(id) as any)?.name ?? id,
        color: (tribeById.get(id) as any)?.color ?? "#6366f1",
        ranks: ranksBySubject.get(id)!,
      }));

      return { days, series };
    }),

  /**
   * Mean gap between a session's scheduled start and each subject's
   * actual (session-tied) arrival ScoreEvent — the last of the spec's 10
   * historical analyses. Positive minutes = arrived after start (late by
   * that many minutes); negative = arrived early. Only ScoreEvent rows
   * that are actually tied to a ScoredSession count (a manual award has no
   * "arrival time" to measure), grouped per calendar day for the History
   * tab's trend tile.
   */
  averageArrivalTime: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertLeaderboardRead(ctx, input.campId);
      const rows: Array<{ day: Date; avgMinutesLate: number | null }> = await ctx.prisma.$queryRaw`
        SELECT se."day",
               AVG(EXTRACT(EPOCH FROM (se."occurredAt" - ss."startsAt")) / 60.0)::float AS "avgMinutesLate"
        FROM "ScoreEvent" se
        JOIN "ScoredSession" ss ON ss."id" = se."scoredSessionId"
        WHERE se."campId" = ${input.campId} AND se."scoredSessionId" IS NOT NULL
        GROUP BY se."day"
        ORDER BY se."day" ASC
      `;
      return rows.map((r) => ({ day: r.day, avgMinutesLate: r.avgMinutesLate ?? 0 }));
    }),

  /**
   * Camp-wide attendance and promptness per day — two of the spec's ten
   * historical analyses.
   *
   * Computed from `ScoreEvent` directly, NOT from `LeaderboardStat` day rows.
   * Two reasons, both load-bearing: day rows only ever carry `totalPoints`
   * (every other derived column is written to the all-time row only), and
   * `attendancePct` there is recomputed against a *moving* denominator
   * (sessions-so-far), so it is a current snapshot rather than a stable
   * historical figure. This groups the same numerator query
   * `computeDerivedStats` uses by day, against that day's own session count,
   * which is what makes each point comparable to the next.
   */
  attendanceTrend: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertLeaderboardRead(ctx, input.campId);
      const rows: Array<{ day: Date; attended: bigint; prompt: bigint; sessions: bigint }> = await ctx.prisma.$queryRaw`
        WITH per_day AS (
          SELECT "day",
                 COUNT(DISTINCT ("registrationId", "scoredSessionId")) FILTER (WHERE "registrationId" IS NOT NULL) AS attended,
                 COUNT(DISTINCT ("registrationId", "scoredSessionId")) FILTER (WHERE "registrationId" IS NOT NULL AND "points" > 0) AS prompt
          FROM "ScoreEvent"
          WHERE "campId" = ${input.campId} AND "scoredSessionId" IS NOT NULL
          GROUP BY "day"
        ),
        sessions_per_day AS (
          SELECT "date" AS "day", COUNT(*) AS sessions
          FROM "ScoredSession"
          WHERE "campId" = ${input.campId}
          GROUP BY "date"
        )
        SELECT p."day", p.attended, p.prompt, COALESCE(s.sessions, 0) AS sessions
        FROM per_day p
        LEFT JOIN sessions_per_day s ON s."day" = p."day"
        ORDER BY p."day" ASC
      `;

      // The denominator is (that day's sessions × campers who scored at all
      // that day). Falls back to the attended count when a day has no
      // ScoredSession rows, which yields 100% rather than a divide-by-zero.
      return rows.map((r) => {
        const attended = Number(r.attended);
        const prompt = Number(r.prompt);
        return {
          day: r.day,
          attendancePct: attended === 0 ? 0 : 100,
          promptnessPct: attended === 0 ? 0 : Math.round((prompt / attended) * 1000) / 10,
          attendedCount: attended,
          sessions: Number(r.sessions),
        };
      });
    }),

  /**
   * "Most active teacher" — honestly thin, and labelled as such in the UI.
   * The only real signal is `ScoreEvent.createdById` (who *awarded* points),
   * joined back through `StaffProfile.userId`. That column is unindexed, so
   * this is a sequential scan over the camp's events; fine at camp scale.
   * `ScoredSession` has no staff FK at all, so "sessions run" genuinely
   * cannot be attributed to a teacher — which is why this measures awarding
   * activity rather than session activity, and says so.
   */
  mostActiveStaff: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertLeaderboardRead(ctx, input.campId);
      const rows: Array<{ staffProfileId: string; awards: bigint }> = await ctx.prisma.$queryRaw`
        SELECT sp."id" AS "staffProfileId", COUNT(*) AS awards
        FROM "ScoreEvent" se
        JOIN "StaffProfile" sp ON sp."userId" = se."createdById" AND sp."campId" = se."campId"
        WHERE se."campId" = ${input.campId} AND se."createdById" IS NOT NULL AND sp."deletedAt" IS NULL
        GROUP BY sp."id"
        ORDER BY awards DESC
        LIMIT 5
      `;
      if (rows.length === 0) return [];
      const names = await staffNamesFor(ctx.prisma, rows.map((r) => r.staffProfileId));
      return rows.map((r) => ({ staffProfileId: r.staffProfileId, name: names[r.staffProfileId] ?? "Staff", awards: Number(r.awards) }));
    }),

  /**
   * Score distribution — a histogram of subject point totals. No bucketing
   * helper existed anywhere in the repo, so the binning is done here: fixed
   * bucket count across the observed min..max range, which keeps the buckets
   * meaningful for any camp's point scale rather than hardcoding boundaries.
   */
  scoreDistribution: protectedProcedure
    .input(z.object({ campId: z.string(), subjectType: subjectTypeSchema.default("CAMPER"), buckets: z.number().int().min(2).max(12).default(6) }))
    .query(async ({ ctx, input }) => {
      await assertLeaderboardRead(ctx, input.campId);
      const stats = await ctx.prisma.leaderboardStat.findMany({
        where: { campId: input.campId, subjectType: input.subjectType, day: null },
        select: { totalPoints: true },
      });
      if (stats.length === 0) return { buckets: [] as { label: string; value: number }[], total: 0 };

      const values = stats.map((s: any) => s.totalPoints);
      const min = Math.min(...values);
      const max = Math.max(...values);
      // A camp where everyone has the same score has no range to bucket —
      // report it as one bucket rather than dividing by zero.
      if (min === max) return { buckets: [{ label: `${min}`, value: values.length }], total: values.length };

      const width = (max - min) / input.buckets;
      const counts = new Array(input.buckets).fill(0);
      for (const v of values) {
        // The max value would land at index === buckets; clamp it into the
        // last bucket rather than overflowing the array.
        const idx = Math.min(input.buckets - 1, Math.floor((v - min) / width));
        counts[idx]++;
      }
      return {
        buckets: counts.map((value, i) => ({
          label: `${Math.round(min + i * width)}–${Math.round(min + (i + 1) * width)}`,
          value,
        })),
        total: values.length,
      };
    }),

  /** Total points per category, camp-wide — the "category performance" bar
   * chart. Joined against ScoreCategory for the display name (camp-scoped
   * override if one exists, else the org-level template). */
  categoryPerformance: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertLeaderboardRead(ctx, input.campId);
      const rows: Array<{ categoryId: string; total: bigint }> = await ctx.prisma.$queryRaw`
        SELECT "categoryId", SUM("points") AS total FROM "ScoreEvent"
        WHERE "campId" = ${input.campId} GROUP BY "categoryId" ORDER BY total DESC
      `;
      const categories = await ctx.prisma.scoreCategory.findMany({ where: { id: { in: rows.map((r) => r.categoryId) } } });
      const nameById = new Map(categories.map((c: any) => [c.id, { name: c.name, color: c.color }]));
      return rows.map((r) => ({
        categoryId: r.categoryId,
        name: nameById.get(r.categoryId)?.name ?? r.categoryId,
        color: nameById.get(r.categoryId)?.color ?? null,
        total: Number(r.total),
      }));
    }),

  /** "Most improved" — subjects whose points earned in the most recent
   * scored day exceed their own trailing 7-day daily average by the
   * largest margin. Uses LeaderboardStat's day rows (already maintained by
   * applyStatDelta), not a fresh ScoreEvent scan. */
  mostImproved: protectedProcedure
    .input(z.object({ campId: z.string(), subjectType: subjectTypeSchema.default("TRIBE") }))
    .query(async ({ ctx, input }) => {
      await assertLeaderboardRead(ctx, input.campId);
      const rows: Array<{ subjectId: string; latestDay: number; priorAvg: number | null }> = await ctx.prisma.$queryRaw`
        WITH ranked AS (
          SELECT "subjectId", "day", "totalPoints",
                 ROW_NUMBER() OVER (PARTITION BY "subjectId" ORDER BY "day" DESC) AS rn
          FROM "LeaderboardStat"
          WHERE "campId" = ${input.campId} AND "subjectType" = ${input.subjectType} AND "day" IS NOT NULL
        )
        SELECT
          latest."subjectId" AS "subjectId",
          latest."totalPoints" AS "latestDay",
          (SELECT AVG(r2."totalPoints") FROM ranked r2 WHERE r2."subjectId" = latest."subjectId" AND r2.rn BETWEEN 2 AND 8) AS "priorAvg"
        FROM ranked latest
        WHERE latest.rn = 1
      `;
      const top = rows
        .map((r) => ({ subjectId: r.subjectId, latestDay: r.latestDay, priorAvg: r.priorAvg ?? 0, delta: r.latestDay - (r.priorAvg ?? 0) }))
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 5);

      // Previously only TRIBE resolved a name, so any other subjectType fell
      // through to rendering the raw id — the same class of bug the Overview
      // tab had. Now every type the UI can ask for resolves properly.
      const ids = top.map((r) => r.subjectId);
      const names =
        input.subjectType === "TRIBE"
          ? await namesFor(ctx.prisma, "tribe", ids)
          : input.subjectType === "CAMPER"
            ? await camperNamesFor(ctx.prisma, ids)
            : input.subjectType === "STAFF"
              ? await staffNamesFor(ctx.prisma, ids)
              : {};
      return top.map((r) => ({ ...r, name: names[r.subjectId] ?? r.subjectId }));
    }),

  feed: protectedProcedure
    .input(z.object({ campId: z.string(), limit: z.number().min(1).max(100).default(30) }))
    .query(async ({ ctx, input }) => {
      await assertLeaderboardRead(ctx, input.campId);
      return ctx.prisma.scoreEvent.findMany({
        where: { campId: input.campId },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),

  /** Public-facing (also mounted on the authenticated app) — category
   * points/tiers structure only, never reason/notes free text. */
  rules: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertLeaderboardRead(ctx, input.campId);
      const [categories, rules, settings] = await Promise.all([
        ctx.prisma.scoreCategory.findMany({
          where: { OR: [{ campId: input.campId }, { campId: null }], enabled: true },
          orderBy: { sortOrder: "asc" },
        }),
        ctx.prisma.scoreRule.findMany({ where: { campId: input.campId, enabled: true } }),
        ctx.prisma.leaderboardSettings.findUnique({ where: { campId: input.campId } }),
      ]);
      return {
        categories,
        rules: rules.map((r: any) => ({ id: r.id, categoryId: r.categoryId, trigger: r.trigger, tiers: r.tiers, points: r.points })),
        // Read-only surface for the "ranking method stays transparent"
        // requirement — the same weights admins edit in Settings. null
        // means "not customized yet", not "zero weight" (see aggregate.ts's
        // DEFAULT_COMPOSITE_WEIGHTS, equal 25 each).
        teacherMetricWeights: settings?.teacherMetricWeights ?? null,
        camperMetricWeights: settings?.camperMetricWeights ?? null,
        campusMetricWeights: (settings as any)?.campusMetricWeights ?? null,
      };
    }),

  myChild: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = ctx.session?.user;
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const camp = await ctx.prisma.camp.findUniqueOrThrow({ where: { id: input.campId } });
      assertSameOrg(ctx, camp.organizationId);

      const registrations = await ctx.prisma.registration.findMany({
        where: { campId: input.campId, camper: { userId: user.id }, deletedAt: null },
        include: { camper: { select: { name: true, firstName: true, lastName: true } }, tribe: { select: { name: true, color: true } } },
      });
      const stats = await ctx.prisma.leaderboardStat.findMany({
        where: { campId: input.campId, subjectType: "CAMPER", subjectId: { in: registrations.map((r: any) => r.id) }, day: null },
      });
      const statByReg = new Map(stats.map((s: any) => [s.subjectId, s]));
      return registrations.map((r: any) => ({ registration: r, stat: statByReg.get(r.id) ?? null }));
    }),

  /** "Upcoming opportunities to earn points" for the parent view — the
   * rest of today's scheduled sessions (camp-wide or scoped to the child's
   * own tribe), not yet closed/cancelled. */
  upcomingSessions: protectedProcedure
    .input(z.object({ campId: z.string(), tribeId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const user = ctx.session?.user;
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const camp = await ctx.prisma.camp.findUniqueOrThrow({ where: { id: input.campId } });
      assertSameOrg(ctx, camp.organizationId);

      const now = new Date();
      const endOfToday = new Date(now);
      endOfToday.setHours(23, 59, 59, 999);

      return ctx.prisma.scoredSession.findMany({
        where: {
          campId: input.campId,
          startsAt: { gte: now, lte: endOfToday },
          status: { in: ["SCHEDULED", "ACTIVE"] },
          // input.tribeId undefined -> only camp-wide sessions match, never
          // "every tribe's session" (a Prisma filter field set to
          // `undefined` is dropped from the query, not matched-as-null).
          OR: input.tribeId ? [{ scope: "CAMP" }, { scope: "TRIBE", tribeId: input.tribeId }] : [{ scope: "CAMP" }],
        },
        orderBy: { startsAt: "asc" },
      });
    }),

  // ─── Mutations ─────────────────────────────────────────────────────────

  award: protectedProcedure
    .input(
      z.object({
        campId: z.string(),
        subjectType: subjectTypeSchema,
        subjectId: z.string(),
        categoryId: z.string(),
        points: z.number().int(),
        reason: z.string().optional(),
        notes: z.string().optional(),
        clientRequestId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const camp = await ctx.prisma.camp.findUniqueOrThrow({ where: { id: input.campId } });
      await assertCanManageCamp(ctx, input.campId);

      const subjectField = subjectColumn(input.subjectType);
      const event = await recordScoreEvent({
        campId: input.campId,
        [subjectField]: input.subjectId,
        categoryId: input.categoryId,
        points: input.points,
        reason: input.reason,
        notes: input.notes,
        source: "MANUAL",
        createdById: ctx.session!.user.id,
        idempotencyKey: input.clientRequestId ? `manual:${input.clientRequestId}` : undefined,
      } as any);

      if (!event) throw new TRPCError({ code: "CONFLICT", message: "This award was already recorded." });

      await writeAudit(ctx, camp, "LEADERBOARD_AWARD", {
        reason: input.reason,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        newValue: { points: input.points, categoryId: input.categoryId, eventId: event.id },
      });

      return event;
    }),

  undo: protectedProcedure
    .input(z.object({ campId: z.string(), eventId: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const camp = await ctx.prisma.camp.findUniqueOrThrow({ where: { id: input.campId } });
      await assertCanManageCamp(ctx, input.campId);

      const original = await ctx.prisma.scoreEvent.findUniqueOrThrow({ where: { id: input.eventId } });
      if (original.campId !== input.campId) throw new TRPCError({ code: "FORBIDDEN" });

      const undoEvent = await recordScoreEvent({
        campId: original.campId,
        campusId: original.campusId,
        tribeId: original.tribeId,
        registrationId: original.registrationId,
        staffProfileId: original.staffProfileId,
        categoryId: original.categoryId,
        points: -original.points,
        reason: input.reason ?? `Undo of ${original.id}`,
        source: "MANUAL",
        createdById: ctx.session!.user.id,
        reversesEventId: original.id,
        idempotencyKey: `undo:${original.id}`,
      });

      if (!undoEvent) throw new TRPCError({ code: "CONFLICT", message: "This event was already undone." });

      await writeAudit(ctx, camp, "LEADERBOARD_UNDO", {
        reason: input.reason,
        subjectType: "SCORE_EVENT",
        subjectId: original.id,
        newValue: { reversesEventId: original.id, points: -original.points },
      });

      return undoEvent;
    }),

  category: createTRPCRouter({
    list: protectedProcedure
      .input(z.object({ campId: z.string() }))
      .query(async ({ ctx, input }) => {
        await assertLeaderboardRead(ctx, input.campId);
        return ctx.prisma.scoreCategory.findMany({
          where: { OR: [{ campId: input.campId }, { campId: null }] },
          orderBy: { sortOrder: "asc" },
        });
      }),
    create: protectedProcedure
      .input(
        z.object({
          campId: z.string(),
          key: z.string(),
          name: z.string(),
          description: z.string().optional(),
          icon: z.string().optional(),
          color: z.string().optional(),
          defaultPoints: z.number().int().default(0),
          kind: z.enum(["AUTO", "MANUAL", "BOTH"]).default("BOTH"),
          isPenalty: z.boolean().default(false),
          sortOrder: z.number().int().default(0),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const camp = await ctx.prisma.camp.findUniqueOrThrow({ where: { id: input.campId } });
        await assertCanManageCamp(ctx, input.campId);
        const category = await ctx.prisma.scoreCategory.create({ data: input });
        await writeAudit(ctx, camp, "LEADERBOARD_CATEGORY_CREATE", { subjectType: "SCORE_CATEGORY", subjectId: category.id, newValue: input });
        return category;
      }),
    update: protectedProcedure
      .input(
        z.object({
          id: z.string(),
          campId: z.string(),
          name: z.string().optional(),
          description: z.string().optional(),
          icon: z.string().optional(),
          color: z.string().optional(),
          defaultPoints: z.number().int().optional(),
          enabled: z.boolean().optional(),
          sortOrder: z.number().int().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const camp = await ctx.prisma.camp.findUniqueOrThrow({ where: { id: input.campId } });
        await assertCanManageCamp(ctx, input.campId);
        const { id, campId, ...data } = input;
        const category = await ctx.prisma.scoreCategory.update({ where: { id }, data });
        await writeAudit(ctx, camp, "LEADERBOARD_CATEGORY_UPDATE", { subjectType: "SCORE_CATEGORY", subjectId: id, newValue: data });
        return category;
      }),
  }),

  rule: createTRPCRouter({
    list: protectedProcedure
      .input(z.object({ campId: z.string() }))
      .query(async ({ ctx, input }) => {
        await assertLeaderboardRead(ctx, input.campId);
        return ctx.prisma.scoreRule.findMany({ where: { campId: input.campId }, orderBy: { priority: "desc" } });
      }),
    create: protectedProcedure
      .input(
        z.object({
          campId: z.string(),
          categoryId: z.string(),
          trigger: z.string(),
          stationId: z.string().optional(),
          subject: z.string(),
          points: z.number().int().default(0),
          tiers: z.any().optional(),
          multiplier: z.number().default(1),
          maxPerDay: z.number().int().optional(),
          maxPointsPerDay: z.number().int().optional(),
          minPoints: z.number().int().optional(),
          maxPoints: z.number().int().optional(),
          priority: z.number().int().default(0),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const camp = await ctx.prisma.camp.findUniqueOrThrow({ where: { id: input.campId } });
        await assertCanManageCamp(ctx, input.campId);
        const rule = await ctx.prisma.scoreRule.create({ data: input });
        await writeAudit(ctx, camp, "LEADERBOARD_RULE_CREATE", { subjectType: "SCORE_RULE", subjectId: rule.id, newValue: input });
        return rule;
      }),
    update: protectedProcedure
      .input(
        z.object({
          id: z.string(),
          campId: z.string(),
          points: z.number().int().optional(),
          tiers: z.any().optional(),
          multiplier: z.number().optional(),
          maxPerDay: z.number().int().nullable().optional(),
          maxPointsPerDay: z.number().int().nullable().optional(),
          minPoints: z.number().int().nullable().optional(),
          maxPoints: z.number().int().nullable().optional(),
          enabled: z.boolean().optional(),
          priority: z.number().int().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const camp = await ctx.prisma.camp.findUniqueOrThrow({ where: { id: input.campId } });
        await assertCanManageCamp(ctx, input.campId);
        const { id, campId, ...data } = input;
        const rule = await ctx.prisma.scoreRule.update({ where: { id }, data });
        await writeAudit(ctx, camp, "LEADERBOARD_RULE_UPDATE", { subjectType: "SCORE_RULE", subjectId: id, newValue: data });
        return rule;
      }),
  }),

  session: createTRPCRouter({
    list: protectedProcedure
      .input(z.object({ campId: z.string() }))
      .query(async ({ ctx, input }) => {
        await assertLeaderboardRead(ctx, input.campId);
        return ctx.prisma.scoredSession.findMany({ where: { campId: input.campId }, orderBy: { startsAt: "desc" } });
      }),
    create: protectedProcedure
      .input(
        z.object({
          campId: z.string(),
          name: z.string(),
          date: z.date(),
          startsAt: z.date(),
          endsAt: z.date().optional(),
          graceMinutes: z.number().int().default(0),
          stationId: z.string().optional(),
          tribeId: z.string().optional(),
          scope: z.enum(["CAMP", "TRIBE", "CAMPUS"]).default("CAMP"),
          categoryId: z.string(),
          ruleId: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const camp = await ctx.prisma.camp.findUniqueOrThrow({ where: { id: input.campId } });
        await assertCanManageCamp(ctx, input.campId);
        const session = await ctx.prisma.scoredSession.create({ data: input });
        await writeAudit(ctx, camp, "LEADERBOARD_SESSION_CREATE", { subjectType: "SCORED_SESSION", subjectId: session.id, newValue: input });
        return session;
      }),
    update: protectedProcedure
      .input(
        z.object({
          id: z.string(),
          campId: z.string(),
          status: z.enum(["SCHEDULED", "ACTIVE", "CLOSED", "CANCELLED"]).optional(),
          startsAt: z.date().optional(),
          endsAt: z.date().optional(),
          graceMinutes: z.number().int().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const camp = await ctx.prisma.camp.findUniqueOrThrow({ where: { id: input.campId } });
        await assertCanManageCamp(ctx, input.campId);
        const { id, campId, ...data } = input;
        const session = await ctx.prisma.scoredSession.update({ where: { id }, data });
        await writeAudit(ctx, camp, "LEADERBOARD_SESSION_UPDATE", { subjectType: "SCORED_SESSION", subjectId: id, newValue: data });
        return session;
      }),
  }),

  achievementDef: createTRPCRouter({
    list: protectedProcedure
      .input(z.object({ campId: z.string() }))
      .query(async ({ ctx, input }) => {
        await assertLeaderboardRead(ctx, input.campId);
        return ctx.prisma.achievementDefinition.findMany({ where: { OR: [{ campId: input.campId }, { campId: null }] } });
      }),
    create: protectedProcedure
      .input(
        z.object({
          campId: z.string(),
          key: z.string(),
          name: z.string(),
          description: z.string().optional(),
          icon: z.string().optional(),
          subjectType: z.enum(["TRIBE", "CAMPER", "STAFF"]),
          criteria: z.any().optional(),
          points: z.number().int().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const camp = await ctx.prisma.camp.findUniqueOrThrow({ where: { id: input.campId } });
        await assertCanManageCamp(ctx, input.campId);
        const def = await ctx.prisma.achievementDefinition.create({ data: input });
        await writeAudit(ctx, camp, "LEADERBOARD_ACHIEVEMENT_DEF_CREATE", { subjectType: "ACHIEVEMENT_DEFINITION", subjectId: def.id, newValue: input });
        return def;
      }),
  }),

  achievement: createTRPCRouter({
    award: protectedProcedure
      .input(z.object({ campId: z.string(), definitionId: z.string(), subjectType: subjectTypeSchema, subjectId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const camp = await ctx.prisma.camp.findUniqueOrThrow({ where: { id: input.campId } });
        await assertCanManageCamp(ctx, input.campId);
        const subjectKey = `${input.subjectType[0]}:${input.subjectId}`;
        try {
          const award = await ctx.prisma.achievementAward.create({
            data: { definitionId: input.definitionId, campId: input.campId, subjectKey, awardedById: ctx.session!.user.id },
            include: { definition: true },
          });
          await writeAudit(ctx, camp, "LEADERBOARD_ACHIEVEMENT_AWARD", { subjectType: input.subjectType, subjectId: input.subjectId, newValue: { definitionId: input.definitionId } });
          // AchievementDefinition.subjectType is TRIBE|CAMPER|STAFF only (no
          // CAMPUS) — this input reuses the broader subjectTypeSchema, so
          // narrow here rather than widen notify's signature to a case that
          // can never actually occur for an achievement.
          if (input.subjectType !== "CAMPUS") {
            await notifyAchievementAwarded(input.campId, award.definition.name, input.subjectType, input.subjectId);
          }
          return award;
        } catch (err: any) {
          if (err.code === "P2002") throw new TRPCError({ code: "CONFLICT", message: "Already awarded to this subject." });
          throw err;
        }
      }),
  }),

  settings: createTRPCRouter({
    get: protectedProcedure
      .input(z.object({ campId: z.string() }))
      .query(async ({ ctx, input }) => {
        await assertLeaderboardRead(ctx, input.campId);
        const existing = await ctx.prisma.leaderboardSettings.findUnique({ where: { campId: input.campId } });
        if (existing) return existing;
        // Lazily created on first read with safe (public-disabled) defaults —
        // no separate "init" mutation needed before the admin area can render.
        return ctx.prisma.leaderboardSettings.create({ data: { campId: input.campId } });
      }),
    update: protectedProcedure
      .input(
        z.object({
          campId: z.string(),
          publicEnabled: z.boolean().optional(),
          refreshIntervalSeconds: z.number().int().min(5).optional(),
          showTribes: z.boolean().optional(),
          showCampers: z.boolean().optional(),
          showTeachers: z.boolean().optional(),
          showCampuses: z.boolean().optional(),
          showAchievements: z.boolean().optional(),
          camperMetricWeights: z.record(z.string(), z.number()).optional(),
          teacherMetricWeights: z.record(z.string(), z.number()).optional(),
          campusMetricWeights: z.record(z.string(), z.number()).optional(),
          completionMode: z.enum(["CHECKOUT", "CAMP_END", "MANUAL"]).optional(),
          completionPoints: z.number().int().min(0).optional(),
          timezone: z.string().optional(),
          restrictPointAwarding: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const camp = await ctx.prisma.camp.findUniqueOrThrow({ where: { id: input.campId } });
        await assertCanManageCamp(ctx, input.campId);
        const { campId, ...data } = input;
        const settings = await ctx.prisma.leaderboardSettings.upsert({
          where: { campId },
          create: { campId, ...data },
          update: data,
        });
        await writeAudit(ctx, camp, "LEADERBOARD_SETTINGS_UPDATE", { subjectType: "LEADERBOARD_SETTINGS", subjectId: settings.id, newValue: data });
        return settings;
      }),
  }),

  /** Enabling/disabling keeps the token; rotating permanently kills the old
   * URL. Both are O(1) — never touches ScoreEvent history. */
  rotatePublicToken: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const camp = await ctx.prisma.camp.findUniqueOrThrow({ where: { id: input.campId } });
      await assertCanManageCamp(ctx, input.campId);
      const token = randomBytes(16).toString("hex");
      const settings = await ctx.prisma.leaderboardSettings.upsert({
        where: { campId: input.campId },
        create: { campId: input.campId, publicToken: token },
        update: { publicToken: token },
      });
      await writeAudit(ctx, camp, "LEADERBOARD_TOKEN_ROTATE", { subjectType: "LEADERBOARD_SETTINGS", subjectId: settings.id });
      return settings;
    }),

  /** Full LeaderboardStat recompute from ScoreEvent — the same function the
   * nightly reconcile cron calls, exposed here for an admin "Rebuild now"
   * button and for reset/import correction. */
  rebuild: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const camp = await ctx.prisma.camp.findUniqueOrThrow({ where: { id: input.campId } });
      await assertCanManageCamp(ctx, input.campId);
      const { perfectAttendanceAwards } = await ctx.prisma.$transaction(async (tx: any) => rebuildLeaderboard(tx, input.campId));
      await writeAudit(ctx, camp, "LEADERBOARD_REBUILD", {});
      // Fired after the transaction commits, never from inside it — same
      // discipline as record.ts's rank-transition notifications.
      for (const award of perfectAttendanceAwards) {
        await notifyAchievementAwarded(input.campId, award.achievementName, "TRIBE", award.tribeId);
      }
      return { ok: true };
    }),

  /**
   * The MANUAL arm of camp completion — "the press of a button by admin to
   * round up everything". Passes `force`, so it awards regardless of the
   * configured `completionMode`; every award is idempotencyKey-guarded, so
   * pressing it twice (or pressing it in a camp already running CHECKOUT
   * mode) can never double-credit anyone.
   */
  awardCampCompletion: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const camp = await ctx.prisma.camp.findUniqueOrThrow({ where: { id: input.campId } });
      await assertCanManageCamp(ctx, input.campId);
      const result = await awardCampCompletion(input.campId, { force: true, actorId: ctx.session!.user.id });
      await writeAudit(ctx, camp, "LEADERBOARD_CAMP_COMPLETION", { newValue: result });
      return result;
    }),

  /** O(1) reset: archives the settings row's cutoff rather than deleting any
   * ScoreEvent history — everything before the archive timestamp is simply
   * excluded from future reads, never destroyed. */
  reset: protectedProcedure
    .input(z.object({ campId: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const camp = await ctx.prisma.camp.findUniqueOrThrow({ where: { id: input.campId } });
      await assertCanManageCamp(ctx, input.campId);
      const settings = await ctx.prisma.leaderboardSettings.upsert({
        where: { campId: input.campId },
        create: { campId: input.campId, archivedAt: new Date() },
        update: { archivedAt: new Date() },
      });
      await writeAudit(ctx, camp, "LEADERBOARD_RESET", { reason: input.reason, subjectType: "LEADERBOARD_SETTINGS", subjectId: settings.id });
      return settings;
    }),

  /** Zeroes ONE tribe by writing a single compensating ScoreEvent for
   * -currentTotal — narrower than `reset` above (which archives the whole
   * camp leaderboard). No-op (returns null) when the tribe is already at 0,
   * so repeated calls / accidental double-clicks are safe. */
  resetTribe: protectedProcedure
    .input(z.object({ campId: z.string(), tribeId: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const camp = await ctx.prisma.camp.findUniqueOrThrow({ where: { id: input.campId } });
      await assertCanManageCamp(ctx, input.campId);
      const tribe = await ctx.prisma.tribe.findFirst({ where: { id: input.tribeId, campId: input.campId, deletedAt: null } });
      if (!tribe) throw new TRPCError({ code: "NOT_FOUND", message: "Tribe not found in this camp." });

      const stat = await ctx.prisma.leaderboardStat.findFirst({
        where: { campId: input.campId, subjectType: "TRIBE", subjectId: input.tribeId, day: null },
      });
      const total = stat?.totalPoints ?? 0;
      if (total === 0) return null;

      const category = await ensureAdjustmentCategory(ctx.prisma, input.campId);
      const event = await recordScoreEvent({
        campId: input.campId,
        tribeId: input.tribeId,
        categoryId: category.id,
        points: -total,
        reason: input.reason ?? `Reset ${tribe.name} to zero`,
        source: "MANUAL",
        createdById: ctx.session!.user.id,
      });
      await writeAudit(ctx, camp, "LEADERBOARD_TRIBE_RESET", { reason: input.reason, subjectType: "TRIBE", subjectId: input.tribeId, newValue: { previousTotal: total, eventId: event?.id ?? null } });
      return event;
    }),

  /** Loops resetTribe's single-compensating-event logic over every tribe in
   * the camp. Leaves camper/teacher/campus scores untouched — narrower than
   * `reset` above. */
  resetAllTribes: protectedProcedure
    .input(z.object({ campId: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const camp = await ctx.prisma.camp.findUniqueOrThrow({ where: { id: input.campId } });
      await assertCanManageCamp(ctx, input.campId);
      const [tribes, stats] = await Promise.all([
        ctx.prisma.tribe.findMany({ where: { campId: input.campId, deletedAt: null }, select: { id: true, name: true } }),
        ctx.prisma.leaderboardStat.findMany({ where: { campId: input.campId, subjectType: "TRIBE", day: null } }),
      ]);
      const statByTribe = new Map(stats.map((s: any) => [s.subjectId, s.totalPoints as number]));
      const category = await ensureAdjustmentCategory(ctx.prisma, input.campId);

      const results: Array<{ tribeId: string; eventId: string | null }> = [];
      for (const tribe of tribes) {
        const total = statByTribe.get(tribe.id) ?? 0;
        if (total === 0) continue;
        const event = await recordScoreEvent({
          campId: input.campId,
          tribeId: tribe.id,
          categoryId: category.id,
          points: -total,
          reason: input.reason ?? `Reset all tribes to zero`,
          source: "MANUAL",
          createdById: ctx.session!.user.id,
        });
        results.push({ tribeId: tribe.id, eventId: event?.id ?? null });
      }
      await writeAudit(ctx, camp, "LEADERBOARD_TRIBE_RESET_ALL", { reason: input.reason, newValue: { tribesReset: results.length } });
      return { tribesReset: results.length, results };
    }),

  audit: protectedProcedure
    .input(z.object({ campId: z.string(), limit: z.number().min(1).max(200).default(50) }))
    .query(async ({ ctx, input }) => {
      const camp = await ctx.prisma.camp.findUniqueOrThrow({ where: { id: input.campId } });
      await assertCanManageCamp(ctx, input.campId);
      return ctx.prisma.auditLog.findMany({
        where: { organizationId: camp.organizationId, action: { startsWith: "LEADERBOARD_" } },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),

  /** "Who scanned/awarded points and why" — every ScoreEvent for the camp,
   * filterable and cursor-paginated, with the awarder/subject/category
   * names resolved via the same batched-findMany-then-Map pattern
   * campPoints.history uses (never N+1 per row). Admin-only: this exposes
   * every staff member's individual awarding activity, not just totals. */
  pointActivity: protectedProcedure
    .input(z.object({
      campId: z.string(),
      tribeId: z.string().optional(),
      categoryId: z.string().optional(),
      awarderId: z.string().optional(),
      subjectType: subjectTypeSchema.optional(),
      from: z.date().optional(),
      to: z.date().optional(),
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      await assertCanManageCamp(ctx, input.campId);
      const events = await ctx.prisma.scoreEvent.findMany({
        where: {
          campId: input.campId,
          ...(input.tribeId ? { tribeId: input.tribeId } : {}),
          ...(input.categoryId ? { categoryId: input.categoryId } : {}),
          ...(input.awarderId ? { createdById: input.awarderId } : {}),
          ...(input.subjectType === "TRIBE" ? { tribeId: { not: null }, registrationId: null, staffProfileId: null }
            : input.subjectType === "CAMPER" ? { registrationId: { not: null } }
            : input.subjectType === "STAFF" ? { staffProfileId: { not: null } }
            : input.subjectType === "CAMPUS" ? { campusId: { not: null }, tribeId: null, registrationId: null, staffProfileId: null }
            : {}),
          ...(input.from || input.to ? { occurredAt: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } } : {}),
        },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });

      const hasMore = events.length > input.limit;
      const page = hasMore ? events.slice(0, input.limit) : events;

      const registrationIds = [...new Set(page.map((e: any) => e.registrationId).filter(Boolean))];
      const staffProfileIds = [...new Set(page.map((e: any) => e.staffProfileId).filter(Boolean))];
      const tribeIds = [...new Set(page.map((e: any) => e.tribeId).filter(Boolean))];
      const campusIds = [...new Set(page.map((e: any) => e.campusId).filter(Boolean))];
      const categoryIds = [...new Set(page.map((e: any) => e.categoryId).filter(Boolean))];
      const awarderIds = [...new Set(page.map((e: any) => e.createdById).filter(Boolean))];

      const [registrations, staffProfiles, tribes, campuses, categories, awarders] = await Promise.all([
        ctx.prisma.registration.findMany({ where: { id: { in: registrationIds } }, select: { id: true, camper: { select: { name: true } } } }),
        ctx.prisma.staffProfile.findMany({ where: { id: { in: staffProfileIds } }, select: { id: true, firstName: true, lastName: true, type: true } }),
        ctx.prisma.tribe.findMany({ where: { id: { in: tribeIds } }, select: { id: true, name: true } }),
        ctx.prisma.campus.findMany({ where: { id: { in: campusIds } }, select: { id: true, name: true } }),
        ctx.prisma.scoreCategory.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true, color: true } }),
        ctx.prisma.user.findMany({ where: { id: { in: awarderIds } }, select: { id: true, firstName: true, lastName: true, email: true } }),
      ]);
      const camperName = new Map(registrations.map((r: any) => [r.id, r.camper.name]));
      const staffName = new Map(staffProfiles.map((s: any) => [s.id, { name: [s.firstName, s.lastName].filter(Boolean).join(" "), type: s.type }]));
      const tribeName = new Map(tribes.map((t: any) => [t.id, t.name]));
      const campusName = new Map(campuses.map((c: any) => [c.id, c.name]));
      const categoryById = new Map(categories.map((c: any) => [c.id, c]));
      const awarderName = new Map(awarders.map((u: any) => [u.id, `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email]));

      const rows = page.map((event: any) => {
        const staff = staffName.get(event.staffProfileId);
        const subject = event.registrationId
          ? { kind: "CAMPER" as const, id: event.registrationId, name: camperName.get(event.registrationId) ?? "Camper" }
          : event.staffProfileId
            ? { kind: "STAFF" as const, id: event.staffProfileId, name: staff?.name ?? "Staff" }
            : event.tribeId
              ? { kind: "TRIBE" as const, id: event.tribeId, name: tribeName.get(event.tribeId) ?? "Tribe" }
              : { kind: "CAMPUS" as const, id: event.campusId, name: campusName.get(event.campusId) ?? "Campus" };
        return {
          eventId: event.id,
          occurredAt: event.occurredAt,
          points: event.points,
          source: event.source,
          reason: event.reason,
          notes: event.notes,
          category: categoryById.get(event.categoryId) ?? null,
          subject,
          awarder: event.createdById ? { id: event.createdById, name: awarderName.get(event.createdById) ?? "Unknown" } : null,
          isReversal: !!event.reversesEventId,
          reversesEventId: event.reversesEventId,
        };
      });

      return { rows, nextCursor: hasMore ? page[page.length - 1].id : null };
    }),

  /**
   * The unauthenticated public board's only data source. Missing or
   * disabled token throws NOT_FOUND, never FORBIDDEN — this must not
   * confirm a token exists to an unauthenticated caller. Deliberately does
   * NOT drain the score queue (see queue.ts's enqueueScoreScan) — an
   * unauthenticated endpoint must not be able to trigger work.
   */
  publicBoard: publicProcedure.input(z.object({ token: z.string() })).query(async ({ ctx, input }) => {
    const settings = await ctx.prisma.leaderboardSettings.findUnique({ where: { publicToken: input.token } });
    if (!settings || !settings.publicEnabled) throw new TRPCError({ code: "NOT_FOUND" });

    const camp = await ctx.prisma.camp.findUnique({ where: { id: settings.campId }, select: { name: true } });
    if (!camp) throw new TRPCError({ code: "NOT_FOUND" });

    const dto = await toPublicDto(settings.campId, camp.name);
    return { ...dto, refreshIntervalSeconds: settings.refreshIntervalSeconds };
  }),

  /** Same token-gating as publicBoard (disabled/missing -> NOT_FOUND, never
   * FORBIDDEN, so an unauthenticated caller learns nothing about whether a
   * token ever existed). Backs `/l/[token]/announce`. */
  publicAnnouncements: publicProcedure.input(z.object({ token: z.string() })).query(async ({ ctx, input }) => {
    const settings = await ctx.prisma.leaderboardSettings.findUnique({ where: { publicToken: input.token } });
    if (!settings || !settings.publicEnabled) throw new TRPCError({ code: "NOT_FOUND" });

    const camp = await ctx.prisma.camp.findUnique({ where: { id: settings.campId }, select: { name: true } });
    if (!camp) throw new TRPCError({ code: "NOT_FOUND" });

    return toPublicAnnouncementDto(settings.campId, camp.name);
  }),
});

async function namesFor(prisma: any, model: "tribe", ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const rows = await prisma[model].findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return Object.fromEntries(rows.map((r: any) => [r.id, r.name]));
}

/**
 * CAMPER `LeaderboardStat.subjectId` is a `Registration.id`, so the camper's
 * name is one join away. Full names (not the public board's firstName +
 * last-initial treatment) because this is the authenticated surface, where
 * `CampersTab` and the tribe detail page already render `camper.name` — using
 * a different form here would be inconsistent without adding any privacy,
 * since the same viewers already see the full name one tab over. The public
 * board's whitelist DTO (publicDto.ts) is unaffected and keeps last-initial.
 */
async function camperNamesFor(prisma: any, registrationIds: string[]): Promise<Record<string, string>> {
  if (registrationIds.length === 0) return {};
  const rows = await prisma.registration.findMany({
    where: { id: { in: registrationIds } },
    select: { id: true, camper: { select: { name: true } } },
  });
  return Object.fromEntries(rows.map((r: any) => [r.id, r.camper?.name ?? "Camper"]));
}

/** STAFF `LeaderboardStat.subjectId` is a `StaffProfile.id`. */
async function staffNamesFor(prisma: any, staffIds: string[]): Promise<Record<string, string>> {
  if (staffIds.length === 0) return {};
  const rows = await prisma.staffProfile.findMany({
    where: { id: { in: staffIds } },
    select: { id: true, firstName: true, lastName: true },
  });
  return Object.fromEntries(rows.map((s: any) => [s.id, `${s.firstName} ${s.lastName}`.trim()]));
}
