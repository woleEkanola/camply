import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import { markAttendance, AttendanceError } from "../../attendance/engine";

const ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"];

async function assertAdminOrOwnTribe(ctx: { prisma: any; session: any; userId: string }, organizationId: string, tribeId?: string | null) {
  const currentUser = ctx.session?.user;
  if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (ADMIN_ROLES.includes(currentUser.role) && currentUser.organizationId === organizationId) return { admin: true };
  // Gate on holding an approved staff profile, not on `role === "TEACHER"` —
  // a parent who also teaches has role PARENT and would otherwise fall through
  // to FORBIDDEN despite being a teacher. See server/auth/capabilities.ts.
  const profile = await ctx.prisma.staffProfile.findFirst({
    where: { userId: ctx.userId, organizationId, status: "APPROVED", deletedAt: null },
  });
  if (!profile) throw new TRPCError({ code: "FORBIDDEN" });
  if (tribeId && profile.assignedTribeId !== tribeId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not your assigned tribe" });
  }
  return { admin: false, profile };
}

export const attendanceRouter = createTRPCRouter({
  createSession: protectedProcedure
    .input(z.object({ campId: z.string(), organizationId: z.string(), name: z.string().min(1), date: z.date(), startsAt: z.date().optional(), lateAfterMinutes: z.number().int().min(0).max(240).default(10), tribeId: z.string().optional(), venueId: z.string().optional(), allowVolunteerAccess: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      await assertAdminOrOwnTribe(ctx, input.organizationId, input.tribeId);
      // input.campId was never checked against input.organizationId — a
      // caller in-org could create an attendance session against a camp
      // belonging to a different organization entirely.
      const camp = await ctx.prisma.camp.findUnique({ where: { id: input.campId }, select: { organizationId: true } });
      if (!camp || camp.organizationId !== input.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Camp not found in this organization" });
      }
      const startsAt = input.startsAt ?? input.date;
      const category = await ctx.prisma.scoreCategory.findFirst({ where: { campId: input.campId, key: "attendance", enabled: true } });
      const rule = category ? await ctx.prisma.scoreRule.findFirst({ where: { campId: input.campId, categoryId: category.id, enabled: true, trigger: { in: ["SESSION", "SCAN"] } }, orderBy: { priority: "desc" } }) : null;
      return ctx.prisma.$transaction(async (tx) => {
        const scored = category ? await tx.scoredSession.create({ data: {
          campId: input.campId, name: input.name, date: input.date, startsAt, graceMinutes: input.lateAfterMinutes,
          tribeId: input.tribeId, scope: input.tribeId ? "TRIBE" : "CAMP", categoryId: category.id, ruleId: rule?.id, status: "ACTIVE",
        } }) : null;
        return tx.attendanceSession.create({ data: {
          campId: input.campId, name: input.name, date: input.date, startsAt, lateAfterMinutes: input.lateAfterMinutes,
          tribeId: input.tribeId, venueId: input.venueId, createdById: ctx.userId, allowVolunteerAccess: input.allowVolunteerAccess,
          scoredSessionId: scored?.id,
        } });
      });
    }),

  listSessions: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string(), tribeId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      if (currentUser.role !== "SUPER_ADMIN" && currentUser.organizationId !== input.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized for this organization" });
      }
      // input.campId was never verified to belong to input.organizationId.
      const camp = await ctx.prisma.camp.findUnique({ where: { id: input.campId }, select: { organizationId: true } });
      if (!camp || camp.organizationId !== input.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Camp not found in this organization" });
      }
      let tribeId = input.tribeId;
      // Non-admins are scoped to their own assigned tribe, identified by their
      // staff profile rather than by `role === "TEACHER"`.
      if (!ADMIN_ROLES.includes(currentUser.role)) {
        const profile = await ctx.prisma.staffProfile.findFirst({ where: { userId: ctx.userId, organizationId: input.organizationId, deletedAt: null } });
        tribeId = profile?.assignedTribeId ?? undefined;
        if (!tribeId) return [];
      }
      return ctx.prisma.attendanceSession.findMany({
        where: { campId: input.campId, ...(tribeId && { tribeId }) },
        include: { records: true },
        orderBy: { date: "desc" },
      });
    }),

  rosterForTribe: protectedProcedure
    .input(z.object({ tribeId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Previously had no authorization at all — any authenticated user
      // (including a PARENT) could read the full camper roster of any tribe
      // in any organization, including allergies/medications/emergency
      // contacts via the camper include below.
      const tribe = await ctx.prisma.tribe.findUnique({
        where: { id: input.tribeId },
        select: { campId: true, camp: { select: { organizationId: true } } },
      });
      if (!tribe) throw new TRPCError({ code: "NOT_FOUND" });
      await assertAdminOrOwnTribe(ctx, tribe.camp.organizationId, input.tribeId);

      return ctx.prisma.registration.findMany({
        where: { tribeId: input.tribeId, status: { in: ["APPROVED", "CHECKED_IN", "COMPLETED"] }, deletedAt: null },
        include: { camper: true },
        orderBy: { camper: { name: "asc" } },
      });
    }),

  sessionDetail: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const session = await ctx.prisma.attendanceSession.findUnique({
        where: { id: input.id },
        include: {
          records: { include: { registration: { include: { camper: true } } } },
          camp: { select: { organizationId: true } },
        },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      // Previously had no authorization at all.
      await assertAdminOrOwnTribe(ctx, session.camp.organizationId, session.tribeId);
      return session;
    }),

  recordAttendance: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
      records: z.array(z.object({ registrationId: z.string(), status: z.enum(["PRESENT", "ABSENT", "LATE"]) })),
    }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.attendanceSession.findUnique({
        where: { id: input.sessionId },
        include: { camp: { select: { organizationId: true } } },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      if (ADMIN_ROLES.includes(currentUser.role)) {
        // Previously skipped org verification entirely for every admin role
        // — an admin of org A could record attendance for a session
        // belonging to org B.
        if (currentUser.role !== "SUPER_ADMIN" && currentUser.organizationId !== session.camp.organizationId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      } else {
        const profile = await ctx.prisma.staffProfile.findFirst({ where: { userId: ctx.userId, organizationId: session.camp.organizationId } });
        if (!profile || profile.assignedTribeId !== session.tribeId) throw new TRPCError({ code: "FORBIDDEN" });
      }

      for (const record of input.records) {
        await markAttendance({ sessionId: input.sessionId, registrationId: record.registrationId, status: record.status, source: "MANUAL", actorId: ctx.userId });
      }
      return { count: input.records.length };
    }),

  mark: protectedProcedure
    .input(z.object({ sessionId: z.string(), registrationId: z.string(), status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]).optional(), source: z.enum(["QR", "SEARCH", "MANUAL", "OFFLINE"]), occurredAt: z.date().optional() }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.attendanceSession.findUnique({ where: { id: input.sessionId }, include: { camp: { select: { organizationId: true } } } });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      const access = await assertAdminOrOwnTribe(ctx, session.camp.organizationId, session.tribeId);
      if (!access.admin && access.profile?.type === "VOLUNTEER" && !session.allowVolunteerAccess) throw new TRPCError({ code: "FORBIDDEN", message: "This session is not open to volunteers." });
      try { return await markAttendance({ ...input, actorId: ctx.userId }); }
      catch (error) {
        if (error instanceof AttendanceError) throw new TRPCError({ code: error.code === "CONFLICT" ? "CONFLICT" : error.code === "FORBIDDEN" ? "FORBIDDEN" : "NOT_FOUND", message: error.message });
        throw error;
      }
    }),

  resolveAndMark: protectedProcedure
    .input(z.object({ sessionId: z.string(), qrToken: z.string().optional(), query: z.string().optional(), source: z.enum(["QR", "SEARCH", "OFFLINE"]), occurredAt: z.date().optional() }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.attendanceSession.findUnique({ where: { id: input.sessionId }, include: { camp: { select: { organizationId: true } } } });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      const access = await assertAdminOrOwnTribe(ctx, session.camp.organizationId, session.tribeId);
      if (!access.admin && access.profile?.type === "VOLUNTEER" && !session.allowVolunteerAccess) throw new TRPCError({ code: "FORBIDDEN", message: "This session is not open to volunteers." });
      const token = input.qrToken?.trim();
      const query = input.query?.trim();
      if (!token && !query) throw new TRPCError({ code: "BAD_REQUEST", message: "Scan a QR code or enter a camper search." });
      const matches = await ctx.prisma.registration.findMany({
        where: { campId: session.campId, deletedAt: null, status: { in: ["APPROVED", "CHECKED_IN", "COMPLETED"] }, ...(session.tribeId ? { tribeId: session.tribeId } : {}), OR: token ? [{ qrToken: token }, { registrationNumber: token }] : [{ registrationNumber: { contains: query, mode: "insensitive" } }, { camper: { name: { contains: query, mode: "insensitive" } } }] },
        include: { camper: { select: { name: true } } }, take: 2, orderBy: { registrationNumber: "asc" },
      });
      if (!matches.length) throw new TRPCError({ code: "NOT_FOUND", message: "No eligible camper found for this session." });
      if (!token && matches.length > 1) throw new TRPCError({ code: "CONFLICT", message: "More than one camper matches. Enter a more specific name or registration number." });
      const record = await markAttendance({ sessionId: session.id, registrationId: matches[0]!.id, source: input.source, actorId: ctx.userId, occurredAt: input.occurredAt });
      return { record, camper: matches[0]!.camper };
    }),

  closeSession: protectedProcedure
    .input(z.object({ sessionId: z.string(), markRemainingAbsent: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.attendanceSession.findUnique({ where: { id: input.sessionId }, include: { camp: { select: { organizationId: true } } } });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      await assertAdminOrOwnTribe(ctx, session.camp.organizationId, session.tribeId);
      if (input.markRemainingAbsent) {
        const registrations = await ctx.prisma.registration.findMany({ where: { campId: session.campId, ...(session.tribeId ? { tribeId: session.tribeId } : {}), deletedAt: null, status: { in: ["APPROVED", "CHECKED_IN", "COMPLETED"] }, attendanceRecords: { none: { sessionId: session.id } } }, select: { id: true } });
        for (const registration of registrations) await markAttendance({ sessionId: session.id, registrationId: registration.id, status: "ABSENT", source: "MANUAL", actorId: ctx.userId });
      }
      await ctx.prisma.attendanceSession.update({ where: { id: session.id }, data: { status: "CLOSED", closedAt: new Date(), closedById: ctx.userId } });
      if (session.scoredSessionId) await ctx.prisma.scoredSession.update({ where: { id: session.scoredSessionId }, data: { status: "CLOSED" } });
      return { success: true };
    }),

  todaySummary: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      const profile = await ctx.prisma.staffProfile.findFirst({ where: { userId: ctx.userId, organizationId: input.organizationId } });
      const tribeId = profile?.assignedTribeId;
      if (!tribeId) return { total: 0, present: 0, absent: 0, late: 0 };

      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);

      const session = await ctx.prisma.attendanceSession.findFirst({
        where: { campId: input.campId, tribeId, date: { gte: start, lte: end } },
        include: { records: true },
      });
      if (!session) return { total: 0, present: 0, absent: 0, late: 0 };
      const present = session.records.filter((r: { status: string }) => r.status === "PRESENT").length;
      const absent = session.records.filter((r: { status: string }) => r.status === "ABSENT").length;
      const late = session.records.filter((r: { status: string }) => r.status === "LATE").length;
      return { total: session.records.length, present, absent, late };
    }),
});
