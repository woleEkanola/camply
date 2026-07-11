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
      await tx.registration.updateMany({ where: { camper: { userId }, deletedAt: null }, data: { deletedAt: now } });
      await tx.camper.updateMany({ where: { userId, deletedAt: null }, data: { deletedAt: now } });
      await tx.staffProfile.updateMany({ where: { userId, deletedAt: null }, data: { deletedAt: now } });
      return tx.user.update({ where: { id: userId }, data: { deletedAt: now } });
    },
    { timeout: 15000 }
  );
}
