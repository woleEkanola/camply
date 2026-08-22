import { prisma } from "../db";
import { recordScoreEvent } from "./record";

export class VoidError extends Error {
  constructor(public code: "NOT_FOUND" | "CONFLICT", message: string) {
    super(message);
  }
}

/**
 * Reverses a ScoreEvent the same way leaderboard.undo does (a compensating
 * -N event through recordScoreEvent, never a direct write — see record.ts's
 * doc comment), but additionally stamps voidedAt on BOTH the original and
 * the compensating event so they can be hidden from user-facing feeds
 * (HistoryTab, camper/tribe/staff detail) while still counting toward
 * rebuildLeaderboard()'s SUM — the +N and -N net to zero either way, so
 * totals are correct with or without the stamp.
 *
 * Shared by leaderboard.voidEvent (manual admin action on a point-activity
 * row) and the attendance engine's deleteRecord/deleteSession (an
 * attendance-derived event being voided as a side effect of deleting the
 * record that generated it).
 */
export async function voidScoreEvent(input: { eventId: string; actorId: string; reason: string }) {
  const original = await prisma.scoreEvent.findUnique({ where: { id: input.eventId } });
  if (!original) throw new VoidError("NOT_FOUND", "Score event not found.");
  if (original.voidedAt) throw new VoidError("CONFLICT", "This event was already voided.");

  const compensating = await recordScoreEvent({
    campId: original.campId,
    campusId: original.campusId,
    tribeId: original.tribeId,
    registrationId: original.registrationId,
    staffProfileId: original.staffProfileId,
    categoryId: original.categoryId,
    points: -original.points,
    reason: input.reason,
    source: "SYSTEM",
    createdById: input.actorId,
    reversesEventId: original.id,
    idempotencyKey: `void:${original.id}`,
  });

  if (!compensating) throw new VoidError("CONFLICT", "This event was already voided.");

  const now = new Date();
  const [updatedOriginal, updatedCompensating] = await Promise.all([
    prisma.scoreEvent.update({
      where: { id: original.id },
      data: { voidedAt: now, voidedById: input.actorId, voidReason: input.reason },
    }),
    prisma.scoreEvent.update({
      where: { id: compensating.id },
      data: { voidedAt: now, voidedById: input.actorId, voidReason: input.reason },
    }),
  ]);

  return { original: updatedOriginal, compensating: updatedCompensating };
}
