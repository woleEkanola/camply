import { evaluateMedicalText } from "./medicalCleaner";

export type MedicalSeverity = "CRITICAL" | "INFO" | "NONE";

/**
 * Keywords that indicate a life-safety-critical condition, as opposed to a
 * routine allergy/dietary note. Only CRITICAL cases interrupt scanning —
 * everything else renders as an inline banner. Keep this list curated and
 * conservative: false negatives here are the actual safety risk, so when in
 * doubt a phrase should be added rather than left out.
 */
const CRITICAL_KEYWORDS = [
  "anaphyla",
  "severe allergy",
  "severe allergic",
  "do not release",
  "isolation",
  "medical hold",
  "epilep",
  "seizure",
  "insulin",
  "insulin-dependent",
  "requires medication at",
  "epipen",
  "epi-pen",
  "high risk",
];

export interface MedicalInput {
  allergies?: string | null;
  medicalConditions?: string | null;
  medications?: string | null;
  dietaryRestrictions?: string | null;
}

export interface MedicalClassification {
  severity: MedicalSeverity;
  flags: string[];
}

export function classifyMedical(input: MedicalInput): MedicalClassification {
  const fields: Array<[string, string | null | undefined]> = [
    ["allergies", input.allergies],
    ["medicalConditions", input.medicalConditions],
    ["medications", input.medications],
    ["dietaryRestrictions", input.dietaryRestrictions],
  ];

  // Filter out empty strings AND non-medical placeholders (e.g. "None", "N/A", "Nil", "-")
  const validFields = fields.filter(([, value]) => {
    if (!value || value.trim().length === 0) return false;
    const evaluation = evaluateMedicalText(value);
    return evaluation.action === "PRESERVE";
  });

  const flags = validFields.map(([key]) => key);

  if (flags.length === 0) {
    return { severity: "NONE", flags: [] };
  }

  const combinedText = validFields
    .map(([, value]) => value || "")
    .join(" ")
    .toLowerCase();

  const isCritical = CRITICAL_KEYWORDS.some((keyword) => combinedText.includes(keyword));

  return { severity: isCritical ? "CRITICAL" : "INFO", flags };
}

