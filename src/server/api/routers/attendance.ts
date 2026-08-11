import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import { markAttendance, AttendanceError } from "../../attendance/engine";
import { getCampPointsAccess, assertScope } from "../../campPoints/access";

async function attendanceAccess(ctx: any, campId: string, tribeId?: string | null, campusId?: string | null) {
  const access = await getCampPointsAccess(ctx, campId);
  if (!access.canTakeAttendance) throw new TRPCError({ code: "FORBIDDEN" });
  assertScope(access, { tribeId, campusId }, "ATTENDANCE");
  return access;
}

async function sessionAccess(ctx: any, session: any) {
  const access = await attendanceAccess(ctx, session.campId, session.tribeId, session.campusId);
  if (!access.isAdmin && access.staffProfile?.type === "VOLUNTEER" && !session.allowVolunteerAccess) {
    throw new TRPCError({ code: "FORBIDDEN", message: "This session is not open to volunteers." });
  }
  return access;
}

async function resolveAttendanceScoring(ctx: any, campId: string, lateAfterMinutes: number) {
  const categories = await ctx.prisma.scoreCategory.findMany({
    where: { enabled: true, OR: [{ campId }, { campId: null }], key: { equals: "ATTENDANCE", mode: "insensitive" } },
    orderBy: { campId: "desc" },
  });
  const category = categories.find((row: any) => row.campId === campId) ?? categories[0] ?? null;
  if (!category) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Attendance point category is missing." });

  let rule = await ctx.prisma.scoreRule.findFirst({
    where: { campId, categoryId: category.id, enabled: true, trigger: { in: ["SESSION", "SCAN"] } },
    orderBy: { priority: "desc" },
  });
  if (!rule) {
    const presentPoints = category.defaultPoints || 10;
    rule = await ctx.prisma.scoreRule.create({ data: {
      campId,
      categoryId: category.id,
      trigger: "SESSION",
      subject: "REGISTRATION",
      points: presentPoints,
      tiers: [
        { maxMinutesLate: lateAfterMinutes, points: presentPoints },
        { maxMinutesLate: null, points: Math.max(1, Math.round(presentPoints / 2)) },
      ],
    } });
  }
  return { category, rule };
}

const sessionInclude = { records: { include: { registration: { include: { camper: true } } } } } as const;
const eligibleStatus: any = { in: ["APPROVED", "CHECKED_IN", "COMPLETED"] };

