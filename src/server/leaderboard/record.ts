import { prisma } from "../db";
import type { Prisma } from "@prisma/client";
import { campDayKey } from "./dayKey";
import { applyStatDelta, type StatSubject } from "./aggregate";

export type RecordScoreEventInput = {
  campId: string;
  campusId?: string | null;
  tribeId?: string | null;
  registrationId?: string | null;
  staffProfileId?: string | null;
  categoryId: string;
  ruleId?: string | null;
  scoredSessionId?: string | null;
  points: number;
  reason?: string | null;
  notes?: string | null;
  source: "AUTO" | "MANUAL" | "SYSTEM";
  occurredAt?: Date;
  createdById?: string | null;
  idempotencyKey?: string | null;
  reversesEventId?: string | null;
  timezone?: string;
};

/**
 * The single write path for the leaderboard. Never write ScoreEvent or
 * touch LeaderboardStat / Tribe.points anywhere else — this is what
 * guarantees `tribe.points === sum(scoreEvent.points where tribeId=...)`,
 * the single most likely bug class in this feature (see the plan's Risk #3).
 *
 * One transaction: cap check (only when `ruleId` is set — manual awards
 * have no cap) -> insert (P2002 on idempotencyKey short-circuits to a silent
 * no-op, returning null) -> applyStatDelta for the subject + its tribe + its
 * campus -> mirror-increment Tribe.points so the existing `{t.points} pts`
 * badge keeps working unmodified.
 */
export async function recordScoreEvent(input: RecordScoreEventInput) {
  const occurredAt = input.occurredAt ?? new Date();
  const day = campDayKey(occurredAt, input.timezone ?? "Africa/Lagos");

  return prisma.$transaction(async (tx) => {
    if (input.ruleId) {
      const capped = await checkAndConsumeCap(tx, input, day);
      if (!capped.allowed) return null;
    }

    let event;
    try {
      event = await tx.scoreEvent.create({
        data: {
          campId: input.campId,
          campusId: input.campusId ?? null,
          tribeId: input.tribeId ?? null,
          registrationId: input.registrationId ?? null,
          staffProfileId: input.staffProfileId ?? null,
          categoryId: input.categoryId,
          ruleId: input.ruleId ?? null,
          scoredSessionId: input.scoredSessionId ?? null,
          points: input.points,
          reason: input.reason ?? null,
          notes: input.notes ?? null,
          source: input.source,
          occurredAt,
          day: new Date(`${day}T00:00:00.000Z`),
          createdById: input.createdById ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
          reversesEventId: input.reversesEventId ?? null,
        },
      });
    } catch (err) {
      if (isUniqueConstraintError(err, "idempotencyKey")) return null; // already recorded — silent no-op
      throw err;
    }

    const subjects: StatSubject[] = [];
    if (input.tribeId) subjects.push({ subjectType: "TRIBE", subjectId: input.tribeId });
    if (input.registrationId) subjects.push({ subjectType: "CAMPER", subjectId: input.registrationId });
    if (input.staffProfileId) subjects.push({ subjectType: "STAFF", subjectId: input.staffProfileId });
    if (input.campusId) subjects.push({ subjectType: "CAMPUS", subjectId: input.campusId });
    for (const subject of subjects) {
      await applyStatDelta(tx, input.campId, subject, day, input.points);
    }

    if (input.tribeId) {
      await tx.tribe.update({ where: { id: input.tribeId }, data: { points: { increment: input.points } } });
    }

    return event;
  });
}

async function checkAndConsumeCap(
  tx: Prisma.TransactionClient,
  input: RecordScoreEventInput,
  day: string
): Promise<{ allowed: boolean }> {
  const rule = await tx.scoreRule.findUnique({ where: { id: input.ruleId! } });
  if (!rule) return { allowed: true };

  const subjectFilter: Record<string, string | null> = {};
  if (input.tribeId) subjectFilter.tribeId = input.tribeId;
  if (input.registrationId) subjectFilter.registrationId = input.registrationId;
  if (input.staffProfileId) subjectFilter.staffProfileId = input.staffProfileId;

  if (rule.maxPerDay == null && rule.maxPointsPerDay == null) return { allowed: true };

  const todays = await tx.scoreEvent.findMany({
    where: { ruleId: input.ruleId!, day: new Date(`${day}T00:00:00.000Z`), ...subjectFilter },
    select: { points: true },
  });

  if (rule.maxPerDay != null && todays.length >= rule.maxPerDay) return { allowed: false };
  if (rule.maxPointsPerDay != null) {
    const sum = todays.reduce((acc, e) => acc + e.points, 0);
    if (sum + input.points > rule.maxPointsPerDay) return { allowed: false };
  }
  return { allowed: true };
}

function isUniqueConstraintError(err: unknown, field: string): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as any).code === "P2002" &&
    Array.isArray((err as any).meta?.target) &&
    (err as any).meta.target.includes(field)
  );
}
