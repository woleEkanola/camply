/**
 * Canonical station-label constants for staff presence tracking.
 *
 * `scan.processStaffScan` persists only the free-text `station` label on
 * `StaffScanEvent` — never a `stationId` enum — so any reader that wants to
 * know "is this staff member on site" has no choice but to match on this
 * string. `src/lib/stations.ts` imports these constants for
 * `STATIONS.STAFF_CHECK_IN.name` / `STATIONS.STAFF_CHECKOUT.name` (rather
 * than the other way around) so the two can never drift — renaming a
 * station here is the only way to rename it anywhere, and a vitest ties the
 * two together.
 */
export const STAFF_CHECK_IN_STATION = "Staff Check-In";
export const STAFF_CHECKOUT_STATION = "Staff Checkout";
export const STAFF_PRESENCE_STATIONS = [STAFF_CHECK_IN_STATION, STAFF_CHECKOUT_STATION] as const;
