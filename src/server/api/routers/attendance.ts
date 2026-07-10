import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";

const ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN", "LOCATION_ADMIN"];

async function assertAdminOrOwnTribe(ctx: { prisma: any; session: any; userId: string }, organizationId: string, tribeId?: string | null) {
  const currentUser = ctx.session?.user;
  if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (ADMIN_ROLES.includes(currentUser.role) && currentUser.organizationId === organizationId) return { admin: true };
  if (currentUser.role === "TEACHER") {
    const profile = await ctx.prisma.staffProfile.findFirst({ where: { userId: ctx.userId, organizationId, status: "APPROVED" } });
    if (!profile) throw new TRPCError({ code: "FORBIDDEN" });
    if (tribeId && profile.assignedTribeId !== tribeId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Not your assigned tribe" });
    }
    return { admin: false, profile };
  }
  throw new TRPCError({ code: "FORBIDDEN" });
}

export const attendanceRouter = createTRPCRouter({
  createSession: protectedProcedure
    .input(z.object({ yearId: z.string(), organizationId: z.string(), name: z.string(), date: z.date(), tribeId: z.string().optional(), locationId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertAdminOrOwnTribe(ctx, input.organizationId, input.tribeId);
      return ctx.prisma.attendanceSession.create({
        data: { yearId: input.yearId, name: input.name, date: input.date, tribeId: input.tribeId, locationId: input.locationId, createdById: ctx.userId },
      });
    }),

  listSessions: protectedProcedure
    .input(z.object({ organizationId: z.string(), yearId: z.string(), tribeId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      let tribeId = input.tribeId;
      if (currentUser.role === "TEACHER") {
        const profile = await ctx.prisma.staffProfile.findFirst({ where: { userId: ctx.userId, organizationId: input.organizationId } });
        tribeId = profile?.assignedTribeId ?? undefined;
        if (!tribeId) return [];
      }
      return ctx.prisma.attendanceSession.findMany({
        where: { yearId: input.yearId, ...(tribeId && { tribeId }) },
        include: { records: true },
        orderBy: { date: "desc" },
      });
    }),

  rosterForTribe: protectedProcedure
    .input(z.object({ tribeId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.registration.findMany({
        where: { tribeId: input.tribeId, status: { in: ["APPROVED", "CHECKED_IN", "COMPLETED"] } },
        include: { camperProfile: true },
        orderBy: { camperProfile: { name: "asc" } },
      });
    }),

  sessionDetail: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const session = await ctx.prisma.attendanceSession.findUnique({
        where: { id: input.id },
        include: { records: { include: { registration: { include: { camperProfile: true } } } } },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      return session;
    }),

  recordAttendance: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
      records: z.array(z.object({ registrationId: z.string(), status: z.enum(["PRESENT", "ABSENT", "LATE"]) })),
    }))
    .mutation(async ({ ctx, input }) => {
      const session = await ctx.prisma.attendanceSession.findUnique({ where: { id: input.sessionId } });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      if (!ADMIN_ROLES.includes(currentUser.role)) {
        const profile = await ctx.prisma.staffProfile.findFirst({ where: { userId: ctx.userId, organizationId: currentUser.organizationId } });
        if (!profile || profile.assignedTribeId !== session.tribeId) throw new TRPCError({ code: "FORBIDDEN" });
      }

      await ctx.prisma.$transaction(
        input.records.map((r) =>
          ctx.prisma.attendanceRecord.upsert({
            where: { sessionId_registrationId: { sessionId: input.sessionId, registrationId: r.registrationId } },
            update: { status: r.status, recordedById: ctx.userId, recordedAt: new Date() },
            create: { sessionId: input.sessionId, registrationId: r.registrationId, status: r.status, recordedById: ctx.userId },
          })
        )
      );
      return { count: input.records.length };
    }),

  todaySummary: protectedProcedure
    .input(z.object({ organizationId: z.string(), yearId: z.string() }))
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
        where: { yearId: input.yearId, tribeId, date: { gte: start, lte: end } },
        include: { records: true },
      });
      if (!session) return { total: 0, present: 0, absent: 0, late: 0 };
      const present = session.records.filter((r: { status: string }) => r.status === "PRESENT").length;
      const absent = session.records.filter((r: { status: string }) => r.status === "ABSENT").length;
      const late = session.records.filter((r: { status: string }) => r.status === "LATE").length;
      return { total: session.records.length, present, absent, late };
    }),
});
