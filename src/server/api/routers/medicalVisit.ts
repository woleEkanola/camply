import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";

const ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"];

async function assertMedicalStaffOrAdmin(ctx: { prisma: any; session: any; userId: string }, organizationId: string) {
  const currentUser = ctx.session?.user;
  if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (ADMIN_ROLES.includes(currentUser.role) && currentUser.organizationId === organizationId) return;
  // Any approved staff profile qualifies — not just `role === "VOLUNTEER"`.
  // A parent who volunteers keeps role PARENT and would otherwise be refused
  // despite holding the Kitchen category. See server/auth/capabilities.ts.
  {
    const profile = await ctx.prisma.staffProfile.findFirst({ where: { userId: ctx.userId, organizationId, status: "APPROVED", deletedAt: null } });
    if (profile?.volunteerCategory === "Medical") return;
  }
  throw new TRPCError({ code: "FORBIDDEN" });
}

export const medicalVisitRouter = createTRPCRouter({
  create: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
      campId: z.string(),
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
    .input(z.object({ organizationId: z.string(), campId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertMedicalStaffOrAdmin(ctx, input.organizationId);
      return ctx.prisma.medicalVisit.findMany({
        where: { organizationId: input.organizationId, campId: input.campId },
        include: { registration: { include: { camper: true } } },
        orderBy: { visitedAt: "desc" },
        take: 50,
      });
    }),
});
