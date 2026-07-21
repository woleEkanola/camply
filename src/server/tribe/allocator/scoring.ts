import type { TribeWithCounts, AllocationUnit, RuleConfig, AllocationState } from "./types";
import { priorityWeight } from "./rules";

export function computeTargetSize(state: AllocationState, campTargetOverride: number | null): number {
  if (campTargetOverride != null) return campTargetOverride;
  const activeTribes = Array.from(state.tribes.values()).filter((t) => !t.isAllocationLocked);
  if (activeTribes.length === 0) return 0;
  const totalApproved = state.units.length;
  return Math.ceil(totalApproved / activeTribes.length);
}

export function populationScore(
  tribe: TribeWithCounts,
  groupSize: number,
  targetSize: number,
): number {
  const currentDeviation = Math.abs(tribe.population - targetSize);
  const nextDeviation = Math.abs((tribe.population + groupSize) - targetSize);
  return currentDeviation - nextDeviation;
}

export function culturalDiversityScore(
  tribe: TribeWithCounts,
  unit: AllocationUnit,
  field: "CAMPUS" | "CHURCH" | "SCHOOL",
): number {
  let value: string | null = null;
  let currentCount = 0;

  switch (field) {
    case "CAMPUS":
      value = unit.campusId;
      currentCount = tribe.sameCampusCount;
      break;
    case "CHURCH":
      value = unit.camper.church;
      currentCount = tribe.sameChurchCount;
      break;
    case "SCHOOL":
      value = unit.camper.school;
      currentCount = tribe.sameSchoolCount;
      break;
  }

  if (!value) return 0;

  const total = tribe.population;
  const currentRatio = total === 0 ? 0 : currentCount / total;
  const nextRatio = (currentCount + 1) / (total + 1);

  return (1 - currentRatio) - (1 - nextRatio);
}

export function scoreCandidate(
  tribe: TribeWithCounts,
  unit: AllocationUnit,
  softRules: RuleConfig[],
  state: AllocationState,
  camperAgeGroup: string,
): { score: number; breakdown: Record<string, number> } {
  let total = 0;
  const breakdown: Record<string, number> = {};
  const groupSize = unit.siblingGroupIds.length + 1;

  for (const rule of softRules) {
    const weight = priorityWeight(rule.priority);
    let s = 0;

    switch (rule.criterion) {
      case "SIBLINGS_TOGETHER":
        s = 0;
        break;

      case "GENDER": {
        const totalGender = tribe.population;
        if (totalGender > 0) {
          const ratio = tribe.sameGenderCount / totalGender;
          s = weight * (1 - ratio);
        }
        break;
      }

      case "AGE":
        if (tribe.population > 0) {
          const ratio = tribe.sameAgeGroupCount / tribe.population;
          s = weight * (1 - ratio);
        }
        break;

      case "CAMPUS":
        s = weight * culturalDiversityScore(tribe, unit, "CAMPUS");
        break;

      case "CHURCH":
        s = weight * culturalDiversityScore(tribe, unit, "CHURCH");
        break;

      case "SCHOOL":
        s = weight * culturalDiversityScore(tribe, unit, "SCHOOL");
        break;

      case "POPULATION":
        s = weight * populationScore(tribe, groupSize, state.targetSize);
        break;

      default:
        break;
    }

    total += s;
    breakdown[rule.criterion] = Math.round(s * 100) / 100;
  }

  return { score: total, breakdown };
}

export function buildScoringContext(
  tribes: TribeWithCounts[],
  unit: AllocationUnit,
  cutoff: Date,
): { populatedTribes: TribeWithCounts[]; camperAgeGroup: string; siblingTribeIds: Set<string> } {
  const camperAgeGroup = ageGroupForUnit(unit, cutoff);

  const siblingTribeIds = new Set<string>();
  if (unit.siblingGroupIds.length > 0) {
    for (const t of tribes) {
      if (t.id) siblingTribeIds.add(t.id);
    }
  }

  return { populatedTribes: tribes, camperAgeGroup, siblingTribeIds };
}

function ageGroupForUnit(unit: AllocationUnit, cutoff: Date): string {
  const dob = unit.camper.dateOfBirth;
  if (!dob) return "unknown";
  const age = calculateAgeFn(dob, cutoff);
  if (age <= 12) return "10-12";
  if (age <= 15) return "13-15";
  return "16-18";
}

function calculateAgeFn(dateOfBirth: Date, cutoff: Date): number {
  let age = cutoff.getFullYear() - dateOfBirth.getFullYear();
  const m = cutoff.getMonth() - dateOfBirth.getMonth();
  if (m < 0 || (m === 0 && cutoff.getDate() < dateOfBirth.getDate())) {
    age--;
  }
  return age;
}
