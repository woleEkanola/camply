import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";

const ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN", "LOCATION_ADMIN"];

async function assertMedicalStaffOrAdmin(ctx: { prisma: any; session: any; userId: string }, organizationId: string) {
  const currentUser = ctx.session?.user;
  if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (ADMIN_ROLES.includes(currentUser.role) && currentUser.organizationId === organizationId) return;
  if (currentUser.role === "VOLUNTEER") {
    const profile = await ctx.prisma.staffProfile.findFirst({ where: { userId: ctx.userId, organizationId, status: "APPROVED" } });
    if (profile?.volunteerCategory === "Medical") return;
  }
  throw new TRPCError({ code: "FORBIDDEN" });
}

export const medicalVisitRouter = createTRPCRouter({
  create: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
      yearId: z.string(),
      registrationId: z.string(),
      complaint: z.string(),
      treatment: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertMedicalStaffOrAdmin(ctx, input.organizationId);
      return ctx.prisma.medicalVisit.create({ data: { ...input, recordedById: ctx.userId } });
    }),

  listForRegistration: protectedProcedure
    .input(z.object({ registrationId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.medicalVisit.findMany({ where: { registrationId: input.registrationId }, orderBy: { visitedAt: "desc" } });
    }),

  recent: protectedProcedure
    .input(z.object({ organizationId: z.string(), yearId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertMedicalStaffOrAdmin(ctx, input.organizationId);
      return ctx.prisma.medicalVisit.findMany({
        where: { organizationId: input.organizationId, yearId: input.yearId },
        include: { registration: { include: { camperProfile: true } } },
        orderBy: { visitedAt: "desc" },
        take: 50,
      });
    }),
});
