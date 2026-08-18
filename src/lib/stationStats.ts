import type { StatKey, StationId } from "./stations";

export interface OperationalStats {
  registered: number;
  checkedIn: number;
  pendingArrival: number;
  breakfastCount: number;
  lunchCount: number;
  dinnerCount: number;
  checkedOutCount: number;
}

/** Session-local counters this device has observed, used to fill in the
 * stats the server doesn't track yet (duplicates, lookups) and to give an
 * instant response before the next getOperationalStats refetch. */
export interface SessionScanStats {
  duplicates: number;
  lookups: number;
  medicalViewed: number;
  emergencyScans: number;
  criticalAlerts: number;
  scansToday: number;
}

export const EMPTY_SESSION_STATS: SessionScanStats = {
  duplicates: 0,
  lookups: 0,
  medicalViewed: 0,
  emergencyScans: 0,
  criticalAlerts: 0,
  scansToday: 0,
};

export interface StatTile {
  key: StatKey;
  label: string;
  value: number;
}

const LABELS: Record<StatKey, string> = {
  SERVED: "Served",
  REMAINING: "Remaining",
  DUPLICATES: "Duplicate Attempts",
  CHECKED_IN: "Checked In",
  BOARDED: "Boarded Bus",
  EXPECTED: "Expected",
  RELEASED: "Released",
  STILL_IN_CAMP: "Still In Camp",
  LOOKUPS_TODAY: "Lookups Today",
  MEDICAL_VIEWED: "Medical Alerts Viewed",
  EMERGENCY_SCANS: "Emergency Scans Today",
  CRITICAL_ALERTS: "Critical Alerts",
  SCANS_TODAY: "Scans Today",
};

/**
 * Derives the tiles a given station should show from the shared operational
 * stats query plus this device's session-local counters. Each station shows
 * only what's relevant to its own workflow — a kitchen volunteer needs
 * "Remaining" (checkedIn - served), not "Total Registered".
 */
export function computeStationStats(
  stationId: StationId,
  statKeys: StatKey[],
  ops: OperationalStats | undefined,
  session: SessionScanStats
): StatTile[] {
  const mealCountFor = (id: StationId): number => {
    if (!ops) return 0;
    if (id === "BREAKFAST") return ops.breakfastCount;
    if (id === "LUNCH") return ops.lunchCount;
    if (id === "DINNER") return ops.dinnerCount;
    return 0;
  };

  const values: Record<StatKey, number> = {
    SERVED: mealCountFor(stationId),
    REMAINING: ops ? Math.max(0, ops.checkedIn - mealCountFor(stationId)) : 0,
    DUPLICATES: session.duplicates,
    CHECKED_IN: ops?.checkedIn ?? 0,
    BOARDED: session.scansToday,
    EXPECTED: ops?.registered ?? 0,
    RELEASED: ops?.checkedOutCount ?? 0,
    STILL_IN_CAMP: ops ? Math.max(0, ops.checkedIn - ops.checkedOutCount) : 0,
    LOOKUPS_TODAY: session.lookups,
    MEDICAL_VIEWED: session.medicalViewed,
    EMERGENCY_SCANS: session.emergencyScans,
    CRITICAL_ALERTS: session.criticalAlerts,
    SCANS_TODAY: session.scansToday,
  };

  return statKeys.map((key) => ({ key, label: LABELS[key], value: values[key] }));
}

/** Completion ring percentage for stations that have a meaningful progress
 * concept (meals: served/checkedIn, arrivals: checkedIn/registered,
 * checkout: checkedOut/checkedIn). Returns null when not applicable. */
export function computeStationProgress(stationId: StationId, ops: OperationalStats | undefined): number | null {
  if (!ops) return null;
  if (stationId === "BREAKFAST" || stationId === "LUNCH" || stationId === "DINNER") {
    const served = stationId === "BREAKFAST" ? ops.breakfastCount : stationId === "LUNCH" ? ops.lunchCount : ops.dinnerCount;
    return ops.checkedIn > 0 ? Math.min(100, Math.round((served / ops.checkedIn) * 100)) : 0;
  }
  if (stationId === "CAMP_ARRIVAL" || stationId === "PICKUP_POINT" || stationId === "HOSTEL_ARRIVAL") {
    return ops.registered > 0 ? Math.min(100, Math.round((ops.checkedIn / ops.registered) * 100)) : 0;
  }
  if (stationId === "CHECKOUT") {
    return ops.checkedIn > 0 ? Math.min(100, Math.round((ops.checkedOutCount / ops.checkedIn) * 100)) : 0;
  }
  return null;
}
