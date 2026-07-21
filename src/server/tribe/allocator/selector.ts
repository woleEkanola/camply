import type { TribeWithCounts, AllocationUnit, AllocationState } from "./types";

export interface ScoredCandidate {
  tribe: TribeWithCounts;
  score: number;
  breakdown: Record<string, number>;
  reasons: string[];
}

export function rankCandidates(
  candidates: ScoredCandidate[],
  unit: AllocationUnit,
  state: AllocationState,
): ScoredCandidate[] {
  return candidates.slice().sort((a, b) => {
    if (Math.abs(a.score - b.score) > 0.001) {
      return b.score - a.score;
    }

    const groupSize = unit.siblingGroupIds.length + 1;
    const devA = Math.abs((a.tribe.population + groupSize) - state.targetSize);
    const devB = Math.abs((b.tribe.population + groupSize) - state.targetSize);
    if (devA !== devB) return devA - devB;

    const diversityA = diversityGain(a.tribe, unit);
    const diversityB = diversityGain(b.tribe, unit);
    if (diversityA !== diversityB) return diversityB - diversityA;

    if (a.tribe.population !== b.tribe.population) {
      return a.tribe.population - b.tribe.population;
    }

    return a.tribe.name.localeCompare(b.tribe.name);
  });
}

function diversityGain(tribe: TribeWithCounts, unit: AllocationUnit): number {
  let gain = 0;
  if (unit.campusId) {
    const ratio = tribe.sameCampusCount / Math.max(1, tribe.population);
    gain += 1 - ratio;
  }
  if (unit.camper.church) {
    const ratio = tribe.sameChurchCount / Math.max(1, tribe.population);
    gain += 1 - ratio;
  }
  if (unit.camper.school) {
    const ratio = tribe.sameSchoolCount / Math.max(1, tribe.population);
    gain += 1 - ratio;
  }
  return gain;
}
