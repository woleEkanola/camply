import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import * as tribeEngine from "../../tribe/engine";

async function assertCanManageYear(ctx: { prisma: any; session: any }, yearId: string) {
  const currentUser = ctx.session?.user;
  if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
  const year = await ctx.prisma.year.findUnique({ where: { id: yearId } });
  if (!year) throw new TRPCError({ code: "NOT_FOUND", message: "Camp not found" });
  const hasPermission =
    currentUser.role === "SUPER_ADMIN" ||
    ((currentUser.role === "OWNER" || currentUser.role === "ADMIN") && currentUser.organizationId === year.organizationId);
  if (!hasPermission) throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to manage tribes for this camp" });
  return year;
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
  listByYear: protectedProcedure
    .input(z.object({ yearId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const tribes = await ctx.prisma.tribe.findMany({
        where: { yearId: input.yearId },
        include: { _count: { select: { registrations: true } } },
        orderBy: { name: "asc" },
      });
      return tribes.map((t: any) => ({ ...t, population: t._count.registrations }));
    }),

  create: protectedProcedure
    .input(z.object({
      yearId: z.string(),
      name: z.string().min(1),
      color: z.string().optional(),
      description: z.string().optional(),
      maxCapacity: z.number().int().min(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanManageYear(ctx, input.yearId);
      return ctx.prisma.tribe.create({ data: input });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      data: z.object({
        name: z.string().min(1).optional(),
        color: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        maxCapacity: z.number().int().min(1).nullable().optional(),
        status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const tribe = await ctx.prisma.tribe.findUniqueOrThrow({ where: { id: input.id } });
      await assertCanManageYear(ctx, tribe.yearId);
      return ctx.prisma.tribe.update({ where: { id: input.id }, data: input.data });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const tribe = await ctx.prisma.tribe.findUniqueOrThrow({ where: { id: input.id } });
      await assertCanManageYear(ctx, tribe.yearId);
      const inUse = await ctx.prisma.registration.count({ where: { tribeId: input.id } });
      if (inUse > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete a tribe with assigned campers. Reassign them first." });
      }
      return ctx.prisma.tribe.delete({ where: { id: input.id } });
    }),

  // Allocation configuration for a camp (PRD Part 4A §5-8)
  updateAllocationConfig: protectedProcedure
    .input(z.object({
      yearId: z.string(),
      tribeAllocationEnabled: z.boolean().optional(),
      tribeAllocationMode: z.enum(["MANUAL", "AUTOMATIC", "HYBRID"]).optional(),
      tribeAllocationRules: z.array(z.object({ criterion: z.string(), enabled: z.boolean() })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanManageYear(ctx, input.yearId);
      const { yearId, ...data } = input;
      return ctx.prisma.year.update({ where: { id: yearId }, data });
    }),

  suggest: protectedProcedure
    .input(z.object({ registrationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      if (!["SUPER_ADMIN", "OWNER", "ADMIN", "LOCATION_ADMIN"].includes(currentUser.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return tribeEngine.suggestTribe(ctx.prisma, input.registrationId);
    }),

  assign: protectedProcedure
    .input(z.object({ registrationId: z.string(), tribeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      if (!["SUPER_ADMIN", "OWNER", "ADMIN", "LOCATION_ADMIN"].includes(currentUser.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
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
      if (!["SUPER_ADMIN", "OWNER", "ADMIN", "LOCATION_ADMIN"].includes(currentUser.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return tribeEngine.clearTribeAssignment({ registrationId: input.registrationId, actorId: currentUser.id });
    }),

  bulkAutoAssign: protectedProcedure
    .input(z.object({ yearId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      await assertCanManageYear(ctx, input.yearId);
      return tribeEngine.bulkAutoAssignTribes({ yearId: input.yearId, actorId: currentUser!.id });
    }),
});
