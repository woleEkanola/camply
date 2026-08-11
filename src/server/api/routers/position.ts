import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import { hasStaffCapability } from "../../auth/capabilities";

const STAFF_MODULE_ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"];
import { syncStaffProfileFromPositions, syncPositionOccupantsAndDescendants } from "../../utils/hierarchySync";
import { assertCanManageCamp, assertOrgAdmin } from "../trpc/scoping";

async function assertStaffAccess(ctx: { session: any; userId: string }) {
  const currentUser = ctx.session?.user;
  if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
  // Staff modules are for people with staff capability. Gate on that, not on
  // `role !== "PARENT"`: a parent who also teaches keeps role PARENT and would
  // otherwise be locked out of modules they legitimately belong to — while a
  // parent with no staff profile must still be refused.
  // See server/auth/capabilities.ts.
  if (STAFF_MODULE_ADMIN_ROLES.includes(currentUser.role)) return currentUser;
  if (await hasStaffCapability(ctx.userId, { organizationId: currentUser.organizationId ?? undefined })) {
    return currentUser;
  }
  throw new TRPCError({ code: "FORBIDDEN", message: "Not available for this account type" });
}

export const positionRouter = createTRPCRouter({
  // Fetch full tree structure of positions for the hierarchy views
  getHierarchy: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertStaffAccess(ctx);

      const positions = await ctx.prisma.position.findMany({
        where: { campId: input.campId, deletedAt: null },
        include: {
          department: true,
          assignments: {
            where: { isCurrent: true },
            // Enriched beyond plain scalars so the Chain of Command view
            // (src/components/orgStructure/ChainOfCommand.tsx) can open
            // StaffProfileSheet directly from an occupant here, with the
            // same Campus/Tribe/Hostel/Reports-To detail it shows elsewhere.
            include: {
              staff: {
                include: { preferredCampus: true, assignedTribe: true, assignedHostel: true, reportsTo: true, reportsToUser: true },
              },
            },
          },
        },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      });

      // Build nested tree structure of positions
      type PositionNode = typeof positions[number] & { children: PositionNode[] };
      const nodeMap = new Map<string, PositionNode>();

      for (const pos of positions) {
        nodeMap.set(pos.id, { ...pos, children: [] });
      }

      const roots: PositionNode[] = [];

      for (const node of nodeMap.values()) {
        if (node.parentPositionId && nodeMap.has(node.parentPositionId)) {
          nodeMap.get(node.parentPositionId)!.children.push(node);
        } else {
          roots.push(node);
        }
      }

      return roots;
    }),

  // Create a new position
  create: protectedProcedure
    .input(z.object({
      campId: z.string(),
      name: z.string().min(1),
      departmentId: z.string().nullable().optional(),
      parentPositionId: z.string().nullable().optional(),
      displayOrder: z.number().int().min(0).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertStaffAccess(ctx);
      await assertCanManageCamp(ctx, input.campId);

      if (input.parentPositionId) {
        const parent = await ctx.prisma.position.findFirst({
          where: { id: input.parentPositionId, campId: input.campId, deletedAt: null },
          select: { id: true },
        });
        if (!parent) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected parent position is not in this camp." });
      }

      return ctx.prisma.position.create({
        data: {
          campId: input.campId,
          name: input.name,
          departmentId: input.departmentId ?? null,
          parentPositionId: input.parentPositionId ?? null,
          displayOrder: input.displayOrder ?? 0,
        },
      });
    }),

  // Update position attributes
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
      grantsManageCamp: z.boolean().optional(),
      grantsAwardPoints: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const position = await ctx.prisma.position.findUnique({
        where: { id: input.id },
      });
      if (!position || position.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCanManageCamp(ctx, position.campId);

      // Granting/revoking the Camp Head flag itself is deliberately gated
      // tighter than ordinary position edits: assertCanManageCamp above
      // already lets a *current* Camp Head pass, and if that were enough to
      // also toggle grantsManageCamp, a Camp Head could grant the flag to
      // arbitrary other positions (or keep it after being reassigned) —
      // unbounded privilege escalation. Only a true org admin may change it.
      if (input.grantsManageCamp !== undefined || input.grantsAwardPoints !== undefined) {
        const camp = await ctx.prisma.camp.findUnique({ where: { id: position.campId } });
        await assertOrgAdmin(ctx, camp!.organizationId);
      }

      const { id, ...data } = input;
      return ctx.prisma.position.update({
        where: { id },
        data,
      });
    }),

  // Move position to a different parent (Drag & Drop reporting structure)
  movePosition: protectedProcedure
    .input(z.object({
      id: z.string(),
      parentPositionId: z.string().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const position = await ctx.prisma.position.findUnique({
        where: { id: input.id },
      });
      if (!position || position.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCanManageCamp(ctx, position.campId);

      // Prevent cycles (cannot report to itself or its descendants)
      if (input.parentPositionId) {
        if (input.parentPositionId === input.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A position cannot report to itself." });
        }

        // Walk up from target parent to check for cycles
        const targetParent = await ctx.prisma.position.findFirst({
          where: { id: input.parentPositionId, campId: position.campId, deletedAt: null },
          select: { id: true },
        });
        if (!targetParent) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "The selected parent position is not in this camp." });
        }

        let currentParentId: string | null = input.parentPositionId;
        while (currentParentId) {
          if (currentParentId === input.id) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Moving this position would create a reporting cycle." });
          }
          const parentNode: { parentPositionId: string | null } | null = await ctx.prisma.position.findUnique({
            where: { id: currentParentId },
            select: { parentPositionId: true },
          });
          currentParentId = parentNode?.parentPositionId ?? null;
        }
      }

      return ctx.prisma.$transaction(async (tx) => {
        const updated = await tx.position.update({
          where: { id: input.id },
          data: { parentPositionId: input.parentPositionId },
        });

        // Sync legacy fields on affected staff members
        await syncPositionOccupantsAndDescendants(tx, input.id);
        return updated;
      });
    }),

  // Bulk reordering display orders
  reorderPositions: protectedProcedure
    .input(z.object({
      orders: z.array(z.object({
        id: z.string(),
        displayOrder: z.number().int().min(0),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.orders.length === 0) return { success: true };

      const orderedIds = input.orders.map((order) => order.id);
      if (new Set(orderedIds).size !== orderedIds.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Each position can only appear once." });
      }
      const positions = await ctx.prisma.position.findMany({ where: { id: { in: orderedIds }, deletedAt: null } });
      const firstPos = positions[0];
      if (!firstPos) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCanManageCamp(ctx, firstPos.campId);
      if (positions.length !== orderedIds.length || positions.some((candidate) => candidate.campId !== firstPos.campId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Positions must belong to the same camp." });
      }

      await ctx.prisma.$transaction(
        input.orders.map((o) =>
          ctx.prisma.position.update({
            where: { id: o.id },
            data: { displayOrder: o.displayOrder },
          })
        )
      );

      return { success: true };
    }),

  // Assign staff to position (updates PositionAssignment)
  assignPosition: protectedProcedure
    .input(z.object({
      positionId: z.string(),
      staffId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const position = await ctx.prisma.position.findUnique({
        where: { id: input.positionId },
      });
      if (!position || position.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCanManageCamp(ctx, position.campId);

      const staff = await ctx.prisma.staffProfile.findUnique({
        where: { id: input.staffId },
      });
      if (!staff || staff.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      if (staff.campId !== position.campId) throw new TRPCError({ code: "BAD_REQUEST", message: "Staff and position must belong to the same camp." });
      if (staff.status !== "APPROVED") throw new TRPCError({ code: "BAD_REQUEST", message: "Only approved staff can hold a position." });

      const currentUser = ctx.session!.user;

      return ctx.prisma.$transaction(async (tx) => {
        // 1. Mark previous active assignments to this position as inactive
        await tx.positionAssignment.updateMany({
          where: { positionId: input.positionId, isCurrent: true },
          data: { isCurrent: false, endDate: new Date() },
        });

        // 2. Create the new assignment
        const newAssignment = await tx.positionAssignment.create({
          data: {
            positionId: input.positionId,
            staffId: input.staffId,
            isCurrent: true,
          },
        });

        // 3. Log to Department Activity Log if position belongs to a department
        if (position.departmentId) {
          const isHOD = position.name.toLowerCase().endsWith("head") && !position.name.toLowerCase().includes("assistant");
          await tx.departmentActivityLog.create({
            data: {
              departmentId: position.departmentId,
              action: isHOD ? "HEAD_CHANGED" : "STAFF_ASSIGNED",
              actorId: currentUser.id,
              details: {
                staffId: staff.id,
                staffName: `${staff.firstName} ${staff.lastName}`,
                positionId: position.id,
                positionName: position.name,
              },
            },
          });
        }

        // 4. Sync legacy columns in StaffProfile
        await syncStaffProfileFromPositions(tx, input.staffId);
        await syncPositionOccupantsAndDescendants(tx, input.positionId);

        return newAssignment;
      });
    }),

  // Unassign staff member from position
  unassignPosition: protectedProcedure
    .input(z.object({
      positionId: z.string(),
      staffId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const position = await ctx.prisma.position.findUnique({
        where: { id: input.positionId },
      });
      if (!position || position.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCanManageCamp(ctx, position.campId);

      const staff = await ctx.prisma.staffProfile.findUnique({
        where: { id: input.staffId },
      });
      if (!staff) throw new TRPCError({ code: "NOT_FOUND" });

      const currentUser = ctx.session!.user;

      return ctx.prisma.$transaction(async (tx) => {
        // Terminate assignment
        await tx.positionAssignment.updateMany({
          where: { positionId: input.positionId, staffId: input.staffId, isCurrent: true },
          data: { isCurrent: false, endDate: new Date() },
        });

        // Log to Department Activity Log
        if (position.departmentId) {
          await tx.departmentActivityLog.create({
            data: {
              departmentId: position.departmentId,
              action: "STAFF_REMOVED",
              actorId: currentUser.id,
              details: {
                staffId: staff.id,
                staffName: `${staff.firstName} ${staff.lastName}`,
                positionId: position.id,
                positionName: position.name,
              },
            },
          });
        }

        // Sync legacy columns
        await syncStaffProfileFromPositions(tx, input.staffId);
        await syncPositionOccupantsAndDescendants(tx, input.positionId);

        return { success: true };
      });
    }),

  // Soft delete a position
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const position = await ctx.prisma.position.findUnique({
        where: { id: input.id },
      });
      if (!position || position.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCanManageCamp(ctx, position.campId);

      const now = new Date();

      return ctx.prisma.$transaction(async (tx) => {
        // Clear active assignments
        const assignments = await tx.positionAssignment.findMany({
          where: { positionId: input.id, isCurrent: true },
          select: { staffId: true },
        });

        await tx.positionAssignment.updateMany({
          where: { positionId: input.id, isCurrent: true },
          data: { isCurrent: false, endDate: now },
        });

        // Soft delete the position
        const deleted = await tx.position.update({
          where: { id: input.id },
          data: { deletedAt: now },
        });

        // Sync legacy columns on affected staff
        for (const a of assignments) {
          await syncStaffProfileFromPositions(tx, a.staffId);
        }

        return deleted;
      });
    }),
});
