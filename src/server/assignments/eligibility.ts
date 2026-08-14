import type { RegistrationStatus } from "@prisma/client";

/** Campers who are still actively participating in camp assignments. */
export const ACTIVE_ASSIGNMENT_REGISTRATION_STATUSES = [
  "APPROVED",
  "CHECKED_IN",
] as const satisfies readonly RegistrationStatus[];

export function isActiveAssignmentRegistrationStatus(
  status: RegistrationStatus,
): boolean {
  return ACTIVE_ASSIGNMENT_REGISTRATION_STATUSES.includes(
    status as (typeof ACTIVE_ASSIGNMENT_REGISTRATION_STATUSES)[number],
  );
}
