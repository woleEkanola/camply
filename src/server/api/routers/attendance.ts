import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import {
  markAttendance,
  markStaffAttendance,
  deleteAttendanceRecord,
  deleteStaffAttendanceRecord,
  reopenAttendanceSession,
  deleteAttendanceSession,
  clearAutoAbsent,
  AttendanceError,
} from "../../attendance/engine";
import { getCampPointsAccess, assertScope } from "../../campPoints/access";
import { normalizeScannedQRToken } from "../../../lib/qr";

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

const audienceSchema = z.enum(["CAMPER", "TEACHER", "VOLUNTEER", "ALL_STAFF"]);
const sessionInclude = {
  records: { where: { deletedAt: null }, include: { registration: { include: { camper: true } } } },
  staffRecords: { where: { deletedAt: null }, include: { staffProfile: true } },
} as const;
const eligibleStatus: any = { in: ["APPROVED", "CHECKED_IN", "COMPLETED"] };

export const attendanceRouter = createTRPCRouter({
  createSession: protectedProcedure
    .input(z.object({
      campId: z.string(), organizationId: z.string(), name: z.string().min(1), date: z.date(), startsAt: z.date().optional(),
      lateAfterMinutes: z.number().int().min(0).max(240).default(10), tribeId: z.string().optional(), campusId: z.string().optional(),
      venueId: z.string().optional(), allowVolunteerAccess: z.boolean().default(false),
      audience: audienceSchema.default("CAMPER"),
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
          subjectAudience: input.audience,
        } });
        return tx.attendanceSession.create({ data: {
          campId: input.campId, name: input.name, date: input.date, startsAt, lateAfterMinutes: input.lateAfterMinutes,
          tribeId: input.tribeId, campusId: input.campusId, venueId: input.venueId, createdById: ctx.userId,
          allowVolunteerAccess: access.staffProfile?.type === "VOLUNTEER" ? true : input.allowVolunteerAccess,
          audience: input.audience,
          scoredSessionId: scored.id,
        } });
      });
    }),

  listSessions: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string(), tribeId: z.string().optional(), campusId: z.string().optional(), audience: audienceSchema.optional() }))
    .query(async ({ ctx, input }) => {
      await attendanceAccess(ctx, input.campId, input.tribeId, input.campusId);
      return ctx.prisma.attendanceSession.findMany({
        where: { campId: input.campId, deletedAt: null, ...(input.tribeId ? { tribeId: input.tribeId } : {}), ...(input.campusId ? { campusId: input.campusId } : {}), ...(input.audience ? { audience: input.audience } : {}) },
        include: { records: { where: { deletedAt: null } }, staffRecords: { where: { deletedAt: null } } }, orderBy: { date: "desc" },
      });
    }),

  rosterForScope: protectedProcedure
    .input(z.object({ campId: z.string(), tribeId: z.string().optional(), campusId: z.string().optional(), audience: audienceSchema.default("CAMPER") }))
    .query(async ({ ctx, input }) => {
      await attendanceAccess(ctx, input.campId, input.tribeId, input.campusId);
      if (input.audience !== "CAMPER") return ctx.prisma.staffProfile.findMany({
        where: { campId: input.campId, status: "APPROVED", deletedAt: null, ...(input.audience === "ALL_STAFF" ? {} : { type: input.audience }), ...(input.tribeId ? { assignedTribeId: input.tribeId } : {}), ...(input.campusId ? { preferredCampusId: input.campusId } : {}) },
        select: { id: true, firstName: true, lastName: true, preferredName: true, type: true, qrToken: true, assignedTribeId: true, preferredCampusId: true },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      });
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
    .input(z.object({ sessionId: z.string(), registrationId: z.string().optional(), staffProfileId: z.string().optional(), status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]).optional(), source: z.enum(["QR", "SEARCH", "MANUAL", "OFFLINE"]), occurredAt: z.date().optional() }).refine((value) => !!value.registrationId !== !!value.staffProfileId, "Provide exactly one attendance subject."))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.attendanceSession.findUnique({ where: { id: input.sessionId } });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      await sessionAccess(ctx, session);
      try {
        return input.staffProfileId
          ? await markStaffAttendance({ sessionId: input.sessionId, staffProfileId: input.staffProfileId, status: input.status, source: input.source, occurredAt: input.occurredAt, actorId: ctx.userId })
          : await markAttendance({ sessionId: input.sessionId, registrationId: input.registrationId!, status: input.status, source: input.source, occurredAt: input.occurredAt, actorId: ctx.userId });
      }
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
      if (session.audience !== "CAMPER") {
        const normalized = token ? normalizeScannedQRToken(token) : undefined;
        const matches = await ctx.prisma.staffProfile.findMany({
          where: { campId: session.campId, deletedAt: null, status: "APPROVED", ...(session.audience === "ALL_STAFF" ? {} : { type: session.audience as any }), ...(session.tribeId ? { assignedTribeId: session.tribeId } : {}), ...(session.campusId ? { preferredCampusId: session.campusId } : {}), OR: normalized ? [{ qrToken: normalized }, { id: normalized }] : [{ firstName: { contains: query, mode: "insensitive" } }, { lastName: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }] },
          take: 2,
        });
        if (!matches.length) throw new TRPCError({ code: "NOT_FOUND", message: "No eligible staff member found for this session." });
        if (!token && matches.length > 1) throw new TRPCError({ code: "CONFLICT", message: "More than one staff member matches. Search more specifically." });
        const match = matches[0];
        const record = await markStaffAttendance({ sessionId: session.id, staffProfileId: match.id, source: input.source, actorId: ctx.userId, occurredAt: input.occurredAt });
        return { record, subject: { id: match.id, name: `${match.preferredName || match.firstName} ${match.lastName}`.trim(), type: match.type }, camper: null };
      }
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
      return { record, camper: match.camper, subject: { id: match.id, name: match.camper.name, type: "CAMPER" as const } };
    }),

  closeSession: protectedProcedure
    .input(z.object({ sessionId: z.string(), markRemainingAbsent: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.attendanceSession.findUnique({ where: { id: input.sessionId } });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      await sessionAccess(ctx, session);
      if (input.markRemainingAbsent) {
        if (session.audience !== "CAMPER") {
          const staff = await ctx.prisma.staffProfile.findMany({ where: { campId: session.campId, status: "APPROVED", deletedAt: null, ...(session.audience === "ALL_STAFF" ? {} : { type: session.audience as any }), ...(session.tribeId ? { assignedTribeId: session.tribeId } : {}), ...(session.campusId ? { preferredCampusId: session.campusId } : {}), attendanceRecords: { none: { sessionId: session.id, deletedAt: null } } }, select: { id: true } });
          for (const person of staff) await markStaffAttendance({ sessionId: session.id, staffProfileId: person.id, status: "ABSENT", source: "MANUAL", actorId: ctx.userId, autoAbsent: true });
        } else {
        const registrations = await ctx.prisma.registration.findMany({
          where: {
            campId: session.campId, ...(session.tribeId ? { tribeId: session.tribeId } : {}), ...(session.campusId ? { campusId: session.campusId } : {}),
            deletedAt: null, status: eligibleStatus, attendanceRecords: { none: { sessionId: session.id, deletedAt: null } },
          }, select: { id: true },
        });
        for (const registration of registrations) await markAttendance({ sessionId: session.id, registrationId: registration.id, status: "ABSENT", source: "MANUAL", actorId: ctx.userId, autoAbsent: true });
        }
      }
      await ctx.prisma.attendanceSession.update({ where: { id: session.id }, data: { status: "CLOSED", closedAt: new Date(), closedById: ctx.userId } });
      if (session.scoredSessionId) await ctx.prisma.scoredSession.update({ where: { id: session.scoredSessionId }, data: { status: "CLOSED", endsAt: new Date() } });
      return { success: true };
    }),

  todaySummary: protectedProcedure
    .input(z.object({ organizationId: z.string().optional(), campId: z.string().optional().nullable() }))
    .query(async ({ ctx, input }) => {
      if (!input.campId) return { total: 0, present: 0, absent: 0, late: 0 };
      try {
        const access = await getCampPointsAccess(ctx, input.campId);
        const tribeId = access.staffProfile?.assignedTribeId;
        if (!tribeId) return { total: 0, present: 0, absent: 0, late: 0 };
        const start = new Date(); start.setHours(0, 0, 0, 0);
        const end = new Date(); end.setHours(23, 59, 59, 999);
        const session = await ctx.prisma.attendanceSession.findFirst({ where: { campId: input.campId, tribeId, date: { gte: start, lte: end } }, include: { records: { where: { deletedAt: null } } } });
        if (!session) return { total: 0, present: 0, absent: 0, late: 0 };
        return {
          total: session.records.length,
          present: session.records.filter((record: any) => record.status === "PRESENT").length,
          absent: session.records.filter((record: any) => record.status === "ABSENT").length,
          late: session.records.filter((record: any) => record.status === "LATE").length,
        };
      } catch {
        return { total: 0, present: 0, absent: 0, late: 0 };
      }
    }),

  // ─── Normalization: delete / reopen / clear-sweep ─────────────────────
  // All admin-only (assertScope's "ATTENDANCE" gate below requires
  // access.isAdmin OR the session's own tribe/campus scope — see
  // campPoints/access.ts). See the plan for why these are soft
  // deletes + void-by-compensation rather than hard deletes.

  deleteRecord: protectedProcedure
    .input(z.object({ sessionId: z.string(), recordId: z.string(), staff: z.boolean().default(false), reason: z.string().min(1, "A reason is required.") }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.attendanceSession.findUnique({ where: { id: input.sessionId } });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      const access = await sessionAccess(ctx, session);
      if (!access.isAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "Only an admin can delete an attendance record." });
      try {
        return input.staff
          ? await deleteStaffAttendanceRecord({ recordId: input.recordId, actorId: ctx.userId, reason: input.reason })
          : await deleteAttendanceRecord({ recordId: input.recordId, actorId: ctx.userId, reason: input.reason });
      } catch (error) {
        if (error instanceof AttendanceError) throw new TRPCError({ code: error.code === "CONFLICT" ? "CONFLICT" : error.code === "FORBIDDEN" ? "FORBIDDEN" : "NOT_FOUND", message: error.message });
        throw error;
      }
    }),

  reopenSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.attendanceSession.findUnique({ where: { id: input.sessionId } });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      const access = await sessionAccess(ctx, session);
      if (!access.isAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "Only an admin can reopen a closed session." });
      try {
        return await reopenAttendanceSession({ sessionId: input.sessionId, actorId: ctx.userId });
      } catch (error) {
        if (error instanceof AttendanceError) throw new TRPCError({ code: error.code === "CONFLICT" ? "CONFLICT" : error.code === "FORBIDDEN" ? "FORBIDDEN" : "NOT_FOUND", message: error.message });
        throw error;
      }
    }),

  deleteSession: protectedProcedure
    .input(z.object({ sessionId: z.string(), reason: z.string().min(1, "A reason is required.") }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.attendanceSession.findUnique({ where: { id: input.sessionId } });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      const access = await sessionAccess(ctx, session);
      if (!access.isAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "Only an admin can delete an attendance session." });
      try {
        return await deleteAttendanceSession({ sessionId: input.sessionId, actorId: ctx.userId, reason: input.reason });
      } catch (error) {
        if (error instanceof AttendanceError) throw new TRPCError({ code: error.code === "CONFLICT" ? "CONFLICT" : error.code === "FORBIDDEN" ? "FORBIDDEN" : "NOT_FOUND", message: error.message });
        throw error;
      }
    }),

  clearAutoAbsent: protectedProcedure
    .input(z.object({ sessionId: z.string(), reason: z.string().min(1, "A reason is required.") }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.attendanceSession.findUnique({ where: { id: input.sessionId } });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      const access = await sessionAccess(ctx, session);
      if (!access.isAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "Only an admin can clear the auto-absent sweep." });
      return clearAutoAbsent({ sessionId: input.sessionId, actorId: ctx.userId, reason: input.reason });
    }),
});
