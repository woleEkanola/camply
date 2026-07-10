import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../db";
import { logEvent } from "../audit";
import { calculateAge } from "../registration/validation";

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

interface Rule {
  criterion: Criterion;
  enabled: boolean;
}

const DEFAULT_RULES: Rule[] = [
  { criterion: "SIBLINGS_TOGETHER", enabled: false },
  { criterion: "GENDER", enabled: true },
  { criterion: "AGE", enabled: true },
  { criterion: "POPULATION", enabled: true },
];

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
}

/**
 * Scores every active, non-full tribe against the year's enabled allocation
 * criteria (in priority order) and returns the best match (PRD Part 4A §6-8).
 * Pure read — never mutates anything, safe to call for a "suggested" preview.
 */
export async function suggestTribe(tx: TxClient, registrationId: string): Promise<TribeSuggestion | null> {
  const registration = await tx.registration.findUniqueOrThrow({
    where: { id: registrationId },
    include: { camper: true, camp: true, campus: true },
  });

  const tribes = await tx.tribe.findMany({
    where: { campId: registration.campId, status: "ACTIVE" },
    include: { registrations: { select: { id: true, camper: true, campusId: true } } },
  });
  if (tribes.length === 0) return null;

  const rules: Rule[] = Array.isArray(registration.camp.tribeAllocationRules)
    ? (registration.camp.tribeAllocationRules as unknown as Rule[])
    : DEFAULT_RULES;
  const enabledRules = rules.filter((r) => r.enabled);

  const cutoff = registration.camp.ageCutoffDate ?? registration.camp.startDate;
  const camperAgeGroup = ageGroup(registration.camper.dateOfBirth, cutoff);

  // Siblings: other campers under the same parent already assigned to a tribe this camp.
  const siblingTribeIds = new Set(
    (
      await tx.registration.findMany({
        where: {
          campId: registration.campId,
          tribeId: { not: null },
          camper: { userId: registration.camper.userId },
          id: { not: registration.id },
        },
        select: { tribeId: true },
      })
    ).map((r) => r.tribeId)
  );

  const candidates = tribes.filter((t) => t.maxCapacity == null || t.registrations.length < t.maxCapacity);
  if (candidates.length === 0) return null;

  const scored = candidates.map((tribe) => {
    let score = 0;
    const reasons: string[] = [];

    for (const rule of enabledRules) {
      switch (rule.criterion) {
        case "SIBLINGS_TOGETHER":
          if (siblingTribeIds.has(tribe.id)) {
            score += 1000;
            reasons.push("Sibling already in this tribe");
          }
          break;
        case "SIBLINGS_APART":
          if (siblingTribeIds.has(tribe.id)) {
            score -= 1000;
          } else {
            reasons.push("Keeps siblings separate");
          }
          break;
        case "GENDER": {
          const counts = tribe.registrations.reduce(
            (acc, r) => {
              const g = (r.camper as any).gender;
              if (g) acc[g] = (acc[g] ?? 0) + 1;
              return acc;
            },
            {} as Record<string, number>
          );
          const myGender = registration.camper.gender;
          const myCount = myGender ? counts[myGender] ?? 0 : 0;
          score += 100 - myCount; // fewer of my gender here = better
          if (myCount === Math.min(...Object.values(counts), 0)) reasons.push("Gender balance maintained");
          break;
        }
        case "AGE": {
          const sameAgeGroupCount = tribe.registrations.filter(
            (r) => ageGroup((r.camper as any).dateOfBirth, cutoff) === camperAgeGroup
          ).length;
          score += 100 - sameAgeGroupCount;
          reasons.push("Age balance maintained");
          break;
        }
        case "CAMPUS": {
          const sameCampusCount = tribe.registrations.filter((r) => r.campusId === registration.campusId).length;
          score += 50 - sameCampusCount;
          break;
        }
        case "CHURCH": {
          const church = (registration.camper as any).church;
          const sameChurchCount = church
            ? tribe.registrations.filter((r) => (r.camper as any).church === church).length
            : 0;
          score += 20 - sameChurchCount;
          break;
        }
        case "SCHOOL": {
          const school = (registration.camper as any).school;
          const sameSchoolCount = school
            ? tribe.registrations.filter((r) => (r.camper as any).school === school).length
            : 0;
          score += 20 - sameSchoolCount;
          break;
        }
        case "POPULATION":
          score += 1000 - tribe.registrations.length;
          if (reasons.length === 0 || !reasons.includes("Lowest population")) {
            reasons.push("Lowest population");
          }
          break;
      }
    }

    return { tribe, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const worstScore = scored[scored.length - 1].score;
  const spread = best.score - worstScore || 1;
  const confidence = Math.round(Math.min(99, 50 + ((best.score - worstScore) / spread) * 49));

  return {
    tribeId: best.tribe.id,
    tribeName: best.tribe.name,
    confidence,
    reasons: Array.from(new Set(best.reasons)),
  };
}

async function assignTribeInTx(
  tx: Prisma.TransactionClient,
  params: { registrationId: string; tribeId: string; actorId: string | null; method: "AUTOMATIC" | "MANUAL" | "HYBRID_OVERRIDE" }
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
  method?: "MANUAL" | "HYBRID_OVERRIDE";
}) {
  return prisma.$transaction((tx) =>
    assignTribeInTx(tx, { ...params, method: params.method ?? "MANUAL" })
  );
}

/** Called from the Registration Engine on approval when tribeAllocationMode === AUTOMATIC. Never throws. */
export async function autoAssignTribeOnApproval(registrationId: string) {
  try {
    const registration = await prisma.registration.findUnique({ where: { id: registrationId }, include: { camp: true } });
    if (!registration || !registration.camp.tribeAllocationEnabled || registration.camp.tribeAllocationMode !== "AUTOMATIC") {
      return;
    }
    if (registration.tribeId) return; // already assigned

    const suggestion = await suggestTribe(prisma, registrationId);
    if (!suggestion) return; // no tribes configured or all full — leave for manual assignment

    await prisma.$transaction((tx) =>
      assignTribeInTx(tx, { registrationId, tribeId: suggestion.tribeId, actorId: null, method: "AUTOMATIC" })
    );
  } catch (error) {
    // Tribe assignment must never block or reverse an approval (PRD Part 4A §3).
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

/** Bulk-assigns tribes for every un-tribed approved registration in a camp using automatic suggestion. */
export async function bulkAutoAssignTribes(params: { campId: string; actorId: string }) {
  const registrations = await prisma.registration.findMany({
    where: { campId: params.campId, status: { in: ["APPROVED", "CHECKED_IN"] }, tribeId: null },
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
