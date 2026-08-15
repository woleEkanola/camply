import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../db";
import { logEvent } from "../audit";
import { calculateAge } from "../registration/validation";
import { normalizeRules, DEFAULT_RULES_V2 } from "./allocator/rules";
import { passesHardConstraints } from "./allocator/constraints";
import { scoreCandidate, computeTargetSize } from "./allocator/scoring";
import { rankCandidates } from "./allocator/selector";
import { runAllocationPipeline, simulateAllocation } from "./allocator/pipeline";
import { ACTIVE_ASSIGNMENT_REGISTRATION_STATUSES } from "../assignments/eligibility";
import { enqueueTribeChangedEffect } from "../registration/effects";

export { simulateAllocation, runAllocationPipeline };
export { normalizeRules, DEFAULT_RULES_V2 };
export type { RuleConfig } from "./allocator/types";

export const TRIBE_ALLOCATION_ENGINE_VERSION = "2.0.0";

type TxClient = PrismaClient<any> | Prisma.TransactionClient;

export class TribeAllocationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "TribeAllocationError";
    this.code = code;
  }
}

type Criterion =
  | "SIBLINGS_TOGETHER"
  | "SIBLINGS_APART"
  | "RETURNING_CAMPER"
  | "GENDER"
  | "AGE"
  | "CAMPUS"
  | "CHURCH"
  | "SCHOOL"
  | "POPULATION";

const DEFAULT_RULES = [
  { criterion: "SIBLINGS_TOGETHER", enabled: false },
  { criterion: "GENDER", enabled: true },
  { criterion: "AGE", enabled: true },
  { criterion: "POPULATION", enabled: true },
] as { criterion: Criterion; enabled: boolean }[];

function ageGroup(dateOfBirth: Date | null, cutoff: Date): string {
  if (!dateOfBirth) return "unknown";
  const age = calculateAge(dateOfBirth, cutoff);
  if (age <= 12) return "10-12";
  if (age <= 15) return "13-15";
  return "16-18";
}

export interface TribeSuggestion {
  tribeId: string;
  tribeName: string;
  confidence: number;
  reasons: string[];
  scoreBreakdown?: Record<string, number>;
}

