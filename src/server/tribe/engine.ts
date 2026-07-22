import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../db";
import { logEvent } from "../audit";
import { calculateAge } from "../registration/validation";
import { normalizeRules, DEFAULT_RULES_V2 } from "./allocator/rules";
import { passesHardConstraints } from "./allocator/constraints";
import { scoreCandidate, computeTargetSize } from "./allocator/scoring";
import { rankCandidates } from "./allocator/selector";
import { runAllocationPipeline, simulateAllocation } from "./allocator/pipeline";

export { simulateAllocation, runAllocationPipeline };
export { normalizeRules, DEFAULT_RULES_V2 };
export type { RuleConfig } from "./allocator/types";

export const TRIBE_ALLOCATION_ENGINE_VERSION = "2.0.0";

type TxClient = PrismaClient | Prisma.TransactionClient;

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
  params: { registrationId: string; tribeId: string; actorId: string | null; method: "AUTOMATIC" | "MANUAL" | "HYBRID_OVERRIDE"; rules?: unknown },
) {
  const registration = await tx.registration.findUniqueOrThrow({
    where: { id: params.registrationId },
    include: { camper: true },
  });

  const tribe = await tx.tribe.findUniqueOrThrow({ where: { id: params.tribeId }, include: { registrations: true } });
  if (tribe.campId !== registration.campId) {
    throw new TribeAllocationError("WRONG_CAMP", "This tribe does not belong to the same camp as the registration.");
  }
  if (tribe.status !== "ACTIVE") {
    throw new TribeAllocationError("TRIBE_INACTIVE", "This tribe is not active.");
  }
  const currentCount = tribe.registrations.filter((r) => r.id !== registration.id).length;
  if (tribe.maxCapacity != null && currentCount >= tribe.maxCapacity) {
    throw new TribeAllocationError("TRIBE_FULL", "This tribe has reached its maximum capacity.");
  }

  const previousTribeId = registration.tribeId;
  const updated = await tx.registration.update({
    where: { id: registration.id },
    data: { tribeId: params.tribeId, tribeAssignedAt: new Date(), tribeAssignmentMethod: params.method },
  });

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

export async function assignTribe(params: {
  registrationId: string;
  tribeId: string;
  actorId: string;
  method?: "AUTOMATIC" | "MANUAL" | "HYBRID_OVERRIDE";
}) {
  return prisma.$transaction((tx) =>
    assignTribeInTx(tx, { ...params, method: params.method ?? "MANUAL" })
  );
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
    const reg = await tx.registration.findUniqueOrThrow({
      where: { id: registrationId },
      include: { camper: true },
    });
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
  actorId: string | null
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
  const updatedReg = await assignTribeInTx(tx, {
    registrationId,
    tribeId: targetTribeId,
    actorId,
    method,
  });

  const finalStatus = reg.tribeRecommendationStatus === "MANUAL_OVERRIDE" ? "MANUAL_OVERRIDE" : "ASSIGNED";
  return tx.registration.update({
    where: { id: registrationId },
    data: { tribeRecommendationStatus: finalStatus },
  });
}

export async function confirmAssignment(registrationId: string, actorId: string) {
  return prisma.$transaction((tx) => confirmAssignmentInTx(tx, registrationId, actorId));
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

export async function bulkApplySuggestedTribes(params: {
  campId: string;
  registrationIds?: string[];
  actorId: string;
}) {
  const whereClause: Prisma.RegistrationWhereInput = {
    campId: params.campId,
    deletedAt: null,
    suggestedTribeId: { not: null },
    ...(params.registrationIds && params.registrationIds.length > 0
      ? { id: { in: params.registrationIds } }
      : { tribeId: null }),
  };

  const registrations = await prisma.registration.findMany({
    where: whereClause,
    select: { id: true },
  });

  const results: { registrationId: string; tribeId?: string; error?: string }[] = [];
  for (const reg of registrations) {
    try {
      const updated = await confirmAssignment(reg.id, params.actorId);
      results.push({ registrationId: reg.id, tribeId: updated.tribeId ?? undefined });
    } catch (err) {
      results.push({ registrationId: reg.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return results;
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
  const result = await prisma.$transaction(async (tx) => {
    const updated = await assignTribeInTx(tx, { ...params, method: "MANUAL" });
    return tx.registration.update({
      where: { id: updated.id },
      data: { tribeRecommendationStatus: "MANUAL_OVERRIDE" },
    });
  });

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
  return bulkApplySuggestedTribes(params);
}

export async function lockTribeAssignment(registrationId: string, locked: boolean, actorId: string) {
  const newStatus = locked ? "LOCKED" : "SUGGESTED";
  return prisma.registration.update({
    where: { id: registrationId },
    data: { isTribeLocked: locked, tribeRecommendationStatus: newStatus },
  });
}

