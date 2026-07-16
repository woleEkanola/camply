/**
 * Pure — no Prisma import — so both the server validation/engine layer and
 * client UI components (e.g. the wizard's Add Teen step) can compute a
 * camper's age at a given cutoff without pulling in server-only dependencies.
 * Mirrors the endorsement.ts pattern.
 */
export function calculateAge(dateOfBirth: Date, cutoffDate: Date): number {
  let age = cutoffDate.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = cutoffDate.getMonth() - dateOfBirth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && cutoffDate.getDate() < dateOfBirth.getDate())) {
    age--;
  }
  return age;
}
