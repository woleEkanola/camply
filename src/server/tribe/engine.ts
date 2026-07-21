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

export async function autoAssignTribeOnApproval(registrationId: string) {
  try {
    const registration = await prisma.registration.findUnique({ where: { id: registrationId }, include: { camp: true } });
    if (!registration || !registration.camp.tribeAllocationEnabled || registration.camp.tribeAllocationMode !== "AUTOMATIC") {
      return;
    }
    if (registration.tribeId) return;

    const suggestion = await suggestTribe(prisma, registrationId);
    if (!suggestion) return;

    await prisma.$transaction((tx) =>
      assignTribeInTx(tx, { registrationId, tribeId: suggestion.tribeId, actorId: null, method: "AUTOMATIC" })
    );
  } catch (error) {
    console.error("Automatic tribe assignment failed:", error);
  }
}

export async function reassignTribe(params: { registrationId: string; tribeId: string; actorId: string; reason?: string }) {
  const result = await prisma.$transaction((tx) => assignTribeInTx(tx, { ...params, method: "MANUAL" }));
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
      data: { tribeId: null, tribeAssignedAt: null, tribeAssignmentMethod: null },
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
  const registrations = await prisma.registration.findMany({
    where: { campId: params.campId, status: { in: ["APPROVED", "CHECKED_IN"] }, tribeId: null, deletedAt: null },
    select: { id: true },
  });

  const results: { registrationId: string; tribeId?: string; error?: string }[] = [];
  for (const reg of registrations) {
    try {
      const suggestion = await suggestTribe(prisma, reg.id);
      if (!suggestion) {
        results.push({ registrationId: reg.id, error: "No available tribe" });
        continue;
      }
      await prisma.$transaction((tx) =>
        assignTribeInTx(tx, { registrationId: reg.id, tribeId: suggestion.tribeId, actorId: params.actorId, method: "AUTOMATIC" })
      );
      results.push({ registrationId: reg.id, tribeId: suggestion.tribeId });
    } catch (error) {
      results.push({ registrationId: reg.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

export async function lockTribeAssignment(registrationId: string, locked: boolean, actorId: string) {
  return prisma.registration.update({
    where: { id: registrationId },
    data: { isTribeLocked: locked },
  });
}