export async function suggestTribe(tx: TxClient, registrationId: string): Promise<TribeSuggestion | null> {
  const registration = await tx.registration.findUniqueOrThrow({
    where: { id: registrationId },
    include: { camper: true, camp: true, campus: true },
  });

  const tribes = await tx.tribe.findMany({
    where: { campId: registration.campId, status: "ACTIVE", deletedAt: null },
    include: { registrations: { where: { deletedAt: null }, select: { id: true, camper: true, campusId: true } } },
  });
  if (tribes.length === 0) return null;

  const rulesNormalized = normalizeRules(registration.camp.tribeAllocationRules ?? DEFAULT_RULES);
  const cutoff = registration.camp.ageCutoffDate ?? registration.camp.startDate;
  const camperAgeGroup = ageGroup(registration.camper.dateOfBirth, cutoff);

  const siblingTribeIds = new Set(
    (
      await tx.registration.findMany({
        where: {
          campId: registration.campId,
          tribeId: { not: null },
          camper: { userId: registration.camper.userId },
          id: { not: registration.id },
          deletedAt: null,
        },
        select: { tribeId: true },
      })
    ).map((r) => r.tribeId).filter((id): id is string => id !== null)
  );

  const enriched = tribes.map((t) => {
    const regs = t.registrations;
    const pop = regs.length;
    const myGender = registration.camper.gender;
    return {
      id: t.id,
      name: t.name,
      campId: t.campId,
      gender: (t.gender as string | null) ?? null,
      ageRange: (t.ageRange as string | null) ?? null,
      maxCapacity: (t.maxCapacity as number | null) ?? null,
      isAllocationLocked: (t as any).isAllocationLocked === true,
      status: t.status,
      population: pop,
      sameGenderCount: myGender ? regs.filter((r) => (r.camper as any).gender === myGender).length : 0,
      sameAgeGroupCount: regs.filter((r) => ageGroup((r.camper as any).dateOfBirth, cutoff) === camperAgeGroup).length,
      sameCampusCount: regs.filter((r) => r.campusId === registration.campusId).length,
      sameChurchCount: 0,
      sameSchoolCount: 0,
    };
  });

  const unit = {
    registrationId: registration.id,
    camper: {
      id: registration.camper.id,
      name: registration.camper.name,
      dateOfBirth: registration.camper.dateOfBirth as Date | null,
      gender: (registration.camper.gender as string | null) ?? null,
      userId: registration.camper.userId,
      school: (registration.camper as any).school ?? null,
      church: (registration.camper as any).church ?? null,
      medicalProfile: (registration.camper as any).medicalProfile ?? null,
    },
    campusId: registration.campusId,
    siblingGroupIds: [] as string[],
  };

  const candidates = [];
  for (const tribe of enriched) {
    const hard = passesHardConstraints(tribe, unit, rulesNormalized.hard, siblingTribeIds);
    if (!hard.passed) continue;

    const targetSize = computeTargetSize(
      { tribes: new Map(), units: [], assignments: new Map(), targetSize: 0 },
      null,
    );

    const state = {
      tribes: new Map(),
      units: [],
      assignments: new Map(),
      targetSize,
    };

    const { score, breakdown } = scoreCandidate(tribe, unit, rulesNormalized.soft, state, camperAgeGroup);
    candidates.push({ tribe, score, breakdown });
  }

  if (candidates.length === 0) return null;

  const ranked = rankCandidates(
    candidates.map((c) => ({
      ...c,
      reasons: [],
    })),
    unit,
    {
      tribes: new Map(),
      units: [],
      assignments: new Map(),
      targetSize: 0,
    },
  );

  const best = ranked[0];
  const worstScore = ranked.length > 1 ? ranked[ranked.length - 1].score : 0;
  const spread = Math.abs(best.score - worstScore) + 1;
  const confidence = Math.round(Math.min(99, 50 + (Math.abs(best.score - worstScore) / spread) * 49));

  const reasons = [];
  reasons.push("Tribe has available capacity");

  const targetForSuggestion = Math.ceil(
    enriched.reduce((s, t) => s + t.population, 0) / enriched.length
  );
  const dev = Math.abs(best.tribe.population + 1 - targetForSuggestion);
  if (dev <= 2) {
    reasons.push("Keeps tribe within target population");
  }

  if (registration.camper.gender && best.tribe.gender === "MIXED") {
    reasons.push("Gender-compatible tribe");
  }

  if (best.tribe.sameCampusCount < best.tribe.population / 2) {
    reasons.push("Improves campus diversity");
  }

  return {
    tribeId: best.tribe.id,
    tribeName: best.tribe.name,
    confidence,
    reasons: Array.from(new Set(reasons)),
    scoreBreakdown: best.breakdown,
  };
}

