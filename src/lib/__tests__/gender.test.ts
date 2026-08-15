import { describe, expect, it } from "vitest";
import { gendersMatch, normalizeGender } from "../gender";

describe("gender normalization", () => {
  it("canonicalizes supported casing and spacing", () => {
    expect(normalizeGender(" Male ")).toBe("MALE");
    expect(normalizeGender("female")).toBe("FEMALE");
    expect(normalizeGender("unknown")).toBeNull();
  });

  it("matches legacy values without weakening the gender boundary", () => {
    expect(gendersMatch("Male", "MALE")).toBe(true);
    expect(gendersMatch("Female", "MALE")).toBe(false);
  });
});
