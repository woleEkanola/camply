import { prisma } from "../db";

interface SessionUserLike {
  id: string;
  role: string;
  organizationId?: string | null;
}

interface RegistrationLike {
  camper: { userId: string | null };
  campus: { organizationId: string };
  campusId: string;
}

/**
 * Authorizes access to a single registration's documents (QR code, acceptance
 * letter). Previously any org's admin — and any campus rep at all — could fetch
 * any registration in the system by id. Rules:
 *  - The parent who owns the camper may always access it.
 *  - SUPER_ADMIN may access anything.
 *  - OWNER/ADMIN may access registrations within their own organization only.
 *  - CAMPUS_REPRESENTATIVE may access only registrations at a campus they
 *    actually manage (re-verified against the DB, not the JWT claim).
 */
export async function canAccessRegistration(
  user: SessionUserLike,
  registration: RegistrationLike
): Promise<boolean> {
  if (registration.camper.userId && registration.camper.userId === user.id) return true;
  if (user.role === "SUPER_ADMIN") return true;

  if (user.role === "OWNER" || user.role === "ADMIN") {
    return !!user.organizationId && registration.campus.organizationId === user.organizationId;
  }

  if (user.role === "CAMPUS_REPRESENTATIVE") {
    const managed = await prisma.campus.findFirst({
      where: { id: registration.campusId, reps: { some: { id: user.id } } },
      select: { id: true },
    });
    return !!managed;
  }

  return false;
}