async function assignTribeInTx(
  tx: Prisma.TransactionClient,
  params: {
    registrationId: string;
    tribeId: string;
    actorId: string | null;
    method: "AUTOMATIC" | "MANUAL" | "HYBRID_OVERRIDE";
    rules?: unknown;
    preserveExistingAssignment?: boolean;
    allowLockedOverride?: boolean;
    // Separate from preserveExistingAssignment: a CAS race-guard for callers
    // (bulkAutoAssignTribes) that already pre-filtered by status before
    // computing assignments — re-checks status hasn't changed since. Not a
    // general "only active registrations can be assigned" business rule, so
    // it must not apply to confirmAssignment's default (which legitimately
    // assigns DRAFT-status registrations mid-recommendation-flow).
    requireActiveStatus?: boolean;
    // Out-param: the caller's own transaction wrapper reads this after
    // commit to decide whether to enqueue a TRIBE_CHANGED notification
    // email — the notification must never be sent, or its outbox row
    // created, from inside this transaction (it uses the outer `prisma`
    // client on a separate connection, and the write here could still roll
    // back later in the same transaction).
    outPreviousTribeId?: { current?: string | null };
  },
) {
  const registration = await tx.registration.findUniqueOrThrow({
    where: { id: params.registrationId },
    include: { camper: true },
  });

  // isTribeLocked previously only gated *suggesting* a new tribe
  // (recommendTribeInTx) — the actual writer never checked it, so locking a
  // registration protected nothing. A caller that genuinely wants to move a
  // locked registration must say so explicitly.
  if (registration.isTribeLocked && !params.allowLockedOverride) {
    throw new TribeAllocationError("TRIBE_LOCKED", "This registration's tribe assignment is locked.");
  }

  await tx.$queryRaw`SELECT "id" FROM "Tribe" WHERE "id" = ${params.tribeId} FOR UPDATE`;
  const tribe = await tx.tribe.findUniqueOrThrow({ where: { id: params.tribeId } });
  if (tribe.campId !== registration.campId) {
    throw new TribeAllocationError("WRONG_CAMP", "This tribe does not belong to the same camp as the registration.");
  }
  if (tribe.status !== "ACTIVE") {
    throw new TribeAllocationError("TRIBE_INACTIVE", "This tribe is not active.");
  }
  const currentCount = await tx.registration.count({
    where: {
      tribeId: tribe.id,
      id: { not: registration.id },
      deletedAt: null,
      status: { in: ["SUBMITTED", "PENDING", "REQUIRES_ACTION", "APPROVED", "CHECKED_IN", "COMPLETED"] },
    },
  });
  if (tribe.maxCapacity != null && currentCount >= tribe.maxCapacity) {
    throw new TribeAllocationError("TRIBE_FULL", "This tribe has reached its maximum capacity.");
  }

  const previousTribeId = registration.tribeId;
  if (params.outPreviousTribeId) params.outPreviousTribeId.current = previousTribeId;
  if (params.preserveExistingAssignment && previousTribeId) return null;

  const updatedResult = await tx.registration.updateMany({
    where: {
      id: registration.id,
      ...(params.preserveExistingAssignment ? { tribeId: null } : {}),
      ...(params.requireActiveStatus ? { status: { in: [...ACTIVE_ASSIGNMENT_REGISTRATION_STATUSES] }, deletedAt: null } : {}),
    },
    data: { tribeId: params.tribeId, tribeAssignedAt: new Date(), tribeAssignmentMethod: params.method },
  });
  if (updatedResult.count === 0) return null;
  const updated = await tx.registration.findUniqueOrThrow({ where: { id: registration.id } });

  await logEvent(tx, {
    organizationId: registration.camper.organizationId,
    registrationId: registration.id,
    actorId: params.actorId,
    action: previousTribeId ? "TRIBE_CHANGED" : "TRIBE_ASSIGNED",
    previousValue: { tribeId: previousTribeId },
    newValue: { tribeId: params.tribeId, method: params.method },
  });

  return updated;
}

/**
 * Enqueues a TRIBE_CHANGED notification email — deliberately called after
 * the assignment transaction has committed (using the outer `prisma`, not
 * `tx`), never from inside it. See assignTribeInTx's `outPreviousTribeId`
 * doc comment for why.
 */
async function maybeEnqueueTribeChanged(out: { current?: string | null } | undefined, registrationId: string) {
  if (!out?.current) return;
  const previousTribe = await prisma.tribe.findUnique({ where: { id: out.current }, select: { name: true } });
  await enqueueTribeChangedEffect({ registrationId, previousTribeId: out.current, previousTribeName: previousTribe?.name ?? "" });
}

export async function assignTribe(params: {
  registrationId: string;
  tribeId: string;
  actorId: string;
  method?: "AUTOMATIC" | "MANUAL" | "HYBRID_OVERRIDE";
}) {
  const out: { current?: string | null } = {};
  const updated = await prisma.$transaction((tx) =>
    assignTribeInTx(tx, { ...params, method: params.method ?? "MANUAL", outPreviousTribeId: out })
  );
  if (updated) await maybeEnqueueTribeChanged(out, updated.id);
  return updated;
}

export async function recommendTribeInTx(
  tx: TxClient,
  registrationId: string,
  actorId?: string | null
) {
  const registration = await tx.registration.findUniqueOrThrow({
    where: { id: registrationId },
    include: { camper: true },
  });

  // Skip updating recommendation if locked or manually overridden by admin unless explicitly forced
  if (registration.isTribeLocked) {
    return registration;
  }

  const suggestion = await suggestTribe(tx, registrationId);
  if (!suggestion) return registration;

  const newStatus = registration.tribeRecommendationStatus === "MANUAL_OVERRIDE"
    ? "MANUAL_OVERRIDE"
    : "SUGGESTED";

  const updated = await tx.registration.update({
    where: { id: registrationId },
    data: {
      suggestedTribeId: suggestion.tribeId,
      tribeSuggestedAt: new Date(),
      tribeRecommendationStatus: newStatus,
      tribeRecommendationReason: suggestion.reasons as any,
      tribeRecommendationScore: suggestion.confidence,
      tribeRecommendationBreakdown: (suggestion.scoreBreakdown ?? {}) as any,
    },
  });

  await logEvent(tx, {
    organizationId: registration.camper.organizationId,
    registrationId: registration.id,
    actorId: actorId ?? null,
    action: "REGISTRATION_TRIBE_RECOMMENDED",
    newValue: {
      suggestedTribeId: suggestion.tribeId,
      score: suggestion.confidence,
      reasons: suggestion.reasons,
    },
  });

  return updated;
}

