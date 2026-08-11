import { TRPCError } from "@trpc/server";
import { getCampCommandAccess } from "../auth/campCommand";

const ORG_ADMIN_ROLES = new Set(["SUPER_ADMIN", "OWNER", "ADMIN"]);

export type CampPointsAccess = {
  camp: { id: string; organizationId: string };
  isAdmin: boolean;
  canAwardPoints: boolean;
  canTakeAttendance: boolean;
  staffProfile: null | {
    id: string;
    type: "TEACHER" | "VOLUNTEER";
    assignedTribeId: string | null;
  };
  managedCampusIds: string[];
};

/** Fresh DB-backed capability check used by every Camp Points and attendance
 * mutation. Role claims decide navigation only; they never decide data scope. */
export async function getCampPointsAccess(
  ctx: { prisma: any; session: any; userId: string },
  campId: string
): Promise<CampPointsAccess> {
  const user = ctx.session?.user;
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });

  const camp = await ctx.prisma.camp.findUnique({
    where: { id: campId },
    select: { id: true, organizationId: true },
  });
  if (!camp) throw new TRPCError({ code: "NOT_FOUND", message: "Camp not found." });

  const commandAccess = user.organizationId === camp.organizationId
    ? await getCampCommandAccess(ctx, campId)
    : null;
  const isAdmin =
    user.role === "SUPER_ADMIN" ||
    (ORG_ADMIN_ROLES.has(user.role) && user.organizationId === camp.organizationId) ||
    Boolean(commandAccess?.permissions.includes("CAMP_POINTS"));

  const [staffProfile, managedCampuses] = await Promise.all([
    ctx.prisma.staffProfile.findFirst({
      where: {
        userId: ctx.userId,
        campId,
        organizationId: camp.organizationId,
        status: "APPROVED",
        deletedAt: null,
      },
      select: { id: true, type: true, assignedTribeId: true },
    }),
    ctx.prisma.campus.findMany({
      where: {
        organizationId: camp.organizationId,
        deletedAt: null,
        reps: { some: { id: ctx.userId } },
      },
      select: { id: true },
    }),
  ]);

  const pointGrant = staffProfile
    ? await ctx.prisma.positionAssignment.findFirst({
        where: {
          staffId: staffProfile.id,
          isCurrent: true,
          OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
          position: {
            campId,
            status: "ACTIVE",
            deletedAt: null,
            OR: [{ grantsAwardPoints: true }, { grantsManageCamp: true }],
          },
        },
        select: { id: true },
      })
    : null;

  const managedCampusIds = managedCampuses.map((campus: { id: string }) => campus.id);
  return {
    camp,
    isAdmin,
    canAwardPoints: isAdmin || !!pointGrant,
    canTakeAttendance: isAdmin || !!staffProfile || managedCampusIds.length > 0,
    staffProfile,
    managedCampusIds,
  };
}

export function assertCanAwardPoints(access: CampPointsAccess) {
  if (!access.canAwardPoints) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Your camp position cannot award camper points." });
  }
  if (!access.isAdmin && !access.staffProfile?.assignedTribeId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "A tribe assignment is required to award points." });
  }
}

export function assertScope(
  access: CampPointsAccess,
  scope: { tribeId?: string | null; campusId?: string | null },
  purpose: "POINTS" | "ATTENDANCE"
) {
  if (access.isAdmin) return;

  if (purpose === "POINTS") {
    assertCanAwardPoints(access);
    if (!scope.tribeId || scope.tribeId !== access.staffProfile?.assignedTribeId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You may only award points to your assigned tribe." });
    }
    return;
  }

  if (scope.tribeId && scope.tribeId === access.staffProfile?.assignedTribeId) return;
  if (scope.campusId && access.managedCampusIds.includes(scope.campusId)) return;
  throw new TRPCError({ code: "FORBIDDEN", message: "This attendance group is outside your assignment." });
}