export const attendanceRouter = createTRPCRouter({
  createSession: protectedProcedure
    .input(z.object({
      campId: z.string(), organizationId: z.string(), name: z.string().min(1), date: z.date(), startsAt: z.date().optional(),
      lateAfterMinutes: z.number().int().min(0).max(240).default(10), tribeId: z.string().optional(), campusId: z.string().optional(),
      venueId: z.string().optional(), allowVolunteerAccess: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const access = await attendanceAccess(ctx, input.campId, input.tribeId, input.campusId);
      const camp = await ctx.prisma.camp.findUnique({ where: { id: input.campId }, select: { organizationId: true } });
      if (!camp || camp.organizationId !== input.organizationId) throw new TRPCError({ code: "NOT_FOUND", message: "Camp not found in this organization." });
      const startsAt = input.startsAt ?? input.date;
      const { category, rule } = await resolveAttendanceScoring(ctx, input.campId, input.lateAfterMinutes);

      return ctx.prisma.$transaction(async (tx: any) => {
        const scored = await tx.scoredSession.create({ data: {
          campId: input.campId, name: input.name, date: input.date, startsAt, graceMinutes: input.lateAfterMinutes,
          tribeId: input.tribeId, campusId: input.campusId,
          scope: input.tribeId ? "TRIBE" : input.campusId ? "CAMPUS" : "CAMP",
          categoryId: category.id, ruleId: rule.id, createdById: ctx.userId, status: "ACTIVE",
        } });
        return tx.attendanceSession.create({ data: {
          campId: input.campId, name: input.name, date: input.date, startsAt, lateAfterMinutes: input.lateAfterMinutes,
          tribeId: input.tribeId, campusId: input.campusId, venueId: input.venueId, createdById: ctx.userId,
          allowVolunteerAccess: access.staffProfile?.type === "VOLUNTEER" ? true : input.allowVolunteerAccess,
          scoredSessionId: scored.id,
        } });
      });
    }),

  listSessions: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string(), tribeId: z.string().optional(), campusId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      await attendanceAccess(ctx, input.campId, input.tribeId, input.campusId);
      return ctx.prisma.attendanceSession.findMany({
        where: { campId: input.campId, ...(input.tribeId ? { tribeId: input.tribeId } : {}), ...(input.campusId ? { campusId: input.campusId } : {}) },
        include: { records: true }, orderBy: { date: "desc" },
      });
    }),

  rosterForScope: protectedProcedure
    .input(z.object({ campId: z.string(), tribeId: z.string().optional(), campusId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      await attendanceAccess(ctx, input.campId, input.tribeId, input.campusId);
      return ctx.prisma.registration.findMany({
        where: { campId: input.campId, status: eligibleStatus, deletedAt: null, ...(input.tribeId ? { tribeId: input.tribeId } : {}), ...(input.campusId ? { campusId: input.campusId } : {}) },
        include: { camper: true, tribe: { select: { name: true } }, campus: { select: { name: true } } },
        orderBy: { camper: { name: "asc" } },
      });
    }),

  rosterForTribe: protectedProcedure
    .input(z.object({ tribeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const tribe = await ctx.prisma.tribe.findUnique({ where: { id: input.tribeId }, select: { campId: true } });
      if (!tribe) throw new TRPCError({ code: "NOT_FOUND" });
      await attendanceAccess(ctx, tribe.campId, input.tribeId);
      return ctx.prisma.registration.findMany({
        where: { campId: tribe.campId, tribeId: input.tribeId, status: eligibleStatus, deletedAt: null },
        include: { camper: true }, orderBy: { camper: { name: "asc" } },
      });
    }),

  sessionDetail: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const session = await ctx.prisma.attendanceSession.findUnique({ where: { id: input.id }, include: sessionInclude });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      await sessionAccess(ctx, session);
      return session;
    }),

  recordAttendance: protectedProcedure
    .input(z.object({ sessionId: z.string(), records: z.array(z.object({ registrationId: z.string(), status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]) })) }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.attendanceSession.findUnique({ where: { id: input.sessionId } });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      await sessionAccess(ctx, session);
      for (const record of input.records) {
        await markAttendance({ sessionId: session.id, registrationId: record.registrationId, status: record.status, source: "MANUAL", actorId: ctx.userId });
      }
      return { count: input.records.length };
    }),

  mark: protectedProcedure
    .input(z.object({ sessionId: z.string(), registrationId: z.string(), status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]).optional(), source: z.enum(["QR", "SEARCH", "MANUAL", "OFFLINE"]), occurredAt: z.date().optional() }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.attendanceSession.findUnique({ where: { id: input.sessionId } });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      await sessionAccess(ctx, session);
      try { return await markAttendance({ ...input, actorId: ctx.userId }); }
      catch (error) {
        if (error instanceof AttendanceError) throw new TRPCError({ code: error.code === "CONFLICT" ? "CONFLICT" : error.code === "FORBIDDEN" ? "FORBIDDEN" : "NOT_FOUND", message: error.message });
        throw error;
      }
    }),

  resolveAndMark: protectedProcedure
    .input(z.object({ sessionId: z.string(), qrToken: z.string().optional(), query: z.string().optional(), source: z.enum(["QR", "SEARCH", "OFFLINE"]), occurredAt: z.date().optional() }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.attendanceSession.findUnique({ where: { id: input.sessionId } });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      await sessionAccess(ctx, session);
      const token = input.qrToken?.trim();
      const query = input.query?.trim();
      if (!token && !query) throw new TRPCError({ code: "BAD_REQUEST", message: "Scan a QR code or enter a camper search." });
      const matches = await ctx.prisma.registration.findMany({
        where: {
          campId: session.campId, deletedAt: null, status: eligibleStatus,
          ...(session.tribeId ? { tribeId: session.tribeId } : {}), ...(session.campusId ? { campusId: session.campusId } : {}),
          OR: token
            ? [{ qrToken: token }, { registrationNumber: token }]
            : [{ registrationNumber: { contains: query, mode: "insensitive" } }, { camper: { name: { contains: query, mode: "insensitive" } } }],
        },
        include: { camper: { select: { name: true } } }, take: 2, orderBy: { registrationNumber: "asc" },
      });
      if (!matches.length) throw new TRPCError({ code: "NOT_FOUND", message: "No eligible camper found for this session." });
      if (!token && matches.length > 1) throw new TRPCError({ code: "CONFLICT", message: "More than one camper matches. Search more specifically." });
      const match = matches[0] as any;
      const record = await markAttendance({ sessionId: session.id, registrationId: match.id, source: input.source, actorId: ctx.userId, occurredAt: input.occurredAt });
      return { record, camper: match.camper };
    }),

  closeSession: protectedProcedure
    .input(z.object({ sessionId: z.string(), markRemainingAbsent: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.attendanceSession.findUnique({ where: { id: input.sessionId } });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      await sessionAccess(ctx, session);
      if (input.markRemainingAbsent) {
        const registrations = await ctx.prisma.registration.findMany({
          where: {
            campId: session.campId, ...(session.tribeId ? { tribeId: session.tribeId } : {}), ...(session.campusId ? { campusId: session.campusId } : {}),
            deletedAt: null, status: eligibleStatus, attendanceRecords: { none: { sessionId: session.id } },
          }, select: { id: true },
        });
        for (const registration of registrations) await markAttendance({ sessionId: session.id, registrationId: registration.id, status: "ABSENT", source: "MANUAL", actorId: ctx.userId });
      }
      await ctx.prisma.attendanceSession.update({ where: { id: session.id }, data: { status: "CLOSED", closedAt: new Date(), closedById: ctx.userId } });
      if (session.scoredSessionId) await ctx.prisma.scoredSession.update({ where: { id: session.scoredSessionId }, data: { status: "CLOSED", endsAt: new Date() } });
      return { success: true };
    }),

  todaySummary: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string() }))
    .query(async ({ ctx, input }) => {
      const access = await getCampPointsAccess(ctx, input.campId);
      const tribeId = access.staffProfile?.assignedTribeId;
      if (!tribeId) return { total: 0, present: 0, absent: 0, late: 0 };
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(); end.setHours(23, 59, 59, 999);
      const session = await ctx.prisma.attendanceSession.findFirst({ where: { campId: input.campId, tribeId, date: { gte: start, lte: end } }, include: { records: true } });
      if (!session) return { total: 0, present: 0, absent: 0, late: 0 };
      return {
        total: session.records.length,
        present: session.records.filter((record: any) => record.status === "PRESENT").length,
        absent: session.records.filter((record: any) => record.status === "ABSENT").length,
        late: session.records.filter((record: any) => record.status === "LATE").length,
      };
    }),
});
