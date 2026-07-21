import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import * as tribeEngine from "../../tribe/engine";
import { assertOrgAdmin, assertOrgAdminOrCampusRep } from "../trpc/scoping";

async function assertCanManageCamp(ctx: { prisma: any; session: any }, campId: string) {
  const camp = await ctx.prisma.camp.findUnique({ where: { id: campId } });
  if (!camp) throw new TRPCError({ code: "NOT_FOUND", message: "Camp not found" });
  await assertOrgAdmin(ctx, camp.organizationId);
  return camp;
}

function toTRPCError(error: unknown): TRPCError {
  if (error instanceof tribeEngine.TribeAllocationError) {
    return new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  if (error instanceof TRPCError) return error;
  if (error instanceof Error) return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unknown error" });
}

export const tribeRouter = createTRPCRouter({
  listByCamp: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const tribes = await ctx.prisma.tribe.findMany({
        where: { campId: input.campId, deletedAt: null },
        include: { _count: { select: { registrations: { where: { deletedAt: null } } } } },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      });
      return tribes.map((t: any) => ({ ...t, population: t._count.registrations }));
    }),

  create: protectedProcedure
    .input(z.object({
      campId: z.string(),
      name: z.string().min(1),
      code: z.string().max(10).optional(),
      color: z.string().optional(),
      displayOrder: z.number().int().min(0).optional(),
      description: z.string().optional(),
      meaning: z.string().optional(),
      motto: z.string().optional(),
      scripture: z.string().optional(),
      gender: z.enum(["MALE", "FEMALE", "MIXED"]).optional(),
      ageRange: z.string().optional(),
      allocationStrategy: z.enum(["MANUAL", "AUTOMATIC", "INVITE_ONLY"]).optional(),
      maxCapacity: z.number().int().min(1).optional(),
      logoUrl: z.string().optional(),
      bannerUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanManageCamp(ctx, input.campId);
      return ctx.prisma.tribe.create({ data: input });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      data: z.object({
        name: z.string().min(1).optional(),
        code: z.string().max(10).nullable().optional(),
        color: z.string().nullable().optional(),
        displayOrder: z.number().int().min(0).optional(),
        description: z.string().nullable().optional(),
        meaning: z.string().nullable().optional(),
        motto: z.string().nullable().optional(),
        scripture: z.string().nullable().optional(),
        gender: z.enum(["MALE", "FEMALE", "MIXED"]).nullable().optional(),
        ageRange: z.string().nullable().optional(),
        allocationStrategy: z.enum(["MANUAL", "AUTOMATIC", "INVITE_ONLY"]).optional(),
        maxCapacity: z.number().int().min(1).nullable().optional(),
        isAllocationLocked: z.boolean().optional(),
        logoUrl: z.string().nullable().optional(),
        bannerUrl: z.string().nullable().optional(),
        status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const tribe = await ctx.prisma.tribe.findUniqueOrThrow({ where: { id: input.id } });
      if (tribe.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Tribe not found" });
      await assertCanManageCamp(ctx, tribe.campId);
      return ctx.prisma.tribe.update({ where: { id: input.id }, data: input.data });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const tribe = await ctx.prisma.tribe.findUniqueOrThrow({ where: { id: input.id } });
      if (tribe.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Tribe not found" });
      await assertCanManageCamp(ctx, tribe.campId);
      const inUse = await ctx.prisma.registration.count({ where: { tribeId: input.id, deletedAt: null } });
      if (inUse > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete a tribe with assigned campers. Reassign them first." });
      }
      return ctx.prisma.tribe.update({ where: { id: input.id }, data: { deletedAt: new Date() } });
    }),

  updateAllocationConfig: protectedProcedure
    .input(z.object({
      campId: z.string(),
      tribeAllocationEnabled: z.boolean().optional(),
      tribeAllocationMode: z.enum(["MANUAL", "AUTOMATIC", "HYBRID"]).optional(),
      tribeAllocationRules: z.any().optional(),
      targetTribeSize: z.number().int().min(1).nullable().optional(),
      tribeAllocationPresets: z.any().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanManageCamp(ctx, input.campId);
      const { campId, ...data } = input;
      return ctx.prisma.camp.update({ where: { id: campId }, data });
    }),

  updateBedAllocationConfig: protectedProcedure
    .input(z.object({
      campId: z.string(),
      bedAllocationEnabled: z.boolean().optional(),
      bedAllocationRules: z.array(z.object({ criterion: z.string(), enabled: z.boolean() })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanManageCamp(ctx, input.campId);
      const { campId, ...data } = input;
      return ctx.prisma.camp.update({ where: { id: campId }, data });
    }),

  suggest: protectedProcedure
    .input(z.object({ registrationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { campus: true },
      });
      await assertOrgAdminOrCampusRep(ctx, registration.campus.organizationId, registration.campusId);
      return tribeEngine.suggestTribe(ctx.prisma, input.registrationId);
    }),

  assign: protectedProcedure
    .input(z.object({ registrationId: z.string(), tribeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { campus: true },
      });
      await assertOrgAdminOrCampusRep(ctx, registration.campus.organizationId, registration.campusId);
      try {
        return await tribeEngine.assignTribe({ registrationId: input.registrationId, tribeId: input.tribeId, actorId: currentUser.id });
      } catch (error) {
        throw toTRPCError(error);
      }
    }),

  clear: protectedProcedure
    .input(z.object({ registrationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { campus: true },
      });
      await assertOrgAdminOrCampusRep(ctx, registration.campus.organizationId, registration.campusId);
      return tribeEngine.clearTribeAssignment({ registrationId: input.registrationId, actorId: currentUser.id });
    }),

  bulkAutoAssign: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      await assertCanManageCamp(ctx, input.campId);
      return tribeEngine.bulkAutoAssignTribes({ campId: input.campId, actorId: currentUser!.id });
    }),

  lockAssignment: protectedProcedure
    .input(z.object({ registrationId: z.string(), locked: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { campus: true },
      });
      await assertOrgAdminOrCampusRep(ctx, registration.campus.organizationId, registration.campusId);
      return tribeEngine.lockTribeAssignment(input.registrationId, input.locked, currentUser.id);
    }),

  simulate: protectedProcedure
    .input(z.object({
      campId: z.string(),
      rules: z.any().optional(),
      targetSize: z.number().int().min(1).nullable().optional(),
      scope: z.enum(["approved", "all"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      await assertCanManageCamp(ctx, input.campId);
      return tribeEngine.simulateAllocation(ctx.prisma, input.campId, {
        rules: input.rules,
        targetSize: input.targetSize,
        scope: input.scope,
      });
    }),

  optimize: protectedProcedure
    .input(z.object({
      campId: z.string(),
      apply: z.boolean().default(false),
      force: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      await assertCanManageCamp(ctx, input.campId);

      if (!input.apply && !input.force) {
        const checkedInExists = await ctx.prisma.registration.count({
          where: { campId: input.campId, status: "CHECKED_IN", deletedAt: null },
        });
        if (checkedInExists > 0 && !input.force) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Check-in has already begun. Set force: true to override.",
          });
        }
      }

      const simulation = await tribeEngine.runAllocationPipeline(ctx.prisma, input.campId);

      if (input.apply) {
        for (const assignment of simulation.assignments) {
          try {
            await tribeEngine.assignTribe({
              registrationId: assignment.registrationId,
              tribeId: assignment.tribeId,
              actorId: currentUser!.id,
              method: "AUTOMATIC",
            });
          } catch (err) {
            console.error(`Failed to assign ${assignment.registrationId}:`, err);
          }
        }
      }

      return {
        assignments: simulation.assignments,
        quality: simulation.quality,
        warnings: simulation.warnings,
        lockedCount: simulation.lockedCount,
        changedCount: simulation.changedCount,
        applied: input.apply,
      };
    }),

  updatePoints: protectedProcedure
    .input(z.object({ tribeId: z.string(), delta: z.number().int(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      const tribe = await ctx.prisma.tribe.findUniqueOrThrow({ where: { id: input.tribeId } });
      await assertCanManageCamp(ctx, tribe.campId);
      const [updated] = await ctx.prisma.$transaction([
        ctx.prisma.tribe.update({ where: { id: input.tribeId }, data: { points: { increment: input.delta } } }),
        ctx.prisma.tribePointsLog.create({
          data: { tribeId: input.tribeId, delta: input.delta, reason: input.reason, actorId: currentUser!.id },
        }),
      ]);
      return updated;
    }),

  pointsHistory: protectedProcedure
    .input(z.object({ tribeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      return ctx.prisma.tribePointsLog.findMany({ where: { tribeId: input.tribeId }, orderBy: { createdAt: "desc" }, take: 20 });
    }),
});
