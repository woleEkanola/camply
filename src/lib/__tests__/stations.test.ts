import { describe, expect, it } from "vitest";
import { getStationLabel, resolveInitialStation, DEFAULT_STATION, STATIONS, STATION_ORDER } from "../stations";

describe("getStationLabel", () => {
  it("returns the preset name for a standard station", () => {
    expect(getStationLabel("BREAKFAST")).toBe("Breakfast Station");
    expect(getStationLabel("CAMP_ARRIVAL")).toBe("Camp Arrival");
    expect(getStationLabel("CHECKOUT")).toBe("Checkout Desk");
  });

  it("uses the custom sub-name for PICKUP_POINT when provided, else a fallback", () => {
    expect(getStationLabel("PICKUP_POINT", "Lekki Pickup Point")).toBe("Lekki Pickup Point");
    expect(getStationLabel("PICKUP_POINT")).toBe("Pickup Point");
  });

  it("uses the custom sub-name for CUSTOM when provided, else a fallback", () => {
    expect(getStationLabel("CUSTOM", "Bible Study")).toBe("Bible Study");
    expect(getStationLabel("CUSTOM")).toBe("Custom Station");
  });
});

describe("resolveInitialStation", () => {
  it("prefers an in-session pick over everything else", () => {
    expect(resolveInitialStation({ routeDefault: "BREAKFAST", sessionPick: "LUNCH" })).toBe("LUNCH");
  });

  it("falls back to the route default when there is no session pick", () => {
    expect(resolveInitialStation({ routeDefault: "CAMP_ARRIVAL", sessionPick: null })).toBe("CAMP_ARRIVAL");
  });

  it("falls back to Identity Lookup when neither a session pick nor a route default exist", () => {
    expect(resolveInitialStation({})).toBe(DEFAULT_STATION);
    expect(resolveInitialStation({ routeDefault: null, sessionPick: null })).toBe("IDENTITY_LOOKUP");
  });
});

describe("station registry", () => {
  it("lists Identity Lookup first as the safe default", () => {
    expect(STATION_ORDER[0]).toBe("IDENTITY_LOOKUP");
  });

  it("marks only lookup stations as non-mutating/isLookup", () => {
    expect(STATIONS.IDENTITY_LOOKUP.isLookup).toBe(true);
    expect(STATIONS.EMERGENCY_LOOKUP.isLookup).toBe(true);
    expect(STATIONS.BREAKFAST.isLookup).toBe(false);
    expect(STATIONS.CHECKOUT.isLookup).toBe(false);
  });

  it("disallows undo for checkout and lookup stations", () => {
    expect(STATIONS.CHECKOUT.allowsUndo).toBe(false);
    expect(STATIONS.IDENTITY_LOOKUP.allowsUndo).toBe(false);
    expect(STATIONS.EMERGENCY_LOOKUP.allowsUndo).toBe(false);
    expect(STATIONS.CAMP_ARRIVAL.allowsUndo).toBe(true);
  });
});
