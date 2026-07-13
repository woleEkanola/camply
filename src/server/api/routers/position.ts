import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import { syncStaffProfileFromPositions, syncPositionOccupantsAndDescendants } from "../../utils/hierarchySync";

const ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN"];

function assertStaffAccess(ctx: { session: any }) {
  const currentUser = ctx.session?.user;
  if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (currentUser.role === "PARENT") throw new TRPCError({ code: "FORBIDDEN" });
  return currentUser;
}

async function assertCanManageCamp(ctx: { prisma: any; session: any }, campId: string) {
  const camp = await ctx.prisma.camp.findUnique({ where: { id: campId } });
  if (!camp) throw new TRPCError({ code: "NOT_FOUND", message: "Camp not found" });
  const currentUser = ctx.session?.user;
  if (!ADMIN_ROLES.includes(currentUser.role) && currentUser.organizationId !== camp.organizationId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

export const positionRouter = createTRPCRouter({
  // Fetch full tree structure of positions for the hierarchy views
  getHierarchy: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      assertStaffAccess(ctx);

      const positions = await ctx.prisma.position.findMany({
        where: { campId: input.campId, deletedAt: null },
        include: {
          department: true,
          assignments: {
            where: { isCurrent: true },
            include: { staff: true },
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
      assertStaffAccess(ctx);
      await assertCanManageCamp(ctx, input.campId);

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
    }))
    .mutation(async ({ ctx, input }) => {
      const position = await ctx.prisma.position.findUnique({
        where: { id: input.id },
      });
      if (!position || position.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCanManageCamp(ctx, position.campId);

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
        let currentParentId: string | null = input.parentPositionId;
        while (currentParentId) {
          const parentNode: { parentPositionId: string | null } | null = await ctx.prisma.position.findUnique({
            where: { id: currentParentId },
            select: { parentPositionId: true },
          });
          if (parentNode?.parentPositionId === input.id) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Moving this position would create a reporting cycle." });
          }
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

      const firstPos = await ctx.prisma.position.findUnique({
        where: { id: input.orders[0].id },
      });
      if (!firstPos) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCanManageCamp(ctx, firstPos.campId);

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
