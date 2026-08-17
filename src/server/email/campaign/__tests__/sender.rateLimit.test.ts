import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __testing__ } from "../sender";

const { applyRateHeaders, getRequestSpacingMs, resetRequestSpacingMs, BASELINE_REQUEST_SPACING_MS } = __testing__;

describe("sender rate-limit spacing decay", () => {
  beforeEach(() => {
    resetRequestSpacingMs();
  });
  afterEach(() => {
    resetRequestSpacingMs();
  });

  it("starts at the baseline spacing", () => {
    expect(getRequestSpacingMs()).toBe(BASELINE_REQUEST_SPACING_MS);
  });

  it("tightens spacing when a low ratelimit-limit header is observed", () => {
    applyRateHeaders({ "ratelimit-limit": "2" });
    expect(getRequestSpacingMs()).toBe(500);
  });

  it("decays spacing back down once a healthier header arrives, instead of only ever ratcheting up", () => {
    applyRateHeaders({ "ratelimit-limit": "1" });
    expect(getRequestSpacingMs()).toBe(1000);

    applyRateHeaders({ "ratelimit-limit": "10" });
    expect(getRequestSpacingMs()).toBe(BASELINE_REQUEST_SPACING_MS);
  });

  it("never decays below the configured baseline even for a very high limit", () => {
    applyRateHeaders({ "ratelimit-limit": "1000" });
    expect(getRequestSpacingMs()).toBe(BASELINE_REQUEST_SPACING_MS);
  });

  it("ignores missing or non-numeric headers", () => {
    applyRateHeaders(null);
    expect(getRequestSpacingMs()).toBe(BASELINE_REQUEST_SPACING_MS);

    applyRateHeaders({ "some-other-header": "x" });
    expect(getRequestSpacingMs()).toBe(BASELINE_REQUEST_SPACING_MS);
  });
});
