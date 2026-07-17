import { describe, expect, it } from "vitest";
import { toLocalNigerianDigits, isCompleteNigerianPhone, normalizeNigerianPhone } from "../phone";

describe("toLocalNigerianDigits", () => {
  it("passes through an already-correct 11-digit local number", () => {
    expect(toLocalNigerianDigits("08020996939")).toBe("08020996939");
  });

  it("strips the +234 country code and restores the leading 0", () => {
    expect(toLocalNigerianDigits("+2348020996939")).toBe("08020996939");
  });

  it("strips a bare 234 country code prefix", () => {
    expect(toLocalNigerianDigits("2348020996939")).toBe("08020996939");
  });

  it("restores a missing leading 0 on a bare 10-digit number", () => {
    expect(toLocalNigerianDigits("8020996939")).toBe("08020996939");
  });

  it("strips non-digit formatting (spaces, dashes)", () => {
    expect(toLocalNigerianDigits("0802 099 6939")).toBe("08020996939");
    expect(toLocalNigerianDigits("0802-099-6939")).toBe("08020996939");
  });

  it("returns partial digits as-is while still typing", () => {
    expect(toLocalNigerianDigits("080")).toBe("080");
    expect(toLocalNigerianDigits("")).toBe("");
  });

  it("truncates a garbage-long paste to 11 digits", () => {
    expect(toLocalNigerianDigits("080209969391234567")).toBe("08020996939");
  });
});

describe("isCompleteNigerianPhone", () => {
  it("is true for a complete 11-digit local number", () => {
    expect(isCompleteNigerianPhone("08020996939")).toBe(true);
  });

  it("is true for an already-normalized +234 number", () => {
    expect(isCompleteNigerianPhone("+2348020996939")).toBe(true);
  });

  it("is false for a single leading digit (the reported bug: '0' was accepted as complete)", () => {
    expect(isCompleteNigerianPhone("0")).toBe(false);
  });

  it("is false for an empty string", () => {
    expect(isCompleteNigerianPhone("")).toBe(false);
  });

  it("is false for a number one digit short", () => {
    expect(isCompleteNigerianPhone("0802099693")).toBe(false);
  });
});

describe("normalizeNigerianPhone", () => {
  it("converts a complete local number to +234 form for storage", () => {
    expect(normalizeNigerianPhone("08020996939")).toBe("+2348020996939");
  });

  it("leaves an incomplete number as the partial local digits, not a malformed +234 string", () => {
    expect(normalizeNigerianPhone("080209")).toBe("080209");
  });

  it("is idempotent on an already-normalized value", () => {
    expect(normalizeNigerianPhone("+2348020996939")).toBe("+2348020996939");
  });
});
