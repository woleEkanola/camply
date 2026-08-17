import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import { hasStaffCapability } from "../../auth/capabilities";
import { assertOrgAdminOrCommand } from "../trpc/scoping";
import { DepartmentMergeError, mergeDepartmentInTx } from "../../departments/merge";

const ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN"];

async function assertOrgAdmin(ctx: { session: any }, organizationId: string) {
  try {
    return await assertOrgAdminOrCommand(ctx as any, organizationId, "CAMP_STRUCTURE");
  } catch {
    // Preserve the original role-specific error below for non-command users.
  }
  const currentUser = ctx.session?.user;
  if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
  // Departments are org-wide (not centre-scoped) — LOCATION_ADMIN gets read-only, not write access.
  if (ADMIN_ROLES.includes(currentUser.role) && currentUser.organizationId === organizationId) return currentUser;
  throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to manage departments for this organization" });
}

async function deletionBlockers(prisma: any, departmentId: string) {
  const [staffCount, assignmentCount, childCount] = await Promise.all([
    prisma.staffProfile.count({ where: { departmentId, deletedAt: null, status: { in: ["PENDING", "APPROVED"] } } }),
    prisma.positionAssignment.count({ where: { isCurrent: true, position: { departmentId, deletedAt: null } } }),
    prisma.department.count({ where: { parentDepartmentId: departmentId, deletedAt: null } }),
  ]);
  return { staffCount, assignmentCount, childCount, blocked: Boolean(staffCount || assignmentCount || childCount) };
}

