import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";

const ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"];

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
      // Previously missing the assertMedicalStaffOrAdmin gate that `create`
      // and `recent` both have — any logged-in user (including a PARENT of
      // a different camper) could read any child's medical complaints and
      // treatment notes by registration id alone.
      const registration = await ctx.prisma.registration.findUnique({
        where: { id: input.registrationId },
        select: { campus: { select: { organizationId: true } } },
      });
      if (!registration) throw new TRPCError({ code: "NOT_FOUND" });
      await assertMedicalStaffOrAdmin(ctx, registration.campus.organizationId);

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
