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

  // Duplicate a department along with its default positions (no assignments)
  duplicate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const sourceDept = await ctx.prisma.department.findUnique({ where: { id: input.id } });
      if (!sourceDept || sourceDept.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, sourceDept.organizationId);

      const currentUser = ctx.session!.user;

      return ctx.prisma.$transaction(async (tx) => {
        // Create duplicated department
        const newDept = await tx.department.create({
          data: {
            organizationId: sourceDept.organizationId,
            campId: sourceDept.campId,
            name: `${sourceDept.name} (Copy)`,
            description: sourceDept.description,
            responsibilities: sourceDept.responsibilities,
            status: "ACTIVE",
            maxCapacity: sourceDept.maxCapacity,
          },
        });

        // Find positions belonging to source department
        const sourcePositions = await tx.position.findMany({
          where: { departmentId: sourceDept.id, deletedAt: null },
        });

        // Build child position map and clone them preserving hierarchy
        const clonedPositionsMap = new Map<string, string>(); // sourceId -> clonedId
        
        // First pass: create cloned positions without parentPositionId set
        for (const pos of sourcePositions) {
          const clonedPos = await tx.position.create({
            data: {
              name: pos.name.replace(sourceDept.name, newDept.name),
              campId: pos.campId,
              departmentId: newDept.id,
              displayOrder: pos.displayOrder,
              status: "ACTIVE",
            },
          });
          clonedPositionsMap.set(pos.id, clonedPos.id);
        }

        // Second pass: set parentPositionId on cloned positions
        for (const pos of sourcePositions) {
          if (pos.parentPositionId && clonedPositionsMap.has(pos.parentPositionId)) {
            const clonedId = clonedPositionsMap.get(pos.id)!;
            const clonedParentId = clonedPositionsMap.get(pos.parentPositionId)!;
            await tx.position.update({
              where: { id: clonedId },
              data: { parentPositionId: clonedParentId },
            });
          }
        }

        // Log activity
        await tx.departmentActivityLog.create({
          data: {
            departmentId: newDept.id,
            action: "DEPT_RENAMED", // fallback action
            actorId: currentUser.id,
            details: { message: `Duplicated from department "${sourceDept.name}"` },
          },
        });

        return newDept;
      });
    }),

  // Merge two departments together
  merge: protectedProcedure
    .input(z.object({
      sourceId: z.string(),
      targetId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sourceDept = await ctx.prisma.department.findUnique({ where: { id: input.sourceId } });
      const targetDept = await ctx.prisma.department.findUnique({ where: { id: input.targetId } });
      if (!sourceDept || sourceDept.deletedAt || !targetDept || targetDept.deletedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Source or Target department not found." });
      }
      await assertOrgAdmin(ctx, sourceDept.organizationId);

      const currentUser = ctx.session!.user;

      return ctx.prisma.$transaction(async (tx) => {
        // Move all positions from source to target department
        const sourcePositions = await tx.position.findMany({
          where: { departmentId: sourceDept.id, deletedAt: null },
        });

        for (const pos of sourcePositions) {
          await tx.position.update({
            where: { id: pos.id },
            data: { departmentId: targetDept.id },
          });
        }

        // Update legacy department references on StaffProfile directly
        await tx.staffProfile.updateMany({
          where: { departmentId: sourceDept.id, deletedAt: null },
          data: { departmentId: targetDept.id },
        });

        // Archive source department
        await tx.department.update({
          where: { id: sourceDept.id },
          data: { status: "ARCHIVED" },
        });

        // Log activity in target department
        await tx.departmentActivityLog.create({
          data: {
            departmentId: targetDept.id,
            action: "STAFF_ASSIGNED", // fallback category
            actorId: currentUser.id,
            details: { message: `Merged department "${sourceDept.name}" into this department.` },
          },
        });

        return { success: true };
      });
    }),

  // Archive a department
  archive: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const dept = await ctx.prisma.department.findUnique({ where: { id: input.id } });
      if (!dept || dept.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, dept.organizationId);

      const currentUser = ctx.session!.user;

      return ctx.prisma.$transaction(async (tx) => {
        const updated = await tx.department.update({
          where: { id: input.id },
          data: { status: "ARCHIVED" },
        });

        await tx.departmentActivityLog.create({
          data: {
            departmentId: input.id,
            action: "DEPT_ARCHIVED",
            actorId: currentUser.id,
          },
        });

        return updated;
      });
    }),

  // Fetch announcements for a department
  getAnnouncements: protectedProcedure
    .input(z.object({ departmentId: z.string() }))
    .query(async ({ ctx, input }) => {
      assertOrgMember(ctx, (await ctx.prisma.department.findUniqueOrThrow({ where: { id: input.departmentId } })).organizationId);
      return ctx.prisma.departmentAnnouncement.findMany({
        where: { departmentId: input.departmentId },
        orderBy: { createdAt: "desc" },
      });
    }),

  // Create an announcement in a department
  createAnnouncement: protectedProcedure
    .input(z.object({
      departmentId: z.string(),
      title: z.string().min(1),
      content: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const dept = await ctx.prisma.department.findUniqueOrThrow({ where: { id: input.departmentId } });
      await assertOrgAdmin(ctx, dept.organizationId);

      const currentUser = ctx.session!.user;

      return ctx.prisma.departmentAnnouncement.create({
        data: {
          departmentId: input.departmentId,
          title: input.title,
          content: input.content,
          createdById: currentUser.id,
        },
      });
    }),

  // Fetch documents for a department
  getDocuments: protectedProcedure
    .input(z.object({ departmentId: z.string() }))
    .query(async ({ ctx, input }) => {
      assertOrgMember(ctx, (await ctx.prisma.department.findUniqueOrThrow({ where: { id: input.departmentId } })).organizationId);
      return ctx.prisma.departmentDocument.findMany({
        where: { departmentId: input.departmentId },
        orderBy: { createdAt: "desc" },
      });
    }),

  // Track an uploaded document in a department
  uploadDocument: protectedProcedure
    .input(z.object({
      departmentId: z.string(),
      name: z.string().min(1),
      url: z.string().url(),
      fileType: z.string(),
      fileSize: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const dept = await ctx.prisma.department.findUniqueOrThrow({ where: { id: input.departmentId } });
      await assertOrgAdmin(ctx, dept.organizationId);

      const currentUser = ctx.session!.user;

      return ctx.prisma.departmentDocument.create({
        data: {
          departmentId: input.departmentId,
          name: input.name,
          url: input.url,
          fileType: input.fileType,
          fileSize: input.fileSize,
          uploadedById: currentUser.id,
        },
      });
    }),

  // Fetch activity logs for a department
  getActivityLogs: protectedProcedure
    .input(z.object({ departmentId: z.string() }))
    .query(async ({ ctx, input }) => {
      assertOrgMember(ctx, (await ctx.prisma.department.findUniqueOrThrow({ where: { id: input.departmentId } })).organizationId);
      return ctx.prisma.departmentActivityLog.findMany({
        where: { departmentId: input.departmentId },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    }),
});