async function assertOrgMember(ctx: { session: any; userId: string }, organizationId: string) {
  const currentUser = ctx.session?.user;
  if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (currentUser.organizationId !== organizationId) throw new TRPCError({ code: "FORBIDDEN" });
  // Staff modules are for people with staff capability. Gate on that, not on
  // `role !== "PARENT"`: a parent who also teaches keeps role PARENT and would
  // otherwise be locked out of modules they legitimately belong to — while a
  // parent with no staff profile must still be refused.
  // See server/auth/capabilities.ts.
  if (ADMIN_ROLES.includes(currentUser.role) || currentUser.role === "CAMPUS_REPRESENTATIVE") return currentUser;
  if (await hasStaffCapability(ctx.userId, { organizationId })) return currentUser;
  throw new TRPCError({ code: "FORBIDDEN" });
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
      if (dept.systemKey === "CAMP_COMMAND") throw new TRPCError({ code: "FORBIDDEN", message: "The Camp Command department is managed automatically." });
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
      if (dept.systemKey === "CAMP_COMMAND") throw new TRPCError({ code: "FORBIDDEN", message: "The Camp Command department cannot be deleted." });
      await assertOrgAdmin(ctx, dept.organizationId);
      const blockers = await deletionBlockers(ctx.prisma, dept.id);
      if (blockers.blocked) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Move or remove this department's ${blockers.staffCount} active people, ${blockers.assignmentCount} current role assignments, and ${blockers.childCount} child departments before deleting it.`,
        });
      }
      return ctx.prisma.department.update({ where: { id: input.id }, data: { deletedAt: new Date() } });
    }),

  // Read-only preview of what blocks (or wouldn't block) deleting a
  // department, so a caller (e.g. the organogram) can explain/disable a
  // Delete button before the mutation throws, rather than only finding out
  // after clicking it.
  deletionPreview: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const dept = await ctx.prisma.department.findUnique({ where: { id: input.id } });
      if (!dept || dept.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, dept.organizationId);
      const isSystem = dept.systemKey === "CAMP_COMMAND";
      const blockers = await deletionBlockers(ctx.prisma, dept.id);
      return { ...blockers, isSystem };
    }),

  // Bulk delete (soft — Trash-recoverable) and bulk archive. Each id is
  // checked independently and contributes its own pass/fail result so one
  // blocked department doesn't stop the rest of the batch from being deleted.
  bulkDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const results: Array<{ id: string; ok: boolean; error?: string }> = [];
      for (const id of input.ids) {
        try {
          const dept = await ctx.prisma.department.findUnique({ where: { id } });
          if (!dept || dept.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Department not found." });
          if (dept.systemKey === "CAMP_COMMAND") throw new TRPCError({ code: "FORBIDDEN", message: "The Camp Command department cannot be deleted." });
          await assertOrgAdmin(ctx, dept.organizationId);
          const blockers = await deletionBlockers(ctx.prisma, id);
          if (blockers.blocked) {
            throw new TRPCError({ code: "BAD_REQUEST", message: `${blockers.staffCount} active people, ${blockers.assignmentCount} current role assignments, ${blockers.childCount} child departments still attached.` });
          }
          await ctx.prisma.department.update({ where: { id }, data: { deletedAt: new Date() } });
          results.push({ id, ok: true });
        } catch (error) {
          results.push({ id, ok: false, error: error instanceof TRPCError ? error.message : "Failed to delete this department." });
        }
      }
      return { results };
    }),

  bulkArchive: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session!.user;
      const results: Array<{ id: string; ok: boolean; error?: string }> = [];
      for (const id of input.ids) {
        try {
          const dept = await ctx.prisma.department.findUnique({ where: { id } });
          if (!dept || dept.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Department not found." });
          if (dept.systemKey === "CAMP_COMMAND") throw new TRPCError({ code: "FORBIDDEN", message: "The Camp Command department cannot be archived." });
          await assertOrgAdmin(ctx, dept.organizationId);
          await ctx.prisma.$transaction(async (tx) => {
            await tx.department.update({ where: { id }, data: { status: "ARCHIVED" } });
            await tx.departmentActivityLog.create({ data: { departmentId: id, action: "DEPT_ARCHIVED", actorId: currentUser.id } });
          });
          results.push({ id, ok: true });
        } catch (error) {
          results.push({ id, ok: false, error: error instanceof TRPCError ? error.message : "Failed to archive this department." });
        }
      }
      return { results };
    }),

  updateResponsibilities: protectedProcedure
    .input(z.object({ id: z.string(), responsibilities: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const dept = await ctx.prisma.department.findUnique({ where: { id: input.id } });
      if (!dept || dept.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      if (dept.systemKey === "CAMP_COMMAND") throw new TRPCError({ code: "FORBIDDEN", message: "The Camp Command department is managed automatically." });
      await assertOrgAdmin(ctx, dept.organizationId);
      return ctx.prisma.department.update({ where: { id: input.id }, data: { responsibilities: input.responsibilities } });
    }),

  // Duplicate a department along with its default positions (no assignments)
  duplicate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const sourceDept = await ctx.prisma.department.findUnique({ where: { id: input.id } });
      if (!sourceDept || sourceDept.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      if (sourceDept.systemKey === "CAMP_COMMAND") throw new TRPCError({ code: "FORBIDDEN", message: "The Camp Command department cannot be duplicated." });
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
      if (sourceDept.systemKey === "CAMP_COMMAND" || targetDept.systemKey === "CAMP_COMMAND") {
        throw new TRPCError({ code: "FORBIDDEN", message: "The Camp Command department cannot be merged." });
      }
      await assertOrgAdmin(ctx, sourceDept.organizationId);

      try {
        return await ctx.prisma.$transaction(
          (tx) => mergeDepartmentInTx(tx, { sourceId: input.sourceId, targetId: input.targetId, actorId: ctx.userId }),
          { timeout: 30_000 }
        );
      } catch (error) {
        if (error instanceof DepartmentMergeError) {
          throw new TRPCError({ code: error.code as any, message: error.message });
        }
        throw error;
      }
    }),

  // Archive a department
  archive: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const dept = await ctx.prisma.department.findUnique({ where: { id: input.id } });
      if (!dept || dept.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      if (dept.systemKey === "CAMP_COMMAND") throw new TRPCError({ code: "FORBIDDEN", message: "The Camp Command department cannot be archived." });
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
      // NOTE: `await` was missing here — assertOrgMember is async, so the
      // rejection floated free and the mutation ran regardless of the check.
      await assertOrgMember(ctx, (await ctx.prisma.department.findUniqueOrThrow({ where: { id: input.departmentId } })).organizationId);
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
      // NOTE: `await` was missing here — assertOrgMember is async, so the
      // rejection floated free and the mutation ran regardless of the check.
      await assertOrgMember(ctx, (await ctx.prisma.department.findUniqueOrThrow({ where: { id: input.departmentId } })).organizationId);
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
      // NOTE: `await` was missing here — assertOrgMember is async, so the
      // rejection floated free and the mutation ran regardless of the check.
      await assertOrgMember(ctx, (await ctx.prisma.department.findUniqueOrThrow({ where: { id: input.departmentId } })).organizationId);
      return ctx.prisma.departmentActivityLog.findMany({
        where: { departmentId: input.departmentId },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    }),
});
