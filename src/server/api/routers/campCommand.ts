import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import {
  CAMP_COMMAND_PERMISSIONS,
  sanitizeCampCommandPermissions,
} from "../../../lib/campCommand";
import { getCampCommandAccess } from "../../auth/campCommand";
import { assertCampCommandAppointer } from "../trpc/scoping";
import { syncPositionOccupantsAndDescendants, syncStaffProfileFromPositions } from "../../utils/hierarchySync";
import { ensureCampCommandStructure } from "../../campCommand/structure";
import { logEvent } from "../../audit";

const permissionSchema = z.enum(CAMP_COMMAND_PERMISSIONS);
const accessModeSchema = z.enum(["INHERIT", "FULL", "CUSTOM"]);
const leadershipRoleSchema = z.enum(["COMMANDANT", "ASSISTANT_COMMANDANT"]);

const assertCommandManager = assertCampCommandAppointer;

/**
 * Shared core of "put this staff member in this leadership seat" — used by
 * both the legacy `appoint` (campId + role) and the organogram-side
 * `appointToPosition` (a specific positionId). Ends the seat's current
 * holder and the staff's other current leadership assignments in this camp
 * (safe now that Camp Command splits the shared assistant row into one
 * position per holder — see structure.ts — so "end other current holders of
 * this exact position" no longer risks unseating unrelated assistants).
 */
async function appointStaffToPositionInTx(
  tx: any,
  input: {
    organizationId: string;
    campId: string;
    positionId: string;
    staff: { id: string; userId: string; firstName: string | null; lastName: string | null };
    role: "COMMANDANT" | "ASSISTANT_COMMANDANT";
    accessMode: "INHERIT" | "FULL" | "CUSTOM";
    permissions: string[];
    actorId: string;
  }
) {
  await tx.positionAssignment.updateMany({
    where: {
      isCurrent: true,
      OR: [
        { positionId: input.positionId },
        { staffId: input.staff.id, position: { leadershipRole: { not: null }, campId: input.campId } },
      ],
    },
    data: { isCurrent: false, endDate: new Date() },
  });

  const assignment = await tx.positionAssignment.create({
    data: {
      positionId: input.positionId,
      staffId: input.staff.id,
      accessMode: input.accessMode,
      permissions: sanitizeCampCommandPermissions(input.permissions),
    },
  });
  await syncStaffProfileFromPositions(tx, input.staff.id);
  await syncPositionOccupantsAndDescendants(tx, input.positionId);
  await tx.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: input.role === "COMMANDANT" ? "CAMP_COMMANDANT_APPOINTED" : "ASSISTANT_COMMANDANT_APPOINTED",
      subjectType: "POSITION_ASSIGNMENT",
      subjectId: assignment.id,
      newValue: { staffId: input.staff.id, name: `${input.staff.firstName} ${input.staff.lastName}`, role: input.role, accessMode: input.accessMode, permissions: input.permissions },
    },
  });
  await tx.notification.create({
    data: {
      organizationId: input.organizationId,
      userId: input.staff.userId,
      title: input.role === "COMMANDANT" ? "You are now Camp Commandant" : "You are now an Assistant Camp Commandant",
      body: "Your Camp Command access is now available from the context switcher.",
      link: "/admin",
    },
  });
  return assignment;
}

