/**
 * Pure predicate — no Prisma import — so both the server engine and client
 * UI components can determine "endorsed" status from a RegistrationReview
 * row without pulling in server-only dependencies.
 */
export function isEndorsed(review: { verificationStatus?: string | null; recommendation?: string | null } | null | undefined): boolean {
  return review?.verificationStatus === "COMPLETED" && review?.recommendation === "APPROVE";
}