export async function recommendTribe(registrationId: string, actorId?: string | null) {
  return prisma.$transaction((tx) => recommendTribeInTx(tx, registrationId, actorId));
}

export async function acceptRecommendation(registrationId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    let reg = await tx.registration.findUniqueOrThrow({
      where: { id: registrationId },
      include: { camper: true },
    });
    if (!reg.suggestedTribeId) {
      // No suggestion persisted yet (e.g. only the live preview was ever shown) —
      // compute and persist one before accepting, so Accept works in one click.
      await recommendTribeInTx(tx, registrationId, actorId);
      reg = await tx.registration.findUniqueOrThrow({
        where: { id: registrationId },
        include: { camper: true },
      });
    }
    if (!reg.suggestedTribeId) {
      throw new TribeAllocationError("NO_RECOMMENDATION", "No tribe recommendation exists to accept.");
    }
    const updated = await tx.registration.update({
      where: { id: registrationId },
      data: { tribeRecommendationStatus: "ACCEPTED" },
    });
    await logEvent(tx, {
      organizationId: reg.camper.organizationId,
      registrationId: reg.id,
      actorId,
      action: "REGISTRATION_TRIBE_RECOMMENDATION_ACCEPTED",
      newValue: { suggestedTribeId: reg.suggestedTribeId },
    });
    return updated;
  });
}

export async function overrideRecommendation(
  registrationId: string,
  selectedTribeId: string,
  actorId: string,
  reason?: string
) {
  return prisma.$transaction(async (tx) => {
    const reg = await tx.registration.findUniqueOrThrow({
      where: { id: registrationId },
      include: { camper: true },
    });

    const originalSuggested = reg.tribeOriginalSuggestedId ?? reg.suggestedTribeId ?? reg.tribeId;

    const updated = await tx.registration.update({
      where: { id: registrationId },
      data: {
        suggestedTribeId: selectedTribeId,
        tribeOriginalSuggestedId: originalSuggested,
        tribeRecommendationStatus: "MANUAL_OVERRIDE",
        tribeSuggestedAt: new Date(),
      },
    });

    await logEvent(tx, {
      organizationId: reg.camper.organizationId,
      registrationId: reg.id,
      actorId,
      action: "REGISTRATION_TRIBE_RECOMMENDATION_OVERRIDDEN",
      previousValue: { suggestedTribeId: reg.suggestedTribeId },
      newValue: { suggestedTribeId: selectedTribeId, reason: reason ?? "Admin override" },
    });

    return updated;
  });
}

export async function confirmAssignmentInTx(
  tx: Prisma.TransactionClient,
  registrationId: string,
  actorId: string | null,
  opts?: { preserveExistingAssignment?: boolean; allowLockedOverride?: boolean; outPreviousTribeId?: { current?: string | null } }
) {
  const reg = await tx.registration.findUniqueOrThrow({
    where: { id: registrationId },
  });

  let targetTribeId = reg.suggestedTribeId;

  if (!targetTribeId) {
    const suggestion = await suggestTribe(tx, registrationId);
    if (suggestion) {
      targetTribeId = suggestion.tribeId;
    }
  }

  if (!targetTribeId) {
    return reg;
  }

  const method = reg.tribeRecommendationStatus === "MANUAL_OVERRIDE" ? "HYBRID_OVERRIDE" : "AUTOMATIC";
  // Defaults to true so a caller that doesn't explicitly opt in to
  // reassignment can never silently overwrite a camper who is already
  // placed — the bug this default closes moved already-assigned campers
  // whenever bulkApplySuggestedTribes was called with explicit registrationIds.
  const preserveExistingAssignment = opts?.preserveExistingAssignment ?? true;
  const updatedReg = await assignTribeInTx(tx, {
    registrationId,
    tribeId: targetTribeId,
    actorId,
    method,
    preserveExistingAssignment,
    allowLockedOverride: opts?.allowLockedOverride,
    outPreviousTribeId: opts?.outPreviousTribeId,
  });
  if (!updatedReg) return reg;

  const finalStatus = reg.tribeRecommendationStatus === "MANUAL_OVERRIDE" ? "MANUAL_OVERRIDE" : "ASSIGNED";
  return tx.registration.update({
    where: { id: registrationId },
    data: { tribeRecommendationStatus: finalStatus },
  });
}

