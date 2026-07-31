import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";

const ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"];

async function assertKitchenStaffOrAdmin(ctx: { prisma: any; session: any; userId: string }, organizationId: string) {
  const currentUser = ctx.session?.user;
  if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (ADMIN_ROLES.includes(currentUser.role) && currentUser.organizationId === organizationId) return;
  if (currentUser.role === "VOLUNTEER") {
    const profile = await ctx.prisma.staffProfile.findFirst({ where: { userId: ctx.userId, organizationId, status: "APPROVED" } });
    if (profile?.volunteerCategory === "Kitchen") return;
  }
  throw new TRPCError({ code: "FORBIDDEN" });
}

export const mealRouter = createTRPCRouter({
  serve: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
      campId: z.string(),
      registrationId: z.string(),
      meal: z.enum(["BREAKFAST", "LUNCH", "DINNER"]),
      date: z.date(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertKitchenStaffOrAdmin(ctx, input.organizationId);
      // registrationId was never checked against the asserted org — a
      // kitchen volunteer could pass their own org id (satisfying the
      // assert above) alongside another tenant's registrationId and serve/
      // read a meal record for a camper in a different organization.
      const registration = await ctx.prisma.registration.findUnique({
        where: { id: input.registrationId, deletedAt: null },
        include: { camper: true, campus: { select: { organizationId: true } } },
      });
      if (!registration || registration.campus.organizationId !== input.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const record = await ctx.prisma.mealDistribution.upsert({
        where: { registrationId_meal_date: { registrationId: input.registrationId, meal: input.meal, date: input.date } },
        update: {},
        create: { campId: input.campId, registrationId: input.registrationId, meal: input.meal, date: input.date, servedById: ctx.userId },
      });

      return {
        record,
        allergyWarning: registration.camper.allergies || registration.camper.dietaryRestrictions
          ? { allergies: registration.camper.allergies, dietaryRestrictions: registration.camper.dietaryRestrictions }
          : null,
      };
    }),

  history: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string(), date: z.date().optional() }))
    .query(async ({ ctx, input }) => {
      await assertKitchenStaffOrAdmin(ctx, input.organizationId);
      // campId was never checked against the asserted org — a kitchen
      // volunteer could pass their own org id alongside a foreign campId and
      // read that org's meal history (with camper data).
      const camp = await ctx.prisma.camp.findUnique({ where: { id: input.campId }, select: { organizationId: true } });
      if (!camp || camp.organizationId !== input.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Camp not found in this organization" });
      }
      return ctx.prisma.mealDistribution.findMany({
        where: { campId: input.campId, ...(input.date && { date: input.date }) },
        include: { registration: { include: { camper: true } } },
        orderBy: { servedAt: "desc" },
        take: 100,
      });
    }),

  allergyList: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertKitchenStaffOrAdmin(ctx, input.organizationId);
      const registrations = await ctx.prisma.registration.findMany({
        where: {
          campId: input.campId,
          status: "APPROVED",
          deletedAt: null,
          camper: { organizationId: input.organizationId, OR: [{ allergies: { not: null } }, { dietaryRestrictions: { not: null } }] },
        },
        include: { camper: true },
      });
      return registrations
        .filter((r: any) => r.camper.allergies || r.camper.dietaryRestrictions)
        .map((r: any) => ({
          registrationId: r.id,
          name: r.camper.name,
          allergies: r.camper.allergies,
          dietaryRestrictions: r.camper.dietaryRestrictions,
        }));
    }),
});
