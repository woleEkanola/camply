import { z } from "zod";
import { randomBytes } from "crypto";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { assertSameOrg, assertCanManageCamp } from "../trpc/scoping";
import { assertReportsAccess } from "./scan";
import { recordScoreEvent } from "../../leaderboard/record";
import { rebuildLeaderboard } from "../../leaderboard/aggregate";
import { drainScoreQueue } from "../../leaderboard/queue";

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

export const leaderboardRouter = createTRPCRouter({
  // ─── Reads ─────────────────────────────────────────────────────────────

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

      const tribeNames = await namesFor(ctx.prisma, "tribe", topTribes.map((t: any) => t.subjectId));

      return {
        championTribe: topTribes[0] ? { ...topTribes[0], name: tribeNames[topTribes[0].subjectId] } : null,
        topTribes: topTribes.map((t: any) => ({ ...t, name: tribeNames[t.subjectId] })),
        topCampers,
        topStaff,
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

  tribeDetail: protectedProcedure
    .input(z.object({ campId: z.string(), tribeId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertLeaderboardRead(ctx, input.campId);
      const [tribe, stat, timeline, achievements] = await Promise.all([
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
      ]);
      return { tribe, stat, timeline, achievements };
    }),

  campers: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertLeaderboardRead(ctx, input.campId);
      const stats = await ctx.prisma.leaderboardStat.findMany({
        where: { campId: input.campId, subjectType: "CAMPER", day: null },
        orderBy: { totalPoints: "desc" },
        take: 100,
      });
      const registrations = await ctx.prisma.registration.findMany({
        where: { id: { in: stats.map((s: any) => s.subjectId) } },
        include: { camper: { select: { name: true, firstName: true, lastName: true } }, tribe: { select: { name: true, color: true } } },
      });
      const regById = new Map(registrations.map((r: any) => [r.id, r]));
      return stats.map((s: any) => ({ stat: s, registration: regById.get(s.subjectId) ?? null }));
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
      const stats = await ctx.prisma.leaderboardStat.findMany({
        where: { campId: input.campId, subjectType: "CAMPUS", day: null },
        orderBy: { totalPoints: "desc" },
      });
      const campuses = await ctx.prisma.campus.findMany({ where: { id: { in: stats.map((s: any) => s.subjectId) } } });
      const campusById = new Map(campuses.map((c: any) => [c.id, c]));
      return stats.map((s: any) => ({ stat: s, campus: campusById.get(s.subjectId) ?? null }));
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

      const names =
        input.subjectType === "TRIBE"
          ? await namesFor(ctx.prisma, "tribe", top.map((r) => r.subjectId))
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
      const [categories, rules] = await Promise.all([
        ctx.prisma.scoreCategory.findMany({
          where: { OR: [{ campId: input.campId }, { campId: null }], enabled: true },
          orderBy: { sortOrder: "asc" },
        }),
        ctx.prisma.scoreRule.findMany({ where: { campId: input.campId, enabled: true } }),
      ]);
      return { categories, rules: rules.map((r: any) => ({ id: r.id, categoryId: r.categoryId, trigger: r.trigger, tiers: r.tiers, points: r.points })) };
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
          });
          await writeAudit(ctx, camp, "LEADERBOARD_ACHIEVEMENT_AWARD", { subjectType: input.subjectType, subjectId: input.subjectId, newValue: { definitionId: input.definitionId } });
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
          camperMetricWeights: z.any().optional(),
          teacherMetricWeights: z.any().optional(),
          timezone: z.string().optional(),
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
      await ctx.prisma.$transaction(async (tx: any) => rebuildLeaderboard(tx, input.campId));
      await writeAudit(ctx, camp, "LEADERBOARD_REBUILD", {});
      return { ok: true };
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
});

async function namesFor(prisma: any, model: "tribe", ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const rows = await prisma[model].findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return Object.fromEntries(rows.map((r: any) => [r.id, r.name]));
}
