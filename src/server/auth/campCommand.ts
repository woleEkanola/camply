import { TRPCError } from "@trpc/server";
import {
  FULL_CAMP_COMMAND_PERMISSIONS,
  sanitizeCampCommandPermissions,
  type CampCommandPermission,
  type CampCommandRole,
} from "../../lib/campCommand";

type CommandContext = { prisma: any; session: any; userId?: string };

export interface ResolvedCampCommandAccess {
  campId: string;
  role: CampCommandRole;
  assignmentId: string;
  mode: "FULL" | "CUSTOM";
  permissions: CampCommandPermission[];
}

export async function getCampCommandAccess(
  ctx: CommandContext,
  campId: string,
  userId = ctx.userId ?? ctx.session?.user?.id
): Promise<ResolvedCampCommandAccess | null> {
  if (!userId) return null;
  const now = new Date();
  const assignment = await ctx.prisma.positionAssignment.findFirst({
    where: {
      isCurrent: true,
      OR: [{ endDate: null }, { endDate: { gte: now } }],
      staff: {
        userId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        deletedAt: null,
      },
      position: {
        campId,
        leadershipRole: { in: ["COMMANDANT", "ASSISTANT_COMMANDANT"] },
        status: "ACTIVE",
        deletedAt: null,
      },
    },
    include: {
      position: { select: { leadershipRole: true } },
      staff: { select: { organizationId: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!assignment?.position.leadershipRole) return null;

  const policy = await ctx.prisma.campCommandPolicy.findUnique({ where: { campId } });
  const role = assignment.position.leadershipRole as CampCommandRole;
  const inheritedMode = role === "COMMANDANT"
    ? policy?.commandantMode ?? "FULL"
    : policy?.assistantDefaultMode ?? "CUSTOM";
  const inheritedPermissions = role === "COMMANDANT"
    ? policy?.commandantPermissions ?? []
    : policy?.assistantDefaultPermissions ?? [];
  const assignmentMode = assignment.accessMode ?? "INHERIT";
  const mode = assignmentMode === "INHERIT" ? inheritedMode : assignmentMode;
  const permissions = mode === "FULL"
    ? FULL_CAMP_COMMAND_PERMISSIONS
    : sanitizeCampCommandPermissions(assignmentMode === "CUSTOM" ? assignment.permissions : inheritedPermissions);

  return {
    campId,
    role,
    assignmentId: assignment.id,
    mode: mode === "FULL" ? "FULL" : "CUSTOM",
    permissions,
  };
}

export async function getActiveCampCommandAccess(ctx: CommandContext, organizationId: string) {
  const org = await ctx.prisma.organization.findUnique({
    where: { id: organizationId },
    select: { activeCampId: true },
  });
  if (!org?.activeCampId) return null;
  return getCampCommandAccess(ctx, org.activeCampId);
}

export async function assertCampCommandPermission(
  ctx: CommandContext,
  campId: string,
  permission: CampCommandPermission
) {
  const access = await getCampCommandAccess(ctx, campId);
  if (access?.permissions.includes(permission)) return access;
  throw new TRPCError({ code: "FORBIDDEN", message: "Your Camp Command assignment does not include this permission." });
}
