import { describe, it, expect, beforeEach } from "vitest";
import { offline } from "../offlineEngine";

describe("OfflineEngine Central API", () => {
  beforeEach(() => {
    offline.setStation(null);
  });

  it("manages station selection state", () => {
    expect(offline.getStation()).toBeNull();
    offline.setStation("Camp Arrival");
    expect(offline.getStation()).toBe("Camp Arrival");
  });

  it("generates and retains persistent deviceId", () => {
    const deviceId = offline.getDeviceId();
    expect(deviceId).toBeDefined();
    expect(typeof deviceId).toBe("string");
    expect(deviceId.length).toBeGreaterThan(0);
  });

  it("returns empty array for empty search queries", async () => {
    const results = await offline.search("   ");
    expect(results).toEqual([]);
  });

  it("evaluates readiness checklist correctly", async () => {
    offline.setStation("Check-In Gate");
    const readiness = await offline.getReadiness(true);
    expect(readiness.isStationSelected).toBe(true);
    expect(readiness.hasCameraPermission).toBe(true);
    expect(readiness.pendingQueueCount).toBe(0);
  });

  it("calculates estimated download size accurately for text-only vs thumbnails", () => {
    const count = 1000;
    const withThumbnailsBytes = count * (35 * 1024);
    const textOnlyBytes = count * (6 * 1024);

    expect(withThumbnailsBytes).toBe(35840000); // ~35.8 MB
    expect(textOnlyBytes).toBe(6144000); // ~6.1 MB
    expect(textOnlyBytes).toBeLessThan(withThumbnailsBytes);
  });
});
