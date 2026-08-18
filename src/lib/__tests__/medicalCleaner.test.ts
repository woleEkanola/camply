import { describe, expect, it } from "vitest";
import { evaluateMedicalText, isPlaceholderMedicalText } from "../medicalCleaner";
import { classifyMedical } from "../medical";

describe("medicalCleaner - evaluateMedicalText", () => {
  it("cleans standard non-medical placeholders to null", () => {
    const placeholders = [
      "None",
      "none",
      "NONE",
      "N/A",
      "n/a",
      "NA",
      "na",
      "N.A.",
      "Nil",
      "nil",
      "-",
      "--",
      "...",
      "/",
      "No",
      "no",
      "Nothing",
      "not applicable",
      "No allergies",
      "No allergy",
      "no allergies reported",
      "no known allergies",
      "no known allergy.",
      "no medical conditions",
      "no known medical condition",
      "None reported",
      "none for now",
      "none so far",
      "all good",
      "healthy",
      "fit",
      "none that i know of",
      "  - none -  ",
      "[N/A]",
      "(nil)",
    ];

    for (const ph of placeholders) {
      const res = evaluateMedicalText(ph);
      expect(res.action, `Failed on: "${ph}"`).toBe("CLEAN_TO_NULL");
      expect(res.cleanedValue).toBeNull();
      expect(isPlaceholderMedicalText(ph)).toBe(true);
    }
  });

  it("strictly preserves short legitimate clinical terms", () => {
    const validShortTerms = [
      "Egg",
      "Nut",
      "Soy",
      "Hay",
      "Bee",
      "Cat",
      "Dog",
      "Fur",
      "MSG",
      "Kiwi",
      "Corn",
      "Milk",
      "Pork",
      "Fish",
      "Dust",
      "Latex",
      "Sulfa",
      "NSAID",
      "TB",
      "HIV",
      "UTI",
      "IBS",
      "IBD",
      "DM",
      "HTN",
      "ASD",
      "OCD",
      "ADHD",
      "GERD",
      "PCOS",
      "SCD",
      "HbSS",
      "HbAS",
      "G6PD",
      "Cold",
      "Flu",
      "Fits",
      "Rash",
      "Acne",
      "Ulcer",
      "Asthma",
      "PCM",
      "Iron",
      "Zinc",
      "Inhaler",
      "Ventolin",
    ];

    for (const term of validShortTerms) {
      const res = evaluateMedicalText(term);
      expect(res.action, `Should preserve short term: "${term}"`).toBe("PRESERVE");
      expect(res.cleanedValue).toBe(term);
      expect(isPlaceholderMedicalText(term)).toBe(false);
    }
  });

  it("strictly preserves substance specifications containing negation words", () => {
    const validSubstanceDisclosures = [
      "No peanuts",
      "No dairy",
      "no pork",
      "no beef",
      "No seafood, allergic to crab",
      "No penicillin",
      "Allergic to eggs",
      "Cannot eat gluten",
      "Avoids nuts and tree nuts",
    ];

    for (const spec of validSubstanceDisclosures) {
      const res = evaluateMedicalText(spec);
      expect(res.action, `Should preserve substance restriction: "${spec}"`).toBe("PRESERVE");
      expect(res.cleanedValue).toBe(spec);
    }
  });

  it("classifyMedical ignores placeholders in real time", () => {
    // Camper with "None" or "N/A" should have severity NONE and 0 flags
    expect(
      classifyMedical({
        allergies: "None",
        medicalConditions: "N/A",
        medications: "Nil",
        dietaryRestrictions: "No allergies",
      })
    ).toEqual({ severity: "NONE", flags: [] });

    // Camper with real short allergy "Egg" should have severity INFO and 1 flag
    expect(
      classifyMedical({
        allergies: "Egg",
        medicalConditions: "N/A",
      })
    ).toEqual({ severity: "INFO", flags: ["allergies"] });

    // Camper with severe anaphylaxis should be CRITICAL
    expect(
      classifyMedical({
        allergies: "Severe peanut anaphylaxis",
        medicalConditions: "None",
      })
    ).toEqual({ severity: "CRITICAL", flags: ["allergies"] });
  });
});
