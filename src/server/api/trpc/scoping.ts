import { TRPCError } from "@trpc/server";

const ORG_ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN"];

/**
 * Throws unless the caller is an org admin for the organization that owns
 * `campId`. Extracted from three private, near-duplicate copies
 * (`documentRequirement.ts`, `position.ts`, `tribe.ts`) — this is the
 * canonical version. Fixes a real bug in `position.ts`'s copy: its condition
 * was `!ADMIN_ROLES.includes(role) && org !== camp.org`, which only denies
 * when *both* are true — so any authenticated non-admin user (TEACHER,
 * VOLUNTEER, PARENT, CAMPUS_REPRESENTATIVE) whose `organizationId` happened
 * to match the camp's org could manage that camp's positions. This version
 * requires both an admin role AND matching org, via `assertOrgAdmin`.
 *
 * The leaderboard feature additionally wants a "Camp Head" grant via the
 * existing `Position`/`PositionAssignment` models rather than a new role —
 * deliberately not wired in yet, since nothing in the schema currently
 * flags which `Position` rows carry camp-management authority (they're
 * free-text names like "Camp Director"). Add that check here once a
 * `Position.grantsManageCamp`-style flag (or equivalent) exists, rather than
 * matching on position name.
 */
export async function assertCanManageCamp(ctx: { prisma: any; session: any }, campId: string) {
  const camp = await ctx.prisma.camp.findUnique({ where: { id: campId } });
  if (!camp) throw new TRPCError({ code: "NOT_FOUND", message: "Camp not found" });
  await assertOrgAdmin(ctx, camp.organizationId);
  return camp;
}

/**
 * Throws unless `organizationId` is the caller's own org — the baseline check
 * for any procedure that takes `organizationId` as input but doesn't need
 * admin/campus-rep escalation (e.g. a plain authenticated read). No role
 * restriction beyond "logged in and in this org" — use `assertOrgAdmin` or
 * `assertOrgAdminOrCampusRep` instead when the procedure is admin-only.
 *
 * `User.organizationId` is nullable — SUPER_ADMINs sit outside any single
 * org by design (schema + authOptions.ts) — so a SUPER_ADMIN passes for any
 * `organizationId` rather than being permanently locked out of every one.
 */
export function assertSameOrg(ctx: { session: any }, organizationId: string) {
  const user = ctx.session?.user;
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (user.role === "SUPER_ADMIN") return user;
  if (user.organizationId === organizationId) return user;
  throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized for this organization" });
}

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
