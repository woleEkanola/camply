import { describe, expect, it } from "vitest";
import { evaluateRule } from "../rules";

const punctualityTiers = [
  { maxMinutesLate: 0, points: 10 },
  { maxMinutesLate: 5, points: 6 },
  { maxMinutesLate: 10, points: 3 },
  { maxMinutesLate: null, points: 0 },
];

describe("evaluateRule — tier ladder", () => {
  it("awards the top tier for on-time arrival", () => {
    expect(evaluateRule({ points: 0, tiers: punctualityTiers }, { minutesLate: 0 })).toBe(10);
  });

  it("awards a middle tier within its band", () => {
    expect(evaluateRule({ points: 0, tiers: punctualityTiers }, { minutesLate: 3 })).toBe(6);
    expect(evaluateRule({ points: 0, tiers: punctualityTiers }, { minutesLate: 5 })).toBe(6);
  });

  it("awards the last finite tier at its boundary", () => {
    expect(evaluateRule({ points: 0, tiers: punctualityTiers }, { minutesLate: 10 })).toBe(3);
  });

  it("falls through to the null catch-all tier for any later arrival", () => {
    expect(evaluateRule({ points: 0, tiers: punctualityTiers }, { minutesLate: 999 })).toBe(0);
  });

  it("negative minutesLate (early arrival) still hits the earliest tier", () => {
    expect(evaluateRule({ points: 0, tiers: punctualityTiers }, { minutesLate: -15 })).toBe(10);
  });

  it("falls through to zero when no catch-all tier exists and arrival is later than every cutoff", () => {
    const noFallback = [{ maxMinutesLate: 0, points: 10 }];
    expect(evaluateRule({ points: 0, tiers: noFallback }, { minutesLate: 5 })).toBe(0);
  });
});

describe("evaluateRule — flat points (no tiers or no minutesLate context)", () => {
  it("uses rule.points when there are no tiers", () => {
    expect(evaluateRule({ points: 15 }, { minutesLate: 3 })).toBe(15);
  });

  it("uses rule.points when tiers exist but ctx has no minutesLate", () => {
    expect(evaluateRule({ points: 15, tiers: punctualityTiers })).toBe(15);
  });
});

describe("evaluateRule — multiplier and clamps", () => {
  it("applies and rounds the multiplier", () => {
    expect(evaluateRule({ points: 10, multiplier: 1.5 })).toBe(15);
    expect(evaluateRule({ points: 10, multiplier: 1.33 })).toBe(13); // rounds, doesn't truncate
  });

  it("clamps to maxPoints", () => {
    expect(evaluateRule({ points: 10, multiplier: 3, maxPoints: 20 })).toBe(20);
  });

  it("clamps to minPoints (e.g. a penalty rule that shouldn't go below a floor)", () => {
    expect(evaluateRule({ points: -50, minPoints: -10 })).toBe(-10);
  });

  it("clamp order doesn't fight itself when min > actual and max is also set", () => {
    expect(evaluateRule({ points: 0, minPoints: 5, maxPoints: 20 })).toBe(5);
  });
});

describe("evaluateRule — malformed tiers never throw", () => {
  it("falls back to flat points when tiers is not an array", () => {
    expect(evaluateRule({ points: 7, tiers: "not-an-array" }, { minutesLate: 1 })).toBe(7);
  });

  it("falls back to flat points when tiers is an empty array", () => {
    expect(evaluateRule({ points: 7, tiers: [] }, { minutesLate: 1 })).toBe(7);
  });

  it("falls back to flat points when a tier entry is missing points", () => {
    expect(evaluateRule({ points: 7, tiers: [{ maxMinutesLate: 0 }] }, { minutesLate: 1 })).toBe(7);
  });

  it("falls back to flat points when a tier's maxMinutesLate is a non-numeric, non-null value", () => {
    expect(evaluateRule({ points: 7, tiers: [{ maxMinutesLate: "soon", points: 10 }] }, { minutesLate: 1 })).toBe(7);
  });

  it("falls back to flat points when tiers is null/undefined", () => {
    expect(evaluateRule({ points: 7, tiers: null }, { minutesLate: 1 })).toBe(7);
    expect(evaluateRule({ points: 7 }, { minutesLate: 1 })).toBe(7);
  });
});
