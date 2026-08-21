/**
 * Intelligent Clinical Placeholder & Medical Sanitization Engine
 * 
 * Accurately detects and cleans non-medical placeholders (e.g. "None", "N/A", "Nil", "-")
 * while strictly protecting legitimate short medical terms (e.g. "Egg", "Nut", "Soy", "TB", "HIV", "IBS", "DM")
 * and positive allergen disclosures containing negation words (e.g. "No peanuts").
 */

export type CleanAction = "CLEAN_TO_NULL" | "PRESERVE";

export interface CleanEvaluation {
  action: CleanAction;
  originalValue: string;
  cleanedValue: string | null;
  reason: string;
  isShortTermProtected: boolean;
}

/**
 * Protected Clinical Lexicon:
 * Legitimate allergens, medical conditions, symptoms, and medications that are short
 * (2-5 characters) and must never be treated as placeholders.
 */
export const PROTECTED_SHORT_TERMS = new Set([
  // Allergens & Foods
  "egg",
  "eggs",
  "nut",
  "nuts",
  "soy",
  "soya",
  "hay",
  "bee",
  "bees",
  "cat",
  "cats",
  "dog",
  "dogs",
  "fur",
  "pen",
  "tea",
  "sun",
  "oil",
  "ice",
  "msg",
  "kiwi",
  "corn",
  "milk",
  "pork",
  "fish",
  "dust",
  "latex",
  "sulfa",
  "nsaid",
  "nsaids",
  "crab",
  "shrimp",
  "meat",
  "beef",
  "wool",

  // Conditions & Diagnoses
  "tb",
  "hiv",
  "aids",
  "uti",
  "ibs",
  "ibd",
  "dm",
  "dm1",
  "dm2",
  "htn",
  "asd",
  "ocd",
  "adhd",
  "gerd",
  "pcos",
  "scd",
  "hbss",
  "hbas",
  "hbsc",
  "ss",
  "as",
  "g6pd",
  "cold",
  "flu",
  "fits",
  "rash",
  "acne",
  "ulcer",
  "asthma",
  "ent",
  "piles",
  "polyp",
  "cysts",
  "cyst",
  "gout",
  "mumps",
  "measles",

  // Medications
  "pcm",
  "iron",
  "zinc",
  "tabs",
  "pills",
  "drops",
  "syrup",
  "gel",
  "spray",
  "inhaler",
  "ventolin",
  "paracetamol",
]);

/**
 * Unambiguous exact phrases that indicate "no condition" when they constitute the entire field.
 */
const EXACT_PLACEHOLDERS = new Set([
  "",
  "-",
  "--",
  "---",
  ".",
  "..",
  "...",
  "/",
  "//",
  "n/a",
  "na",
  "n.a",
  "n.a.",
  "n/a.",
  "na.",
  "nil",
  "nil.",
  "none",
  "none.",
  "no",
  "no.",
  "nope",
  "nothing",
  "nothing.",
  "null",
  "not applicable",
  "not applicable.",
  "not available",
  "no allergy",
  "no allergies",
  "no allergy.",
  "no allergies.",
  "no allergies reported",
  "no allergies known",
  "no known allergy",
  "no known allergies",
  "no known allergies.",
  "no known allergy.",
  "no medical condition",
  "no medical conditions",
  "no medical condition.",
  "no medical conditions.",
  "no known medical condition",
  "no known medical conditions",
  "no known medical issue",
  "no known medical issues",
  "none known",
  "none known.",
  "none reported",
  "none reported.",
  "none at all",
  "none for now",
  "none for now.",
  "none so far",
  "none so far.",
  "none that i know of",
  "none that i am aware of",
  "nil reported",
  "nil known",
  "healthy",
  "healthy.",
  "fit",
  "fit.",
  "all good",
  "all good.",
  "fine",
  "fine.",
  "good",
  "good.",
  "non",
  "zero",
  "no issue",
  "no issues",
  "no problem",
  "no problems",
  "i have no allergies",
  "i do not have any allergies",
  "i dont have any allergies",
  "i don't have any allergies",
  "she has no allergies",
  "he has no allergies",
  "no illness",
  "no sickness",
  "not any",
  "none whatsoever",
  "negative",
]);

/**
 * Patterns of legitimate disclosures that might contain "no" but describe specific foods or restrictions.
 * E.g., "no pork", "no beef", "no peanuts", "no seafood", "no dairy", "no penicillin"
 */