export const campCommandRouter = createTRPCRouter({
  myAccess: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(({ ctx, input }) => getCampCommandAccess(ctx, input.campId)),

  overview: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertCommandManager(ctx, input.campId);
      const [policy, positions, teachers] = await Promise.all([
        ctx.prisma.campCommandPolicy.findUnique({ where: { campId: input.campId } }),
        ctx.prisma.position.findMany({
          where: { campId: input.campId, leadershipRole: { not: null }, deletedAt: null },
          include: {
            assignments: {
              where: { isCurrent: true, OR: [{ endDate: null }, { endDate: { gte: new Date() } }] },
              include: { staff: { select: { id: true, userId: true, firstName: true, lastName: true, email: true, photoUrl: true } } },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: { displayOrder: "asc" },
        }),
        ctx.prisma.staffProfile.findMany({
          where: { campId: input.campId, type: "TEACHER", status: "APPROVED", deletedAt: null },
          select: { id: true, firstName: true, lastName: true, email: true, photoUrl: true },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        }),
      ]);
      return { policy, positions, teachers };
    }),

  ensureStructure: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const camp = await assertCommandManager(ctx, input.campId);
      return ctx.prisma.$transaction((tx: any) =>
        ensureCampCommandStructure(tx, input.campId, camp.organizationId, { reparentOrphans: true, actorId: ctx.userId })
      );
    }),

  updatePolicy: protectedProcedure
    .input(z.object({
      campId: z.string(),
      commandantMode: z.enum(["FULL", "CUSTOM"]),
      commandantPermissions: z.array(permissionSchema),
      assistantDefaultMode: z.enum(["FULL", "CUSTOM"]),
      assistantDefaultPermissions: z.array(permissionSchema),
    }))
    .mutation(async ({ ctx, input }) => {
      const camp = await assertCommandManager(ctx, input.campId);
      const previous = await ctx.prisma.campCommandPolicy.findUnique({ where: { campId: input.campId } });
      const updated = await ctx.prisma.campCommandPolicy.upsert({
        where: { campId: input.campId },
        create: {
          campId: input.campId,
          commandantMode: input.commandantMode,
          commandantPermissions: sanitizeCampCommandPermissions(input.commandantPermissions),
          assistantDefaultMode: input.assistantDefaultMode,
          assistantDefaultPermissions: sanitizeCampCommandPermissions(input.assistantDefaultPermissions),
          updatedById: ctx.userId,
        },
        update: {
          commandantMode: input.commandantMode,
          commandantPermissions: sanitizeCampCommandPermissions(input.commandantPermissions),
          assistantDefaultMode: input.assistantDefaultMode,
          assistantDefaultPermissions: sanitizeCampCommandPermissions(input.assistantDefaultPermissions),
          updatedById: ctx.userId,
        },
      });
      await ctx.prisma.auditLog.create({
        data: {
          organizationId: camp.organizationId,
          actorId: ctx.userId,
          action: "CAMP_COMMAND_POLICY_UPDATED",
          subjectType: "CAMP_COMMAND_POLICY",
          subjectId: updated.id,
          previousValue: previous ?? undefined,
          newValue: updated,
        },
      });
      return updated;
    }),

  appoint: protectedProcedure
    .input(z.object({
      campId: z.string(),
      staffId: z.string(),
      role: leadershipRoleSchema,
      accessMode: accessModeSchema.default("INHERIT"),
      permissions: z.array(permissionSchema).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const camp = await assertCommandManager(ctx, input.campId);
      const staff = await ctx.prisma.staffProfile.findFirst({
        where: { id: input.staffId, campId: input.campId, type: "TEACHER", status: "APPROVED", deletedAt: null },
        select: { id: true, userId: true, firstName: true, lastName: true },
      });
      if (!staff) throw new TRPCError({ code: "BAD_REQUEST", message: "Only an approved teacher from this camp can hold a Camp Command position." });

      return ctx.prisma.$transaction(async (tx: any) => {
        // Resolve the target position cheaply — only fall back to the full
        // reconcile when nothing usable is found, instead of running it on
        // every single appointment (the old behaviour, and the reason
        // duplicates compounded so fast).
        let positionId: string;
        if (input.role === "COMMANDANT") {
          const commandant = await tx.position.findFirst({ where: { campId: input.campId, leadershipRole: "COMMANDANT", deletedAt: null } });
          positionId = commandant?.id ?? (await ensureCampCommandStructure(tx, input.campId, camp.organizationId, { reparentOrphans: false, actorId: ctx.userId })).commandantPosition.id;
        } else {
          const vacant = await tx.position.findFirst({
            where: { campId: input.campId, leadershipRole: "ASSISTANT_COMMANDANT", deletedAt: null, assignments: { none: { isCurrent: true } } },
            orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
          });
          if (vacant) {
            positionId = vacant.id;
          } else {
            const anyAssistant = await tx.position.findFirst({ where: { campId: input.campId, leadershipRole: "ASSISTANT_COMMANDANT", deletedAt: null } });
            if (!anyAssistant) {
              positionId = (await ensureCampCommandStructure(tx, input.campId, camp.organizationId, { reparentOrphans: false, actorId: ctx.userId })).assistantPosition.id;
            } else {
              // Every existing assistant seat is occupied — create a new,
              // distinct assistant role rather than bumping someone.
              const commandant = await tx.position.findFirstOrThrow({ where: { campId: input.campId, leadershipRole: "COMMANDANT", deletedAt: null } });
              const assistantCount = await tx.position.count({ where: { campId: input.campId, leadershipRole: "ASSISTANT_COMMANDANT", deletedAt: null } });
              const created = await tx.position.create({
                data: {
                  campId: input.campId,
                  departmentId: commandant.departmentId,
                  parentPositionId: commandant.id,
                  name: `Assistant Camp Commandant ${assistantCount + 1}`,
                  leadershipRole: "ASSISTANT_COMMANDANT",
                  displayOrder: -90 + assistantCount,
                },
              });
              positionId = created.id;
            }
          }
        }

        return appointStaffToPositionInTx(tx, {
          organizationId: camp.organizationId,
          campId: input.campId,
          positionId,
          staff,
          role: input.role,
          accessMode: input.accessMode,
          permissions: input.permissions,
          actorId: ctx.userId,
        });
      });
    }),

  // Appoints (or replaces) the holder of a SPECIFIC Camp Command position —
  // the organogram-side path, as opposed to `appoint`'s "give me a
  // Commandant/Assistant seat, I don't care which row". Never runs the
  // structure reconcile; the position must already exist.
  appointToPosition: protectedProcedure
    .input(z.object({
      positionId: z.string(),
      staffId: z.string(),
      accessMode: accessModeSchema.default("INHERIT"),
      permissions: z.array(permissionSchema).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const position = await ctx.prisma.position.findUnique({ where: { id: input.positionId } });
      if (!position || position.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      if (!position.leadershipRole) throw new TRPCError({ code: "BAD_REQUEST", message: "This is not a Camp Command position." });
      const leadershipRole = position.leadershipRole;
      const camp = await assertCommandManager(ctx, position.campId);

      const staff = await ctx.prisma.staffProfile.findFirst({
        where: { id: input.staffId, campId: position.campId, type: "TEACHER", status: "APPROVED", deletedAt: null },
        select: { id: true, userId: true, firstName: true, lastName: true },
      });
      if (!staff) throw new TRPCError({ code: "BAD_REQUEST", message: "Only an approved teacher from this camp can hold a Camp Command position." });

      return ctx.prisma.$transaction((tx: any) =>
        appointStaffToPositionInTx(tx, {
          organizationId: camp.organizationId,
          campId: position.campId,
          positionId: position.id,
          staff,
          role: leadershipRole,
          accessMode: input.accessMode,
          permissions: input.permissions,
          actorId: ctx.userId,
        })
      );
    }),

  // Creates a new, distinctly-named Assistant Commandant role — the
  // organogram-side alternative to relying on `appoint`'s auto-numbered
  // fallback name. Defaults to nesting under the Commandant; may also nest
  // under another Assistant, per the fluid-nesting requirement.
  createAssistantRole: protectedProcedure
    .input(z.object({
      campId: z.string(),
      name: z.string().min(1).max(120),
      parentPositionId: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const camp = await assertCommandManager(ctx, input.campId);

      const collision = await ctx.prisma.position.findFirst({
        where: { campId: input.campId, leadershipRole: { not: null }, deletedAt: null, name: { equals: input.name.trim(), mode: "insensitive" } },
      });
      if (collision) throw new TRPCError({ code: "CONFLICT", message: "A Camp Command role with that name already exists." });

      return ctx.prisma.$transaction(async (tx: any) => {
        const structure = await ensureCampCommandStructure(tx, input.campId, camp.organizationId, { reparentOrphans: false, actorId: ctx.userId });
        let parentId = structure.commandantPosition.id;
        if (input.parentPositionId) {
          const parent = await tx.position.findFirst({
            where: { id: input.parentPositionId, campId: input.campId, deletedAt: null, leadershipRole: { not: null } },
          });
          if (!parent) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected parent must be an existing Camp Command role in this camp." });
          parentId = parent.id;
        }

        const assistantCount = await tx.position.count({ where: { campId: input.campId, leadershipRole: "ASSISTANT_COMMANDANT", deletedAt: null } });
        const created = await tx.position.create({
          data: {
            campId: input.campId,
            departmentId: structure.department.id,
            parentPositionId: parentId,
            name: input.name.trim(),
            leadershipRole: "ASSISTANT_COMMANDANT",
            displayOrder: -90 + assistantCount,
          },
        });
        await logEvent(tx, {
          organizationId: camp.organizationId,
          actorId: ctx.userId,
          action: "CAMP_COMMAND_ASSISTANT_ROLE_CREATED",
          subjectType: "POSITION",
          subjectId: created.id,
          newValue: { name: created.name, parentPositionId: created.parentPositionId },
        });
        return created;
      });
    }),

  updateAssignmentAccess: protectedProcedure
    .input(z.object({
      assignmentId: z.string(),
      accessMode: accessModeSchema,
      permissions: z.array(permissionSchema),
    }))
    .mutation(async ({ ctx, input }) => {
      const assignment = await ctx.prisma.positionAssignment.findUnique({
        where: { id: input.assignmentId },
        include: { position: { select: { campId: true, leadershipRole: true } }, staff: { select: { userId: true } } },
      });
      if (!assignment?.position.leadershipRole) throw new TRPCError({ code: "NOT_FOUND" });
      const camp = await assertCommandManager(ctx, assignment.position.campId);
      if (assignment.staff.userId === ctx.userId) throw new TRPCError({ code: "FORBIDDEN", message: "You cannot change your own Camp Command access." });
      const updated = await ctx.prisma.positionAssignment.update({
        where: { id: input.assignmentId },
        data: { accessMode: input.accessMode, permissions: sanitizeCampCommandPermissions(input.permissions) },
      });
      await ctx.prisma.auditLog.create({
        data: {
          organizationId: camp.organizationId,
          actorId: ctx.userId,
          action: "CAMP_COMMAND_ACCESS_UPDATED",
          subjectType: "POSITION_ASSIGNMENT",
          subjectId: assignment.id,
          previousValue: { accessMode: assignment.accessMode, permissions: assignment.permissions },
          newValue: { accessMode: updated.accessMode, permissions: updated.permissions },
        },
      });
      return updated;
    }),

  remove: protectedProcedure
    .input(z.object({ assignmentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const assignment = await ctx.prisma.positionAssignment.findUnique({
        where: { id: input.assignmentId },
        include: { position: { select: { id: true, campId: true, leadershipRole: true } }, staff: { select: { id: true, userId: true, firstName: true, lastName: true } } },
      });
      if (!assignment?.position.leadershipRole) throw new TRPCError({ code: "NOT_FOUND" });
      const camp = await assertCommandManager(ctx, assignment.position.campId);
      if (assignment.staff.userId === ctx.userId) throw new TRPCError({ code: "FORBIDDEN", message: "You cannot remove your own Camp Command appointment." });
      const updated = await ctx.prisma.$transaction(async (tx: any) => {
        const ended = await tx.positionAssignment.update({
          where: { id: input.assignmentId },
          data: { isCurrent: false, endDate: new Date() },
        });
        await syncStaffProfileFromPositions(tx, assignment.staff.id);
        await syncPositionOccupantsAndDescendants(tx, assignment.position.id);
        await tx.auditLog.create({
          data: {
            organizationId: camp.organizationId,
            actorId: ctx.userId,
            action: "CAMP_COMMAND_APPOINTMENT_REMOVED",
            subjectType: "POSITION_ASSIGNMENT",
            subjectId: assignment.id,
            previousValue: { staffId: assignment.staff.id, role: assignment.position.leadershipRole, isCurrent: true },
            newValue: { isCurrent: false },
          },
        });
        return ended;
      });
      return updated;
    }),
});
