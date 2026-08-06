import { describe, expect, it } from "vitest";
import { STAFF_CHECK_IN_STATION, STAFF_CHECKOUT_STATION, STAFF_PRESENCE_STATIONS } from "../staffPresence";
import { STATIONS } from "../stations";

describe("staff presence station-label tie", () => {
  it("keeps STATIONS.STAFF_CHECK_IN.name in sync with the presence constant", () => {
    expect(STATIONS.STAFF_CHECK_IN.name).toBe(STAFF_CHECK_IN_STATION);
  });

  it("keeps STATIONS.STAFF_CHECKOUT.name in sync with the presence constant", () => {
    expect(STATIONS.STAFF_CHECKOUT.name).toBe(STAFF_CHECKOUT_STATION);
  });

  it("lists both presence stations", () => {
    expect(STAFF_PRESENCE_STATIONS).toEqual([STAFF_CHECK_IN_STATION, STAFF_CHECKOUT_STATION]);
  });
});
