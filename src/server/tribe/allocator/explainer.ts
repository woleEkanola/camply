import type { TribeWithCounts, AllocationUnit, AllocationState } from "./types";

export function generateExplanation(
  tribe: TribeWithCounts,
  unit: AllocationUnit,
  state: AllocationState,
): string[] {
  const reasons: string[] = [];

  const groupSize = unit.siblingGroupIds.length + 1;
  if (tribe.maxCapacity == null || tribe.population + groupSize <= tribe.maxCapacity) {
    reasons.push("Tribe has available capacity");
  }

  const dev = Math.abs(tribe.population + groupSize - state.targetSize);
  if (dev <= 2) {
    reasons.push("Keeps tribe within target population");
  } else if (tribe.population < state.targetSize) {
    reasons.push("Moves tribe closer to target population");
  }

  if (unit.camper.gender && tribe.gender === "MIXED") {
    reasons.push("Gender-compatible tribe");
  }

  if (unit.siblingGroupIds.length > 0) {
    reasons.push("Keeps sibling group together");
  }

  if (unit.campusId && tribe.sameCampusCount < tribe.population / 2) {
    reasons.push("Improves campus diversity");
  }

  if (unit.camper.church && tribe.sameChurchCount < tribe.population / 3) {
    reasons.push("Balances church representation");
  }

  if (unit.camper.school && tribe.sameSchoolCount < tribe.population / 3) {
    reasons.push("Balances school representation");
  }

  if (reasons.length === 0) {
    reasons.push("Best available match");
  }

  return reasons;
}
