interface SessionUserLike {
  id: string;
  role: string;
  organizationId?: string | null;
}

interface StaffProfileLike {
  userId: string;
  organizationId: string;
}

/**
 * Authorizes access to a single staff profile's ID card. Mirrors
 * canAccessRegistration (src/server/registration/access.ts) for campers:
 *  - The staff member may always access their own card.
 *  - SUPER_ADMIN may access anything.
 *  - OWNER/ADMIN may access profiles within their own organization only.
 */
export function canAccessStaffProfile(user: SessionUserLike, profile: StaffProfileLike): boolean {
  if (profile.userId === user.id) return true;
  if (user.role === "SUPER_ADMIN") return true;
  if (user.role === "OWNER" || user.role === "ADMIN") {
    return !!user.organizationId && profile.organizationId === user.organizationId;
  }
  return false;
}
