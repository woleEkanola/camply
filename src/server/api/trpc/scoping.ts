import { TRPCError } from "@trpc/server";

const ORG_ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN"];

/** Throws unless the caller is an org admin (SUPER_ADMIN/OWNER/ADMIN) for `organizationId`. */
export async function assertOrgAdmin(ctx: { session: any }, organizationId?: string) {
  const user = ctx.session?.user;
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (user.role === "SUPER_ADMIN") return user;
  if (organizationId && ORG_ADMIN_ROLES.includes(user.role) && user.organizationId === organizationId) return user;
  throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized for this organization" });
}

/**
 * Throws unless the caller is an org admin for `organizationId`, or is a rep
 * for `campusId` (any user can be granted campus-rep access for a specific
 * campus via the Campus.reps relation, independent of their primary role —
 * e.g. a TEACHER can also be a Campus Rep for their church branch — so this
 * is a pure DB relation check, not gated on `user.role === "CAMPUS_REPRESENTATIVE"`.
 * Always re-verified against the DB, never trusted from the JWT session claim alone.
 */
export async function assertOrgAdminOrCampusRep(
  ctx: { prisma: any; session: any },
  organizationId: string,
  campusId?: string | null
) {
  const user = ctx.session?.user;
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (ORG_ADMIN_ROLES.includes(user.role) && user.organizationId === organizationId) return user;
  if (user.organizationId === organizationId && campusId) {
    const managed = await ctx.prisma.campus.findFirst({
      where: { id: campusId, reps: { some: { id: user.id } } },
    });
    if (managed) return user;
  }
  throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized for this campus" });
}
