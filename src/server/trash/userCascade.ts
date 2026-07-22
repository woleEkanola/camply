import { prisma } from "../db";

/** Soft-deletes a User, cascading to their Campers (and those Campers'
 * Registrations) and StaffProfiles — mirrors the previous hard-delete's
 * cascade (Camper/StaffProfile both had onDelete: Cascade from User).
 * Shared by user.ts's `delete` and admin.ts's `delete` so both paths stay
 * in lockstep instead of diverging again. */
export async function softDeleteUser(userId: string) {
  const now = new Date();
  return prisma.$transaction(
    async (tx) => {
      const campers = await tx.camper.findMany({ where: { userId }, select: { id: true } });
      const camperIds = campers.map((c) => c.id);
      if (camperIds.length > 0) {
        await tx.registration.updateMany({ where: { camperId: { in: camperIds }, deletedAt: null }, data: { deletedAt: now } });
      }
      await tx.camper.updateMany({ where: { userId, deletedAt: null }, data: { deletedAt: now } });
      await tx.staffProfile.updateMany({ where: { userId, deletedAt: null }, data: { deletedAt: now } });
      return tx.user.update({ where: { id: userId }, data: { deletedAt: now } });
    },
    { timeout: 15000 }
  );
}

/** Restores a soft-deleted User, cascading un-deletion to their Campers,
 * Registrations, and StaffProfiles that were soft-deleted with them. */
export async function restoreUser(userId: string) {
  return prisma.$transaction(
    async (tx) => {
      const campers = await tx.camper.findMany({ where: { userId }, select: { id: true } });
      const camperIds = campers.map((c) => c.id);
      if (camperIds.length > 0) {
        await tx.registration.updateMany({ where: { camperId: { in: camperIds } }, data: { deletedAt: null } });
      }
      await tx.camper.updateMany({ where: { userId }, data: { deletedAt: null } });
      await tx.staffProfile.updateMany({ where: { userId }, data: { deletedAt: null } });
      return tx.user.update({ where: { id: userId }, data: { deletedAt: null } });
    },
    { timeout: 15000 }
  );
}

