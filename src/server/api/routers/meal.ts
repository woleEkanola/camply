import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";

const ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN", "LOCATION_ADMIN"];

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
      yearId: z.string(),
      registrationId: z.string(),
      meal: z.enum(["BREAKFAST", "LUNCH", "DINNER"]),
      date: z.date(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertKitchenStaffOrAdmin(ctx, input.organizationId);
      const registration = await ctx.prisma.registration.findUnique({ where: { id: input.registrationId }, include: { camperProfile: true } });
      if (!registration) throw new TRPCError({ code: "NOT_FOUND" });

      const record = await ctx.prisma.mealDistribution.upsert({
        where: { registrationId_meal_date: { registrationId: input.registrationId, meal: input.meal, date: input.date } },
        update: {},
        create: { yearId: input.yearId, registrationId: input.registrationId, meal: input.meal, date: input.date, servedById: ctx.userId },
      });

      return {
        record,
        allergyWarning: registration.camperProfile.allergies || registration.camperProfile.dietaryRestrictions
          ? { allergies: registration.camperProfile.allergies, dietaryRestrictions: registration.camperProfile.dietaryRestrictions }
          : null,
      };
    }),

  history: protectedProcedure
    .input(z.object({ organizationId: z.string(), yearId: z.string(), date: z.date().optional() }))
    .query(async ({ ctx, input }) => {
      await assertKitchenStaffOrAdmin(ctx, input.organizationId);
      return ctx.prisma.mealDistribution.findMany({
        where: { yearId: input.yearId, ...(input.date && { date: input.date }) },
        include: { registration: { include: { camperProfile: true } } },
        orderBy: { servedAt: "desc" },
        take: 100,
      });
    }),

  allergyList: protectedProcedure
    .input(z.object({ organizationId: z.string(), yearId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertKitchenStaffOrAdmin(ctx, input.organizationId);
      const registrations = await ctx.prisma.registration.findMany({
        where: {
          yearId: input.yearId,
          status: "APPROVED",
          camperProfile: { organizationId: input.organizationId, OR: [{ allergies: { not: null } }, { dietaryRestrictions: { not: null } }] },
        },
        include: { camperProfile: true },
      });
      return registrations
        .filter((r: any) => r.camperProfile.allergies || r.camperProfile.dietaryRestrictions)
        .map((r: any) => ({
          registrationId: r.id,
          name: r.camperProfile.name,
          allergies: r.camperProfile.allergies,
          dietaryRestrictions: r.camperProfile.dietaryRestrictions,
        }));
    }),
});
