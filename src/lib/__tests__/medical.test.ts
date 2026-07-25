import { describe, expect, it } from "vitest";
import { classifyMedical } from "../medical";

describe("classifyMedical", () => {
  it("returns NONE when no medical fields are set", () => {
    expect(classifyMedical({})).toEqual({ severity: "NONE", flags: [] });
    expect(
      classifyMedical({ allergies: "", medicalConditions: null, medications: undefined, dietaryRestrictions: "" })
    ).toEqual({ severity: "NONE", flags: [] });
  });

  it("classifies routine allergy/dietary notes as INFO, not CRITICAL", () => {
    const result = classifyMedical({ allergies: "Peanuts", dietaryRestrictions: "No pork" });
    expect(result.severity).toBe("INFO");
    expect(result.flags).toEqual(["allergies", "dietaryRestrictions"]);
  });

  it("classifies anaphylaxis as CRITICAL", () => {
    expect(classifyMedical({ allergies: "Severe peanut anaphylaxis" }).severity).toBe("CRITICAL");
  });

  it("classifies 'do not release' notes as CRITICAL", () => {
    expect(classifyMedical({ medicalConditions: "Do not release without parent present" }).severity).toBe("CRITICAL");
  });

  it("classifies isolation/medical hold as CRITICAL", () => {
    expect(classifyMedical({ medicalConditions: "Requires isolation" }).severity).toBe("CRITICAL");
    expect(classifyMedical({ medicalConditions: "Under medical hold" }).severity).toBe("CRITICAL");
  });

  it("classifies epilepsy and insulin dependency as CRITICAL", () => {
    expect(classifyMedical({ medicalConditions: "Epileptic, prone to seizures" }).severity).toBe("CRITICAL");
    expect(classifyMedical({ medications: "Insulin-dependent, daily injection" }).severity).toBe("CRITICAL");
  });

  it("is case-insensitive", () => {
    expect(classifyMedical({ allergies: "SEVERE ANAPHYLAXIS RISK" }).severity).toBe("CRITICAL");
  });
});
