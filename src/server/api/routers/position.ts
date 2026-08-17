import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import { hasStaffCapability } from "../../auth/capabilities";

const STAFF_MODULE_ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"];
import { syncStaffProfileFromPositions, syncPositionOccupantsAndDescendants } from "../../utils/hierarchySync";
import { assertCanManageCamp, assertOrgAdmin, assertCampCommandAppointer } from "../trpc/scoping";
import { logEvent } from "../../audit";
import { mergePositionInTx, PositionMergeError } from "../../positions/merge";

const norm = (s: string) => s.trim().toLowerCase();

/**
 * `kind: "SEAT"` covers anything that fills, empties, or destroys a
 * leadership seat itself (e.g. deleting an Assistant Commandant ROLE) —
 * these require the strict `assertCampCommandAppointer` gate (OWNER/ADMIN
 * only, never falls through to command-permission checks) so that a sitting
 * Commandant can't remove/replace assistants or dissolve their own seat.
 * `kind: "STRUCTURE"` covers ordinary structural edits (move/reorder/rename)
 * and always uses the looser `assertCanManageCamp`, which a sitting
 * Commandant or Camp Head also passes — appropriate for everyday org-chart
 * upkeep that isn't about who holds power.
 */
async function assertPositionWriteAllowed(
  ctx: { prisma: any; session: any },
  position: { campId: string; leadershipRole: string | null },
  kind: "SEAT" | "STRUCTURE"
) {
  if (kind === "SEAT" && position.leadershipRole) {
    return assertCampCommandAppointer(ctx, position.campId);
  }
  return assertCanManageCamp(ctx, position.campId);
}

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
      // The Commandant seat is the fixed top of the hierarchy — never
      // renamable. Assistants (and every ordinary role) may be renamed;
      // renaming/editing an assistant is a "SEAT" write since it's still a
      // leadership position, so it requires the strict appointer gate.
      if (position.leadershipRole === "COMMANDANT" && input.name !== undefined) {
        throw new TRPCError({ code: "FORBIDDEN", message: "The Camp Commandant role cannot be renamed." });
      }
      await assertPositionWriteAllowed(ctx, position, "SEAT");

      // Granting/revoking the Camp Head flag itself is deliberately gated
      // tighter than ordinary position edits: assertCanManageCamp above
      // already lets a *current* Camp Head pass, and if that were enough to
      // also toggle grantsManageCamp, a Camp Head could grant the flag to
      // arbitrary other positions (or keep it after being reassigned) —
      // unbounded privilege escalation. Only a true org admin may change it.
      // A leadership row already carries Camp Command permissions of its
      // own — stacking grantsManageCamp/grantsAwardPoints on it as well
      // would be redundant and widen the blast radius, so refuse outright.
      if (position.leadershipRole && (input.grantsManageCamp !== undefined || input.grantsAwardPoints !== undefined)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Camp Command positions cannot be granted additional camp-management flags." });
      }
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
      // The Commandant is the fixed top of the hierarchy and never moves.
      if (position.leadershipRole === "COMMANDANT") {
        throw new TRPCError({ code: "FORBIDDEN", message: "The Camp Commandant is the top of the hierarchy and cannot be moved." });
      }
      await assertPositionWriteAllowed(ctx, position, "STRUCTURE");

      // Prevent cycles (cannot report to itself or its descendants)
      if (input.parentPositionId) {
        if (input.parentPositionId === input.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A position cannot report to itself." });
        }

        // Walk up from target parent to check for cycles
        const targetParent = await ctx.prisma.position.findFirst({
          where: { id: input.parentPositionId, campId: position.campId, deletedAt: null },
          select: { id: true, leadershipRole: true },
        });
        if (!targetParent) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "The selected parent position is not in this camp." });
        }

        // Fluid nesting for Assistant Commandants, but they may only report
        // to another leadership row (the Commandant or another Assistant) —
        // ordinary roles hang off Camp Command departmentally, not the chain
        // of command itself.
        if (position.leadershipRole === "ASSISTANT_COMMANDANT" && !targetParent.leadershipRole) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "An Assistant Commandant can only report to the Commandant or another Assistant Commandant." });
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
      if (positions.some((candidate) => candidate.leadershipRole === "COMMANDANT")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "The Camp Commandant cannot be reordered." });
      }
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
      // Deliberately kept closed even from the organogram: assertCanManageCamp
      // below passes a sitting Commandant, so relaxing this would let a
      // Commandant seat their own peers/successors. Leadership seating goes
      // exclusively through campCommand.appointToPosition's strict gate.
      if (position.leadershipRole) throw new TRPCError({ code: "FORBIDDEN", message: "Use campCommand.appointToPosition for Camp Command seats." });
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
      if (position.leadershipRole) throw new TRPCError({ code: "FORBIDDEN", message: "Use Camp Command settings to remove leadership appointments." });
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

  // Soft delete a position. Children are promoted up one level (re-parented
  // to the deleted position's own parent) — never orphaned, never cascaded.
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const position = await ctx.prisma.position.findUnique({
        where: { id: input.id },
      });
      if (!position || position.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      // The Commandant is the fixed top of the hierarchy and can never be
      // deleted. Deleting an Assistant seat is a "SEAT" write (OWNER/ADMIN
      // only via the strict gate); ordinary roles use the looser gate.
      if (position.leadershipRole === "COMMANDANT") {
        throw new TRPCError({ code: "FORBIDDEN", message: "The Camp Commandant cannot be deleted." });
      }
      await assertPositionWriteAllowed(ctx, position, "SEAT");

      const now = new Date();

      return ctx.prisma.$transaction(async (tx) => {
        // Re-read inside the transaction — the outer read above happened
        // before any lock was held, so two concurrent deletes could both
        // pass the initial check.
        const fresh = await tx.position.findUnique({ where: { id: input.id } });
        if (!fresh || fresh.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });

        const children = await tx.position.findMany({
          where: { parentPositionId: input.id, deletedAt: null },
          select: { id: true },
        });

        // Promote children up one level — a deleted root leaves its
        // children as new roots (parentPositionId becomes null).
        if (children.length > 0) {
          await tx.position.updateMany({
            where: { parentPositionId: input.id, deletedAt: null },
            data: { parentPositionId: fresh.parentPositionId },
          });
        }

        // Clear active assignments
        const assignments = await tx.positionAssignment.findMany({
          where: { positionId: input.id, isCurrent: true },
          select: { staffId: true },
        });
        await tx.positionAssignment.updateMany({
          where: { positionId: input.id, isCurrent: true },
          data: { isCurrent: false, endDate: now },
        });

        // Detach any checklist items pointing at this position rather than
        // leaving them referencing a soft-deleted row.
        await tx.departmentChecklistItem.updateMany({
          where: { positionId: input.id },
          data: { positionId: null },
        });

        // Soft delete the position
        const deleted = await tx.position.update({
          where: { id: input.id },
          data: { deletedAt: now },
        });

        // Sync legacy columns on affected staff who lost their seat...
        for (const a of assignments) {
          await syncStaffProfileFromPositions(tx, a.staffId);
        }
        // ...and on every promoted child's subtree, whose reportsTo chain
        // now runs through a different occupant (or none) at this level.
        for (const child of children) {
          await syncPositionOccupantsAndDescendants(tx, child.id);
        }

        await logEvent(tx, {
          organizationId: (await tx.camp.findUnique({ where: { id: fresh.campId }, select: { organizationId: true } }))!.organizationId,
          actorId: ctx.userId,
          action: "POSITION_DELETED",
          subjectType: "POSITION",
          subjectId: input.id,
          previousValue: { name: fresh.name, parentPositionId: fresh.parentPositionId },
          newValue: { promotedChildIds: children.map((c) => c.id) },
        });

        return { deleted, promotedChildCount: children.length };
      });
    }),

  // Absorbs `sourceId` into `targetId` — moves assignments/children/checklist
  // items onto the target and soft-deletes the source. Used both for
  // ordinary role cleanup and for resolving the duplicate Camp Command rows
  // `campCommand.appoint`'s old bug could produce (an untagged JD twin
  // merging into the real leadership row).
  merge: protectedProcedure
    .input(z.object({ sourceId: z.string(), targetId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [source, target] = await Promise.all([
        ctx.prisma.position.findUnique({ where: { id: input.sourceId } }),
        ctx.prisma.position.findUnique({ where: { id: input.targetId } }),
      ]);
      if (!source || source.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Source role not found." });
      if (!target || target.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Target role not found." });
      if (source.campId !== target.campId) throw new TRPCError({ code: "BAD_REQUEST", message: "Both roles must belong to the same camp." });

      // Either side being a leadership row means this merge changes who can
      // hold a Camp Command seat — strict gate. Otherwise the ordinary
      // structural gate applies.
      if (source.leadershipRole || target.leadershipRole) {
        await assertCampCommandAppointer(ctx, source.campId);
      } else {
        await assertCanManageCamp(ctx, source.campId);
      }

      try {
        return await ctx.prisma.$transaction((tx: any) =>
          mergePositionInTx(tx, { sourceId: input.sourceId, targetId: input.targetId, actorId: ctx.userId })
        );
      } catch (err) {
        if (err instanceof PositionMergeError) {
          throw new TRPCError({ code: err.code as any, message: err.message });
        }
        throw err;
      }
    }),

  // Groups live positions by normalized name within a department (plus a
  // camp-wide group for leadership rows, which sit outside the department
  // name-scoping) so the organogram can flag likely duplicates for the user
  // to resolve via `merge`. Read-only users get an empty list.
  duplicateGroups: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = await assertStaffAccess(ctx);
      const canWrite = ["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"].includes(currentUser.role);
      if (!canWrite) return [];

      const positions = await ctx.prisma.position.findMany({
        where: { campId: input.campId, deletedAt: null },
        select: { id: true, name: true, departmentId: true, leadershipRole: true, createdAt: true, _count: { select: { assignments: { where: { isCurrent: true } } } } },
        orderBy: { createdAt: "asc" },
      });

      // Grouped by department + normalized name — leadership rows (which
      // always live in the Camp Command department) fall out of this
      // naturally: two rows both named "Camp Commandant" group together,
      // while distinctly-named assistants correctly stay apart rather than
      // being flagged as duplicates of each other or of the Commandant.
      const groups = new Map<string, typeof positions>();
      for (const position of positions) {
        const key = `${position.departmentId ?? "none"}:${norm(position.name)}`;
        const list = groups.get(key) ?? [];
        list.push(position);
        groups.set(key, list);
      }

      return Array.from(groups.entries())
        .filter(([, rows]) => rows.length > 1)
        .map(([key, rows]) => ({
          key,
          name: rows[0].name,
          departmentId: rows[0].departmentId,
          rows: rows.map((r) => ({ id: r.id, name: r.name, leadershipRole: r.leadershipRole, occupantCount: r._count.assignments, createdAt: r.createdAt })),
        }));
    }),
});
