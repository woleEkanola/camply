import type { TribeWithCounts, AllocationUnit, RuleConfig } from "./types";

export interface ConstraintResult {
  passed: boolean;
  reason?: string;
}

export function evaluateHardConstraint(
  tribe: TribeWithCounts,
  unit: AllocationUnit,
  rule: RuleConfig,
  siblingTribeIds: Set<string>,
): ConstraintResult {
  switch (rule.criterion) {
    case "SIBLINGS_APART":
      if (siblingTribeIds.has(tribe.id)) {
        return { passed: false, reason: "Sibling already in this tribe (separation required)" };
      }
      return { passed: true };

    case "GENDER":
      if (tribe.gender && tribe.gender !== "MIXED" && unit.camper.gender) {
        if (unit.camper.gender !== "MALE" && unit.camper.gender !== "FEMALE") {
          return { passed: false, reason: "Camper gender is unknown or non-binary; cannot assign to a gender-restricted tribe" };
        }
        const tribeGender = tribe.gender === "MALE" ? "MALE" : "FEMALE";
        if (tribeGender !== unit.camper.gender) {
          return { passed: false, reason: `Tribe requires ${tribe.gender} gender, camper is ${unit.camper.gender}` };
        }
      }
      return { passed: true };

    default:
      return { passed: true };
  }
}

export function passesHardConstraints(
  tribe: TribeWithCounts,
  unit: AllocationUnit,
  hardRules: RuleConfig[],
  siblingTribeIds: Set<string>,
): ConstraintResult {
  if (tribe.status !== "ACTIVE") {
    return { passed: false, reason: "Tribe is not active" };
  }

  if (tribe.isAllocationLocked) {
    return { passed: false, reason: "Tribe is locked for automatic allocation" };
  }

  const groupSize = unit.siblingGroupIds.length + 1;
  if (tribe.maxCapacity != null && tribe.population + groupSize > tribe.maxCapacity) {
    return { passed: false, reason: `Tribe has insufficient capacity (need ${groupSize}, have ${(tribe.maxCapacity - tribe.population)} slots)` };
  }

  for (const rule of hardRules) {
    const result = evaluateHardConstraint(tribe, unit, rule, siblingTribeIds);
    if (!result.passed) return result;
  }

  return { passed: true };
}

export function detectImpossibilities(
  units: AllocationUnit[],
  tribes: TribeWithCounts[],
  hardRules: RuleConfig[],
): string[] {
  const warnings: string[] = [];
  const genderRule = hardRules.find((r) => r.criterion === "GENDER");

  if (genderRule) {
    const genderedTribes = tribes.filter((t) => t.gender && t.gender !== "MIXED");
    if (genderedTribes.length > 0) {
      const maleTribes = genderedTribes.filter((t) => t.gender === "MALE");
      const femaleTribes = genderedTribes.filter((t) => t.gender === "FEMALE");

      const maleCampers = units.filter((u) => u.camper.gender === "MALE").length;
      const femaleCampers = units.filter((u) => u.camper.gender === "FEMALE").length;

      const maleCapacity = maleTribes.reduce((sum, t) => sum + ((t.maxCapacity ?? Infinity) - t.population), 0);
      const femaleCapacity = femaleTribes.reduce((sum, t) => sum + ((t.maxCapacity ?? Infinity) - t.population), 0);

      if (maleCampers > maleCapacity) {
        warnings.push(`${maleCampers} male campers but only ${maleCapacity} male tribe slots available`);
      }
      if (femaleCampers > femaleCapacity) {
        warnings.push(`${femaleCampers} female campers but only ${femaleCapacity} female tribe slots available`);
      }
    }
  }

  const totalDemand = units.length;
  const totalCapacity = tribes
    .filter((t) => !t.isAllocationLocked)
    .reduce((sum, t) => sum + ((t.maxCapacity ?? Infinity) - t.population), Infinity);
  if (totalDemand > totalCapacity && totalCapacity < Infinity) {
    warnings.push(`${totalDemand} unallocated campers but only ${totalCapacity} total tribe slots available`);
  }

  return warnings;
}
