import type { RegistrationStatus } from "@prisma/client";

/**
 * Legal registration state transitions (PRD Part 4 §3-4).
 * Every status change in the app must go through `assertTransition`
 * so illegal jumps are rejected in one place.
 */
const TRANSITIONS: Record<RegistrationStatus, RegistrationStatus[]> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["PENDING", "APPROVED"], // APPROVED only when camp.approvalMode === "AUTO"
  PENDING: ["APPROVED", "REJECTED", "WAITLISTED", "REQUIRES_ACTION", "CANCELLED"],
  REQUIRES_ACTION: ["PENDING"],
  // Relaxed: APPROVED/REJECTED/WAITLISTED can transition freely between each other.
  // Only CHECKED_IN, COMPLETED, ARCHIVED are final/irreversible.
  WAITLISTED: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["REJECTED", "WAITLISTED", "CANCELLED", "CHECKED_IN", "ARCHIVED"],
  REJECTED: ["APPROVED", "WAITLISTED", "PENDING", "ARCHIVED"],
  CANCELLED: ["ARCHIVED"],
  CHECKED_IN: ["COMPLETED", "ARCHIVED"],
  COMPLETED: ["ARCHIVED"],
  ARCHIVED: [],
};

export class IllegalTransitionError extends Error {
  constructor(from: RegistrationStatus, to: RegistrationStatus) {
    super(`Cannot transition registration from ${from} to ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export function assertTransition(from: RegistrationStatus, to: RegistrationStatus) {
  const allowed = TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new IllegalTransitionError(from, to);
  }
}

export function canTransition(from: RegistrationStatus, to: RegistrationStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}
