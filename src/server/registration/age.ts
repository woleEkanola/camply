/**
 * Pure — no Prisma import — so both the server validation/engine layer and
 * client UI components (e.g. the wizard's Add Teen step) can compute a
 * camper's age at a given cutoff without pulling in server-only dependencies.
 * Mirrors the endorsement.ts pattern.
 *
 * Uses UTC getters on both operands, not local ones. Server-side, both dates
 * come from Prisma-read TIMESTAMP columns, which are genuine UTC instants —
 * on a server west of UTC, local getters could read a DOB back one calendar
 * day earlier than intended, computing a camper a year younger than they
 * are and wrongly failing the minAge gate or misbucketing their age group.
 * Client-side (TeenEntryForm), `new Date(dateOfBirth)` parses a YYYY-MM-DD
 * form value as UTC midnight per the JS spec, so UTC getters are actually
 * the *correct* read there too, not just a server-side accommodation.
 */
export function calculateAge(dateOfBirth: Date, cutoffDate: Date): number {
  let age = cutoffDate.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDiff = cutoffDate.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && cutoffDate.getUTCDate() < dateOfBirth.getUTCDate())) {
    age--;
  }
  return age;
}
