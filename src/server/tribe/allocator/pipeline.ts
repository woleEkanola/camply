import type { PrismaClient } from "@prisma/client";
import {
  type AllocationUnit,
  type AllocationResult,
  type AllocationState,
  type SimulationResult,
  type RuleConfig,
  type TribeWithCounts,
} from "./types";
import { normalizeRules } from "./rules";
import { loadAllocationInput, ageGroup } from "./loader";
import { passesHardConstraints, detectImpossibilities } from "./constraints";
import { computeTargetSize, scoreCandidate, buildScoringContext } from "./scoring";
import { rankCandidates, type ScoredCandidate } from "./selector";
import { generateExplanation } from "./explainer";
import { computeQualityReport } from "./quality";

export async function runAllocationPipeline(
  tx: PrismaClient,
  campId: string,
  options: {
    rules?: unknown;
    targetSize?: number | null;
    scope?: "approved" | "all";
    lockedRegistrationIds?: string[];
  } = {},
): Promise<SimulationResult & { state: AllocationState }> {
  const { tribes: tribesRaw, units: unitsRaw } = await loadAllocationInput(tx, campId, options.scope ?? "approved");
  const rules = normalizeRules(options.rules);

  const lockedIds = new Set(options.lockedRegistrationIds ?? []);

  const tribesMap = new Map<string, TribeWithCounts>();
  for (const t of tribesRaw) {
    tribesMap.set(t.id, t);
  }

  const camp = await tx.camp.findUniqueOrThrow({ where: { id: campId }, select: { ageCutoffDate: true, startDate: true } });
  const cutoff = camp.ageCutoffDate ?? camp.startDate;

  const units = unitsRaw.map((u) => {
    const ag = ageGroup(u.camper.dateOfBirth, cutoff);
    for (const [, tribe] of tribesMap) {
      tribe.sameAgeGroupCount = 0;
    }
    return u;
  });

  const state: AllocationState = {
    tribes: tribesMap,
    units,
    assignments: new Map(),
    targetSize: computeTargetSize({ tribes: tribesMap, units, assignments: new Map(), targetSize: 0 }, null),
  };
  state.targetSize = options.targetSize ?? computeTargetSize(state, null);

  const warnings = detectImpossibilities(units, Array.from(tribesMap.values()), rules.hard);
  const results: AllocationResult[] = [];
  let lockedCount = 0;

  for (const unit of units) {
    if (lockedIds.has(unit.registrationId)) {
      lockedCount++;
      continue;
    }

    const { camperAgeGroup, siblingTribeIds } = buildScoringContext(Array.from(tribesMap.values()), unit, cutoff);

    const candidates: TribeWithCounts[] = [];
    for (const [, tribe] of tribesMap) {
      const hard = passesHardConstraints(tribe, unit, rules.hard, siblingTribeIds);
      if (hard.passed) {
        candidates.push(tribe);
      }
    }

    if (candidates.length === 0) {
      warnings.push(`No eligible tribe for registration ${unit.registrationId} (${unit.camper.name})`);
      continue;
    }

    const scored: ScoredCandidate[] = candidates.map((tribe) => {
      const { score, breakdown } = scoreCandidate(tribe, unit, rules.soft, state, camperAgeGroup);
      const reasons = generateExplanation(tribe, unit, state);
      return { tribe, score, breakdown, reasons };
    });

    const ranked = rankCandidates(scored, unit, state);
    const best = ranked[0];

    state.assignments.set(unit.registrationId, best.tribe.id);
    best.tribe.population += unit.siblingGroupIds.length + 1;

    results.push({
      registrationId: unit.registrationId,
      tribeId: best.tribe.id,
      tribeName: best.tribe.name,
      method: "AUTOMATIC",
      explanation: best.reasons,
      scoreBreakdown: best.breakdown,
    });

    for (const siblingId of unit.siblingGroupIds) {
      state.assignments.set(siblingId, best.tribe.id);
      results.push({
        registrationId: siblingId,
        tribeId: best.tribe.id,
        tribeName: best.tribe.name,
        method: "AUTOMATIC",
        explanation: ["Assigned with sibling"],
        scoreBreakdown: {},
      });
    }
  }

  const quality = computeQualityReport(state);

  return {
    assignments: results.map((r) => ({
      ...r,
      explanation: Array.from(new Set(r.explanation)),
    })),
    quality,
    warnings,
    lockedCount,
    changedCount: results.length,
    state,
  };
}

export async function simulateAllocation(
  tx: PrismaClient,
  campId: string,
  options?: { rules?: unknown; targetSize?: number | null; scope?: "approved" | "all" },
): Promise<SimulationResult> {
  const { assignments, quality, warnings, lockedCount, changedCount } = await runAllocationPipeline(tx, campId, options);
  return { assignments, quality, warnings, lockedCount, changedCount };
}