const SUBSTANCE_SPECIFICATIONS = [
  /\bno\s+(pork|beef|meat|fish|seafood|chicken|dairy|milk|cheese|egg|eggs|nuts?|peanuts?|gluten|wheat|sugar|salt|oil|pepper|penicillin|antibiotics?|aspirin|sulfa|nsaids?)\b/i,
  /\b(allergic to|allergy to|cannot eat|can't eat|avoids?|intolerant to|intolerant of|reaction to|sensitive to)\b/i,
];

/**
 * Evaluates any free-text medical field and decides whether it is a safe placeholder to clean to null
 * or a legitimate medical/allergy disclosure that must be preserved.
 */
export function evaluateMedicalText(rawText: string | null | undefined): CleanEvaluation {
  if (rawText === null || rawText === undefined) {
    return {
      action: "PRESERVE",
      originalValue: "",
      cleanedValue: null,
      reason: "Empty value",
      isShortTermProtected: false,
    };
  }

  const trimmed = rawText.trim();
  if (trimmed.length === 0) {
    return {
      action: "CLEAN_TO_NULL",
      originalValue: rawText,
      cleanedValue: null,
      reason: "Whitespace only",
      isShortTermProtected: false,
    };
  }

  const normalized = trimmed.toLowerCase().replace(/\s+/g, " ");

  // 1. Check if the text matches the Protected Short Terms dictionary (e.g. "Egg", "Nut", "TB", "HIV")
  if (PROTECTED_SHORT_TERMS.has(normalized)) {
    return {
      action: "PRESERVE",
      originalValue: rawText,
      cleanedValue: trimmed,
      reason: `Protected clinical term: "${trimmed}"`,
      isShortTermProtected: true,
    };
  }

  // 2. Check exact placeholder dictionary (e.g. "None", "N/A", "Nil", "No allergies", "No known medical conditions")
  if (EXACT_PLACEHOLDERS.has(normalized)) {
    return {
      action: "CLEAN_TO_NULL",
      originalValue: rawText,
      cleanedValue: null,
      reason: `Placeholder phrase: "${trimmed}"`,
      isShortTermProtected: false,
    };
  }

  // 3. Strip surrounding punctuation and re-check exact placeholders (e.g., "- none -", "[N/A]", "(nil)")
  const cleanPunctuation = normalized.replace(/^[-_\s\.\,\(\)\[\]\{\}\/\\:;]+|[-_\s\.\,\(\)\[\]\{\}\/\\:;]+$/g, "");
  if (EXACT_PLACEHOLDERS.has(cleanPunctuation)) {
    return {
      action: "CLEAN_TO_NULL",
      originalValue: rawText,
      cleanedValue: null,
      reason: `Placeholder with punctuation: "${trimmed}"`,
      isShortTermProtected: false,
    };
  }

  // 4. Check if it's a repeated punctuation string (e.g., "----", "...", "///")
  if (/^[-_\.\,\/\s\\*~`!@#$%^&+=\?]+$/.test(trimmed)) {
    return {
      action: "CLEAN_TO_NULL",
      originalValue: rawText,
      cleanedValue: null,
      reason: "Punctuation/symbol string only",
      isShortTermProtected: false,
    };
  }

  // 5. Check if the text is a legitimate positive disclosure with negative words (e.g. "No pork", "No nuts", "Allergic to eggs")
  for (const pattern of SUBSTANCE_SPECIFICATIONS) {
    if (pattern.test(normalized)) {
      return {
        action: "PRESERVE",
        originalValue: rawText,
        cleanedValue: trimmed,
        reason: `Legitimate substance/restriction disclosure: "${trimmed}"`,
        isShortTermProtected: false,
      };
    }
  }

  // 5. Check if it's a repeated punctuation string (e.g., "----", "...", "///")
  if (/^[-_\.\,\/\s\\*~`!@#$%^&+=\?]+$/.test(trimmed)) {
    return {
      action: "CLEAN_TO_NULL",
      originalValue: rawText,
      cleanedValue: null,
      reason: "Punctuation/symbol string only",
      isShortTermProtected: false,
    };
  }

  // Otherwise, safely preserve the legitimate medical text
  return {
    action: "PRESERVE",
    originalValue: rawText,
    cleanedValue: trimmed,
    reason: "Valid clinical or dietary entry",
    isShortTermProtected: trimmed.length <= 4,
  };
}

/**
 * Convenience helper: returns true if the value is a confirmed non-medical placeholder.
 */
export function isPlaceholderMedicalText(text: string | null | undefined): boolean {
  if (!text) return false;
  return evaluateMedicalText(text).action === "CLEAN_TO_NULL";
}
