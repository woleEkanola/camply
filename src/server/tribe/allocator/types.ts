export type Criterion =
  | "SIBLINGS_TOGETHER"
  | "SIBLINGS_APART"
  | "RETURNING_CAMPER"
  | "GENDER"
  | "AGE"
  | "CAMPUS"
  | "CHURCH"
  | "SCHOOL"
  | "POPULATION";

export type RulePriority = "REQUIRED" | "VERY_HIGH" | "HIGH" | "MEDIUM" | "LOW";
export type RuleCategory = "CAPACITY" | "DEMOGRAPHICS" | "RELATIONSHIPS" | "SPECIAL" | "OPTIMIZATION";

export interface RuleConfig {
  criterion: Criterion;
  category: RuleCategory;
  enabled: boolean;
  priority: RulePriority;
}

export interface NormalizedRules {
  hard: RuleConfig[];
  soft: RuleConfig[];
  all: RuleConfig[];
}

export interface TribeWithCounts {
  id: string;
  name: string;
  campId: string;
  gender: string | null;
  ageRange: string | null;
  maxCapacity: number | null;
  isAllocationLocked: boolean;
  status: string;
  population: number;
  sameGenderCount: number;
  sameAgeGroupCount: number;
  sameCampusCount: number;
  sameChurchCount: number;
  sameSchoolCount: number;
}

export interface AllocationUnit {
  registrationId: string;
  camper: {
    id: string;
    name: string;
    dateOfBirth: Date | null;
    gender: string | null;
    userId: string;
    school: string | null;
    church: string | null;
    medicalProfile: unknown;
  };
  campusId: string;
  siblingGroupIds: string[];
}

export interface AllocationResult {
  registrationId: string;
  tribeId: string;
  tribeName: string;
  method: "AUTOMATIC" | "MANUAL" | "HYBRID_OVERRIDE";
  explanation: string[];
  scoreBreakdown: Record<string, number>;
}

export interface AllocationQualityReport {
  overall: number;
  populationBalance: number;
  genderBalance: number;
  campusDiversity: number;
  ageBalance: number;
  capacityUtilization: number;
  ruleCompliance: number;
}

export interface SimulationResult {
  assignments: AllocationResult[];
  quality: AllocationQualityReport;
  warnings: string[];
  lockedCount: number;
  changedCount: number;
}

export interface AllocationState {
  tribes: Map<string, TribeWithCounts>;
  units: AllocationUnit[];
  assignments: Map<string, string>;
  targetSize: number;
}