export async function confirmAssignment(
  registrationId: string,
  actorId: string,
  opts?: { preserveExistingAssignment?: boolean; allowLockedOverride?: boolean }
) {
  const out: { current?: string | null } = {};
  const updated = await prisma.$transaction((tx) => confirmAssignmentInTx(tx, registrationId, actorId, { ...opts, outPreviousTribeId: out }));
  await maybeEnqueueTribeChanged(out, registrationId);
  return updated;
}

export async function bulkSuggestTribes(params: {
  campId: string;
  registrationIds?: string[];
  actorId: string;
}) {
  const whereClause: Prisma.RegistrationWhereInput = {
    campId: params.campId,
    deletedAt: null,
    ...(params.registrationIds && params.registrationIds.length > 0
      ? { id: { in: params.registrationIds } }
      : { status: { in: ["SUBMITTED", "PENDING", "APPROVED"] } }),
  };

  const registrations = await prisma.registration.findMany({
    where: whereClause,
    select: { id: true },
  });

  const results: { registrationId: string; suggestedTribeId?: string; error?: string }[] = [];
  for (const reg of registrations) {
    try {
      const updated = await recommendTribe(reg.id, params.actorId);
      results.push({ registrationId: reg.id, suggestedTribeId: updated.suggestedTribeId ?? undefined });
    } catch (err) {
      results.push({ registrationId: reg.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return results;
}

export interface BulkApplyTribesResult {
  assigned: { registrationId: string; tribeId?: string }[];
  skippedAlreadyAssigned: string[];
  skippedLocked: string[];
  errors: { registrationId: string; error: string }[];
}

/**
 * Applies each registration's `suggestedTribeId` to `tribeId`.
 *
 * By default this never moves a registration that's already assigned or
 * locked — regardless of whether `registrationIds` was supplied. Passing an
 * explicit selection used to drop that guard entirely (the root cause of
 * campers getting silently reassigned mid-campaign, see the tribe-email
 * incident plan); `allowReassign: true` is now the only way to opt into
 * moving an already-placed camper, and even then a locked registration still
 * requires the admin to unlock it first.
 */
export async function bulkApplySuggestedTribes(params: {
  campId: string;
  registrationIds?: string[];
  actorId: string;
  allowReassign?: boolean;
}): Promise<BulkApplyTribesResult> {
  const whereClause: Prisma.RegistrationWhereInput = {
    campId: params.campId,
    deletedAt: null,
    suggestedTribeId: { not: null },
    ...(params.registrationIds && params.registrationIds.length > 0
      ? { id: { in: params.registrationIds } }
      : {}),
  };

  const candidates = await prisma.registration.findMany({
    where: whereClause,
    select: { id: true, tribeId: true },
  });

  const result: BulkApplyTribesResult = { assigned: [], skippedAlreadyAssigned: [], skippedLocked: [], errors: [] };

  for (const reg of candidates) {
    if (!params.allowReassign && reg.tribeId) {
      result.skippedAlreadyAssigned.push(reg.id);
      continue;
    }
    try {
      const updated = await confirmAssignment(reg.id, params.actorId, {
        preserveExistingAssignment: !params.allowReassign,
      });
      result.assigned.push({ registrationId: reg.id, tribeId: updated.tribeId ?? undefined });
    } catch (err) {
      if (err instanceof TribeAllocationError && err.code === "TRIBE_LOCKED") {
        result.skippedLocked.push(reg.id);
      } else {
        result.errors.push({ registrationId: reg.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  return result;
}

export async function autoAssignTribeOnApproval(registrationId: string) {
  try {
    const registration = await prisma.registration.findUnique({ where: { id: registrationId }, include: { camp: true } });
    if (!registration || !registration.camp.tribeAllocationEnabled) {
      return;
    }
    if (registration.tribeId) return;

    await prisma.$transaction((tx) => confirmAssignmentInTx(tx, registrationId, null));
  } catch (error) {
    console.error("Automatic tribe assignment on approval failed:", error);
  }
}

export async function reassignTribe(params: { registrationId: string; tribeId: string; actorId: string; reason?: string }) {
  const out: { current?: string | null } = {};
  const result = await prisma.$transaction(async (tx) => {
    const updated = await assignTribeInTx(tx, { ...params, method: "MANUAL", outPreviousTribeId: out });
    if (!updated) throw new TribeAllocationError("ASSIGNMENT_NOT_APPLIED", "The tribe assignment was not applied.");
    return tx.registration.update({
      where: { id: updated.id },
      data: { tribeRecommendationStatus: "MANUAL_OVERRIDE" },
    });
  });
  await maybeEnqueueTribeChanged(out, result.id);

  if (params.reason) {
    await logEvent(prisma, {
      organizationId: (await prisma.camper.findUniqueOrThrow({ where: { id: result.camperId } })).organizationId,
      registrationId: result.id,
      actorId: params.actorId,
      action: "TRIBE_REASSIGNMENT_REASON",
      newValue: { reason: params.reason },
    });
  }
  return result;
}

export async function clearTribeAssignment(params: { registrationId: string; actorId: string }) {
  return prisma.$transaction(async (tx) => {
    const registration = await tx.registration.findUniqueOrThrow({
      where: { id: params.registrationId },
      include: { camper: true },
    });
    const updated = await tx.registration.update({
      where: { id: registration.id },
      data: {
        tribeId: null,
        tribeAssignedAt: null,
        tribeAssignmentMethod: null,
        tribeRecommendationStatus: registration.suggestedTribeId ? "SUGGESTED" : "NONE",
      },
    });
    await logEvent(tx, {
      organizationId: registration.camper.organizationId,
      registrationId: registration.id,
      actorId: params.actorId,
      action: "TRIBE_ASSIGNMENT_CLEARED",
      previousValue: { tribeId: registration.tribeId },
    });
    return updated;
  });
}

export async function bulkAutoAssignTribes(params: { campId: string; actorId: string }) {
  // The admin button promises a complete one-click allocation. Previously it
  // only applied already-existing suggestions, so a fresh camp always
  // reported "Assigned 0 of 0 campers". Build the eligible active set,
  // generate recommendations for that exact set, then apply them.
  const eligible = await prisma.registration.findMany({
    where: {
      campId: params.campId,
      status: { in: [...ACTIVE_ASSIGNMENT_REGISTRATION_STATUSES] },
      tribeId: null,
      deletedAt: null,
    },
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const registrationIds = eligible.map((registration) => registration.id);
  if (registrationIds.length === 0) return [];

  const simulation = await runAllocationPipeline(prisma, params.campId, { scope: "active" });
  const eligibleIds = new Set(registrationIds);
  const results: { registrationId: string; tribeId?: string; preserved?: boolean; error?: string }[] = [];
  // The pipeline maintains an in-memory population after every decision, so
  // recommendations are balanced without re-querying the entire camp for
  // every camper. Persist only the eligible rows selected above.
  for (const assignment of simulation.assignments.filter((item) => eligibleIds.has(item.registrationId))) {
    try {
      const updated = await prisma.$transaction((tx) => assignTribeInTx(tx, {
        registrationId: assignment.registrationId,
        tribeId: assignment.tribeId,
        actorId: params.actorId,
        method: "AUTOMATIC",
        preserveExistingAssignment: true,
        requireActiveStatus: true,
      }));
      results.push(updated
        ? { registrationId: assignment.registrationId, tribeId: updated.tribeId ?? undefined }
        : { registrationId: assignment.registrationId, preserved: true });
    } catch (error) {
      results.push({ registrationId: assignment.registrationId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

export async function lockTribeAssignment(registrationId: string, locked: boolean, actorId: string) {
  const newStatus = locked ? "LOCKED" : "SUGGESTED";
  return prisma.registration.update({
    where: { id: registrationId },
    data: { isTribeLocked: locked, tribeRecommendationStatus: newStatus },
  });
}

