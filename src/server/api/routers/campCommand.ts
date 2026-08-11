import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import {
  CAMP_COMMAND_PERMISSIONS,
  sanitizeCampCommandPermissions,
} from "../../../lib/campCommand";
import { getCampCommandAccess } from "../../auth/campCommand";
import { syncPositionOccupantsAndDescendants, syncStaffProfileFromPositions } from "../../utils/hierarchySync";

const permissionSchema = z.enum(CAMP_COMMAND_PERMISSIONS);
const accessModeSchema = z.enum(["INHERIT", "FULL", "CUSTOM"]);
const leadershipRoleSchema = z.enum(["COMMANDANT", "ASSISTANT_COMMANDANT"]);

async function assertCommandManager(ctx: { prisma: any; session: any }, campId: string) {
  const user = ctx.session?.user;
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
  const camp = await ctx.prisma.camp.findUnique({ where: { id: campId }, select: { id: true, organizationId: true } });
  if (!camp) throw new TRPCError({ code: "NOT_FOUND", message: "Camp not found." });
  if (user.role === "SUPER_ADMIN") return camp;
  if (!["OWNER", "ADMIN"].includes(user.role) || user.organizationId !== camp.organizationId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only an Owner or Admin can manage Camp Command appointments." });
  }
  return camp;
}

async function ensureStructure(db: any, campId: string, organizationId: string) {
  let department = await db.department.findFirst({
    where: { campId, systemKey: "CAMP_COMMAND", deletedAt: null },
  });
  if (!department) {
    department = await db.department.create({
      data: {
        organizationId,
        campId,
        systemKey: "CAMP_COMMAND",
        name: "Camp Command",
        description: "Camp Commandant and Assistant Camp Commandants",
        responsibilities: ["Overall camp leadership", "Coordination of departments", "Camp operations oversight"],
      },
    });
  }

  let commandantPosition = await db.position.findFirst({
    where: { campId, leadershipRole: "COMMANDANT", deletedAt: null },
  });
  if (!commandantPosition) {
    commandantPosition = await db.position.create({
      data: {
        campId,
        departmentId: department.id,
        name: "Camp Commandant",
        leadershipRole: "COMMANDANT",
        displayOrder: -100,
      },
    });
  }

  let assistantPosition = await db.position.findFirst({
    where: { campId, leadershipRole: "ASSISTANT_COMMANDANT", deletedAt: null },
  });
  if (!assistantPosition) {
    assistantPosition = await db.position.create({
      data: {
        campId,
        departmentId: department.id,
        parentPositionId: commandantPosition.id,
        name: "Assistant Camp Commandant",
        leadershipRole: "ASSISTANT_COMMANDANT",
        displayOrder: -90,
      },
    });
  }

  // Existing top-level department positions now sit below Camp Command.
  await db.position.updateMany({
    where: {
      campId,
      id: { notIn: [commandantPosition.id, assistantPosition.id] },
      parentPositionId: null,
      leadershipRole: null,
      deletedAt: null,
    },
    data: { parentPositionId: commandantPosition.id },
  });

  const policy = await db.campCommandPolicy.upsert({
    where: { campId },
    create: { campId },
    update: {},
  });

  return { department, commandantPosition, assistantPosition, policy };
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
      return ctx.prisma.$transaction((tx: any) => ensureStructure(tx, input.campId, camp.organizationId));
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
        const structure = await ensureStructure(tx, input.campId, camp.organizationId);
        const position = input.role === "COMMANDANT" ? structure.commandantPosition : structure.assistantPosition;

        await tx.positionAssignment.updateMany({
          where: {
            isCurrent: true,
            OR: [
              ...(input.role === "COMMANDANT" ? [{ positionId: position.id }] : []),
              { staffId: staff.id, position: { leadershipRole: { not: null }, campId: input.campId } },
            ],
          },
          data: { isCurrent: false, endDate: new Date() },
        });

        const assignment = await tx.positionAssignment.create({
          data: {
            positionId: position.id,
            staffId: staff.id,
            accessMode: input.accessMode,
            permissions: sanitizeCampCommandPermissions(input.permissions),
          },
        });
        await syncStaffProfileFromPositions(tx, staff.id);
        await syncPositionOccupantsAndDescendants(tx, position.id);
        await tx.auditLog.create({
          data: {
            organizationId: camp.organizationId,
            actorId: ctx.userId,
            action: input.role === "COMMANDANT" ? "CAMP_COMMANDANT_APPOINTED" : "ASSISTANT_COMMANDANT_APPOINTED",
            subjectType: "POSITION_ASSIGNMENT",
            subjectId: assignment.id,
            newValue: { staffId: staff.id, name: `${staff.firstName} ${staff.lastName}`, role: input.role, accessMode: input.accessMode, permissions: input.permissions },
          },
        });
        await tx.notification.create({
          data: {
            organizationId: camp.organizationId,
            userId: staff.userId,
            title: input.role === "COMMANDANT" ? "You are now Camp Commandant" : "You are now an Assistant Camp Commandant",
            body: "Your Camp Command access is now available from the context switcher.",
            link: "/admin",
          },
        });
        return assignment;
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
