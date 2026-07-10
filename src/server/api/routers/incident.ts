import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";

const ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN", "LOCATION_ADMIN"];

export const incidentRouter = createTRPCRouter({
  create: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
      yearId: z.string(),
      registrationId: z.string().optional(),
      severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
      title: z.string(),
      description: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser || ![...ADMIN_ROLES, "TEACHER", "VOLUNTEER"].includes(currentUser.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return ctx.prisma.incidentReport.create({
        data: { ...input, reportedById: ctx.userId, status: "OPEN" },
      });
    }),

  listMine: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.incidentReport.findMany({
        where: { organizationId: input.organizationId, reportedById: ctx.userId },
        orderBy: { createdAt: "desc" },
      });
    }),

  adminList: protectedProcedure
    .input(z.object({ organizationId: z.string(), yearId: z.string().optional(), status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser || !ADMIN_ROLES.includes(currentUser.role) || currentUser.organizationId !== input.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return ctx.prisma.incidentReport.findMany({
        where: { organizationId: input.organizationId, ...(input.yearId && { yearId: input.yearId }), ...(input.status && { status: input.status }) },
        include: { registration: { include: { camperProfile: true } } },
        orderBy: { createdAt: "desc" },
      });
    }),

  resolve: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const report = await ctx.prisma.incidentReport.findUnique({ where: { id: input.id } });
      if (!report) throw new TRPCError({ code: "NOT_FOUND" });
      const currentUser = ctx.session?.user;
      if (!currentUser || !ADMIN_ROLES.includes(currentUser.role) || currentUser.organizationId !== report.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return ctx.prisma.incidentReport.update({ where: { id: input.id }, data: { status: "RESOLVED", resolvedAt: new Date(), resolvedById: ctx.userId } });
    }),
});
