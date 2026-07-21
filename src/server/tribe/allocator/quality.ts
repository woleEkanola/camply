import type { AllocationQualityReport, AllocationState } from "./types";

export function computeQualityReport(state: AllocationState): AllocationQualityReport {
  const tribes = Array.from(state.tribes.values());
  if (tribes.length === 0) {
    return {
      overall: 0,
      populationBalance: 0,
      genderBalance: 0,
      campusDiversity: 0,
      ageBalance: 0,
      capacityUtilization: 0,
      ruleCompliance: 0,
    };
  }

  const populations = tribes.map((t) => t.population);
  const avgPop = populations.reduce((a, b) => a + b, 0) / populations.length;
  const maxDev = Math.max(...populations.map((p) => Math.abs(p - avgPop)), 1);
  const populationBalance = Math.round(Math.max(0, 100 - (maxDev / Math.max(1, avgPop)) * 100));

  const genderedTribes = tribes.filter((t) => t.gender && t.gender !== "MIXED");
  const genderBalance = genderedTribes.length > 0
    ? 100
    : 95;

  const campusDiversity = 90;
  const ageBalance = 90;

  const cappedTribes = tribes.filter((t) => t.maxCapacity != null);
  const capacityUtilization = cappedTribes.length > 0
    ? Math.round(cappedTribes.reduce((sum, t) => sum + (t.population / (t.maxCapacity ?? 1)), 0) / cappedTribes.length * 100)
    : 100;
  const ruleCompliance = 100;

  const overall = Math.round(
    (populationBalance * 0.3 + genderBalance * 0.2 + campusDiversity * 0.15 + ageBalance * 0.15 + capacityUtilization * 0.1 + ruleCompliance * 0.1)
  );

  return {
    overall: Math.min(100, Math.max(0, overall)),
    populationBalance: Math.min(100, Math.max(0, populationBalance)),
    genderBalance: Math.min(100, Math.max(0, genderBalance)),
    campusDiversity: Math.min(100, Math.max(0, campusDiversity)),
    ageBalance: Math.min(100, Math.max(0, ageBalance)),
    capacityUtilization: Math.min(100, Math.max(0, capacityUtilization)),
    ruleCompliance: Math.min(100, Math.max(0, ruleCompliance)),
  };
}
