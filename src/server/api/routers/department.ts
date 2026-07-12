import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";

const ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN"];

async function assertOrgAdmin(ctx: { session: any }, organizationId: string) {
  const currentUser = ctx.session?.user;
  if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
  // Departments are org-wide (not centre-scoped) — LOCATION_ADMIN gets read-only, not write access.
  if (ADMIN_ROLES.includes(currentUser.role) && currentUser.organizationId === organizationId) return currentUser;
  throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to manage departments for this organization" });
}

async function assertOrgMember(ctx: { session: any }, organizationId: string) {
  const currentUser = ctx.session?.user;
  if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (currentUser.role === "PARENT") throw new TRPCError({ code: "FORBIDDEN" });
  if (currentUser.organizationId !== organizationId) throw new TRPCError({ code: "FORBIDDEN" });
  return currentUser;
}

export const departmentRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      await assertOrgMember(ctx, input.organizationId);
      return ctx.prisma.department.findMany({
        where: { organizationId: input.organizationId, ...(input.campId && { campId: input.campId }), status: "ACTIVE", deletedAt: null },
        orderBy: { name: "asc" },
      });
    }),

  create: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
      campId: z.string().optional(),
      name: z.string(),
      description: z.string().optional(),
      maxCapacity: z.number().int().positive().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertOrgAdmin(ctx, input.organizationId);
      return ctx.prisma.department.create({
        data: {
          organizationId: input.organizationId,
          campId: input.campId ?? null,
          name: input.name,
          description: input.description,
          maxCapacity: input.maxCapacity ?? null,
        },
      });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      maxCapacity: z.number().int().positive().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const dept = await ctx.prisma.department.findUnique({ where: { id: input.id } });
      if (!dept || dept.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, dept.organizationId);
      const { id, ...data } = input;
      return ctx.prisma.department.update({ where: { id }, data });
    }),

  // Delete a department (soft delete — recoverable from Trash for 60 days).
  // Staff assigned to this department keep their departmentId (no cascade);
  // it just stops showing up in the active department list/structure views.
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const dept = await ctx.prisma.department.findUnique({ where: { id: input.id } });
      if (!dept || dept.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, dept.organizationId);
      return ctx.prisma.department.update({ where: { id: input.id }, data: { deletedAt: new Date() } });
    }),

  updateResponsibilities: protectedProcedure
    .input(z.object({ id: z.string(), responsibilities: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const dept = await ctx.prisma.department.findUnique({ where: { id: input.id } });
      if (!dept || dept.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, dept.organizationId);
      return ctx.prisma.department.update({ where: { id: input.id }, data: { responsibilities: input.responsibilities } });
    }),
});
