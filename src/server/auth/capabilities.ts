import { prisma } from "../db";

/**
 * What a user can actually *do*, as opposed to the single `User.role` scalar
 * that says what they primarily are.
 *
 * One person is often both a parent and a teacher — the parents most involved
 * in a camp are frequently the ones serving at it. `User.role` can only hold
 * one of those, so it stays the *primary* role (which dashboard you land on by
 * default) and the rest is derived from relations that already exist:
 * `User.campers` and `User.staffProfiles` are both arrays, and StaffProfile
 * already carries its own type and status. No schema change is needed.
 *
 * This generalises the pattern already used for `managedCampuses` in
 * authOptions.ts, where Campus Rep capability is stamped for any role rather
 * than being implied by `role === "CAMPUS_REPRESENTATIVE"`.
 */

export type StaffCapability = "TEACHER" | "VOLUNTEER";

export interface UserCapabilities {
  /** Can act on their own campers' registrations. */
  parent: boolean;
  /** Staff types this user is approved for. Empty when none. */
  staff: StaffCapability[];
  /** Org-wide admin. Stays primary-role based. */
  orgAdmin: boolean;
  /** Scoped to specific campuses. */
  campusRep: boolean;
}

export const EMPTY_CAPABILITIES: UserCapabilities = {
  parent: false,
  staff: [],
  orgAdmin: false,
  campusRep: false,
};

/**
 * Derives capabilities for a user.
 *
 * Staff capability requires an APPROVED profile — a PENDING or REJECTED
 * application must not grant access to the teacher/volunteer areas. The one
 * exception is a user whose primary role is already TEACHER/VOLUNTEER: those
 * accounts predate this model and would otherwise lose access the moment their
 * profile status differed.
 */
export async function getUserCapabilities(userId: string): Promise<UserCapabilities> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      managedCampuses: { select: { id: true } },
      campers: { where: { deletedAt: null }, select: { id: true }, take: 1 },
      staffProfiles: {
        where: { deletedAt: null, status: "APPROVED" },
        select: { type: true },
      },
    },
  });

  if (!user) return EMPTY_CAPABILITIES;

  const staff = new Set<StaffCapability>();
  for (const profile of user.staffProfiles) {
    staff.add(profile.type as StaffCapability);
  }
  if (user.role === "TEACHER" || user.role === "VOLUNTEER") {
    staff.add(user.role);
  }

  return {
    parent: user.role === "PARENT" || user.campers.length > 0,
    staff: [...staff],
    orgAdmin: user.role === "OWNER" || user.role === "ADMIN" || user.role === "SUPER_ADMIN",
    campusRep: user.managedCampuses.length > 0,
  };
}

/**
 * Whether a user holds staff capability, checked against the database rather
 * than the session.
 *
 * Authorization must not rely on `session.user.capabilities`: that is stamped
 * at login, so a profile approved afterwards wouldn't take effect until the
 * user signs in again. Use the session copy for UI decisions only.
 *
 * `type` narrows to TEACHER or VOLUNTEER; omit it to accept either.
 */
export async function hasStaffCapability(
  userId: string,
  opts: { organizationId?: string; type?: StaffCapability } = {}
): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) return false;

  // Accounts that predate this model carry the type in `role` itself.
  if (user.role === "TEACHER" || user.role === "VOLUNTEER") {
    if (!opts.type || user.role === opts.type) return true;
  }

  const profile = await prisma.staffProfile.findFirst({
    where: {
      userId,
      deletedAt: null,
      status: "APPROVED",
      ...(opts.organizationId ? { organizationId: opts.organizationId } : {}),
      ...(opts.type ? { type: opts.type } : {}),
    },
    select: { id: true },
  });
  return !!profile;
}

/** True when the user has more than one place they could reasonably land. */
export function hasMultipleContexts(c: UserCapabilities): boolean {
  return [c.parent, c.staff.length > 0, c.orgAdmin, c.campusRep].filter(Boolean).length > 1;
}
