import type { ComponentType, SVGProps } from "react";
import {
  MapPinIcon,
  CakeIcon,
  ArrowLeftOnRectangleIcon,
  IdentificationIcon,
  HeartIcon,
  BookOpenIcon,
  GiftIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { STAFF_CHECK_IN_STATION, STAFF_CHECKOUT_STATION } from "./staffPresence";

export type StationId =
  | "IDENTITY_LOOKUP"
  | "CAMP_ARRIVAL"
  | "PICKUP_POINT"
  | "HOSTEL_ARRIVAL"
  | "BREAKFAST"
  | "LUNCH"
  | "DINNER"
  | "COLLECTIBLES"
  | "CHECKOUT"
  | "EMERGENCY_LOOKUP"
  | "CUSTOM"
  | "STAFF_CHECK_IN"
  | "STAFF_CHECKOUT";

export type StatKey =
  | "SERVED"
  | "REMAINING"
  | "DUPLICATES"
  | "CHECKED_IN"
  | "EXPECTED"
  | "RELEASED"
  | "STILL_IN_CAMP"
  | "LOOKUPS_TODAY"
  | "MEDICAL_VIEWED"
  | "EMERGENCY_SCANS"
  | "CRITICAL_ALERTS"
  | "SCANS_TODAY";

export interface StationTheme {
  bg: string;
  bgStrong: string;
  fg: string;
  ring: string;
  tint: string;
}

export interface StationDef {
  id: StationId;
  name: string;
  verb: string;
  successVerb: string;
  duplicateVerb: string;
  theme: StationTheme;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  stats: StatKey[];
  customSubName?: boolean;
  allowsUndo: boolean;
  isLookup: boolean;
}

export const STATIONS: Record<StationId, StationDef> = {
  IDENTITY_LOOKUP: {
    id: "IDENTITY_LOOKUP",
    name: "Identity Lookup",
    verb: "Looking Up Identity",
    successVerb: "Identity Resolved",
    duplicateVerb: "Already Viewed",
    theme: { bg: "#475569", bgStrong: "#334155", fg: "#f8fafc", ring: "#94a3b8", tint: "rgba(71,85,105,0.12)" },
    icon: IdentificationIcon,
    stats: ["LOOKUPS_TODAY", "MEDICAL_VIEWED"],
    allowsUndo: false,
    isLookup: true,
  },
  PICKUP_POINT: {
    id: "PICKUP_POINT",
    name: "Pickup Point Check-in",
    verb: "Checking In Arrivals",
    successVerb: "Checked In",
    duplicateVerb: "Already Checked In",
    theme: { bg: "#2563eb", bgStrong: "#1d4ed8", fg: "#f8fafc", ring: "#93c5fd", tint: "rgba(37,99,235,0.12)" },
    icon: MapPinIcon,
    stats: ["CHECKED_IN", "EXPECTED", "REMAINING"],
    customSubName: true,
    allowsUndo: true,
    isLookup: false,
  },
  CAMP_ARRIVAL: {
    id: "CAMP_ARRIVAL",
    name: "Camp Arrival",
    verb: "Checking In Arrivals",
    successVerb: "Checked In",
    duplicateVerb: "Already Checked In",
    // bg darkened from the brand green (#16a34a, 3.15:1) to meet WCAG AA
    // 4.5:1 against fg — see the contrast audit in Phase 6 of the redesign.
    theme: { bg: "#15803d", bgStrong: "#166534", fg: "#f8fafc", ring: "#86efac", tint: "rgba(22,163,74,0.12)" },
    icon: MapPinIcon,
    stats: ["CHECKED_IN", "EXPECTED", "REMAINING"],
    allowsUndo: true,
    isLookup: false,
  },
  HOSTEL_ARRIVAL: {
    id: "HOSTEL_ARRIVAL",
    name: "Hostel Arrival",
    verb: "Checking In Arrivals",
    successVerb: "Checked In",
    duplicateVerb: "Already Checked In",
    theme: { bg: "#4f46e5", bgStrong: "#4338ca", fg: "#f8fafc", ring: "#a5b4fc", tint: "rgba(79,70,229,0.12)" },
    icon: MapPinIcon,
    stats: ["CHECKED_IN", "EXPECTED", "REMAINING"],
    allowsUndo: true,
    isLookup: false,
  },
  BREAKFAST: {
    id: "BREAKFAST",
    name: "Breakfast Station",
    verb: "Serving Breakfast",
    successVerb: "Breakfast Recorded",
    duplicateVerb: "Already Collected Breakfast",
    // bg darkened from #ea580c (3.35:1) to meet WCAG AA 4.5:1.
    theme: { bg: "#c2410c", bgStrong: "#9a3412", fg: "#fff7ed", ring: "#fdba74", tint: "rgba(234,88,12,0.12)" },
    icon: CakeIcon,
    stats: ["SERVED", "REMAINING", "DUPLICATES"],
    allowsUndo: false,
    isLookup: false,
  },
  LUNCH: {
    id: "LUNCH",
    name: "Lunch Station",
    verb: "Serving Lunch",
    successVerb: "Lunch Recorded",
    duplicateVerb: "Already Collected Lunch",
    // bg darkened from #d97706 (3.07:1) to meet WCAG AA 4.5:1.
    theme: { bg: "#b45309", bgStrong: "#92400e", fg: "#fffbeb", ring: "#fcd34d", tint: "rgba(217,119,6,0.12)" },
    icon: CakeIcon,
    stats: ["SERVED", "REMAINING", "DUPLICATES"],
    allowsUndo: false,
    isLookup: false,
  },
  DINNER: {
    id: "DINNER",
    name: "Dinner Station",
    verb: "Serving Dinner",
    successVerb: "Dinner Recorded",
    duplicateVerb: "Already Collected Dinner",
    theme: { bg: "#7c3aed", bgStrong: "#6d28d9", fg: "#faf5ff", ring: "#c4b5fd", tint: "rgba(124,58,237,0.12)" },
    icon: CakeIcon,
    stats: ["SERVED", "REMAINING", "DUPLICATES"],
    allowsUndo: false,
    isLookup: false,
  },
  COLLECTIBLES: {
    id: "COLLECTIBLES",
    name: "Collectibles",
    verb: "Recording Item Collection",
    successVerb: "Item Collected",
    duplicateVerb: "Already Collected",
    // teal-700 bg (5.25:1 against near-white fg) — a new color not used by
    // any other station, distinct from the meal amber/orange family since
    // collectibles are explicitly NOT a meal.
    theme: { bg: "#0f766e", bgStrong: "#115e59", fg: "#f0fdfa", ring: "#5eead4", tint: "rgba(15,118,110,0.12)" },
    icon: GiftIcon,
    stats: ["SCANS_TODAY"],
    customSubName: true,
    allowsUndo: true,
    isLookup: false,
  },
  CHECKOUT: {
    id: "CHECKOUT",
    name: "Checkout Desk",
    verb: "Processing Checkout",
    successVerb: "Checked Out",
    duplicateVerb: "Already Checked Out",
    // bg darkened from #dc2626 (4.41:1) to comfortably clear WCAG AA 4.5:1.
    theme: { bg: "#b91c1c", bgStrong: "#991b1b", fg: "#fef2f2", ring: "#fca5a5", tint: "rgba(220,38,38,0.12)" },
    icon: ArrowLeftOnRectangleIcon,
    stats: ["RELEASED", "STILL_IN_CAMP"],
    allowsUndo: false,
    isLookup: false,
  },
  EMERGENCY_LOOKUP: {
    id: "EMERGENCY_LOOKUP",
    name: "Emergency Lookup",
    verb: "Emergency Lookup",
    successVerb: "Emergency Info Shown",
    duplicateVerb: "Already Viewed",
    theme: { bg: "#9f1239", bgStrong: "#881337", fg: "#fff1f2", ring: "#fda4af", tint: "rgba(159,18,57,0.12)" },
    icon: HeartIcon,
    stats: ["EMERGENCY_SCANS", "CRITICAL_ALERTS"],
    allowsUndo: false,
    isLookup: true,
  },
  CUSTOM: {
    id: "CUSTOM",
    name: "Custom Checkpoint",
    verb: "Recording Attendance",
    successVerb: "Recorded",
    duplicateVerb: "Already Recorded",
    theme: { bg: "#475569", bgStrong: "#334155", fg: "#f8fafc", ring: "#94a3b8", tint: "rgba(71,85,105,0.12)" },
    icon: BookOpenIcon,
    stats: ["SCANS_TODAY"],
    customSubName: true,
    allowsUndo: true,
    isLookup: false,
  },
  STAFF_CHECK_IN: {
    id: "STAFF_CHECK_IN",
    name: STAFF_CHECK_IN_STATION,
    verb: "Checking In Staff",
    successVerb: "Checked In",
    duplicateVerb: "Already Checked In",
    theme: { bg: "#0369a1", bgStrong: "#075985", fg: "#f0f9ff", ring: "#7dd3fc", tint: "rgba(3,105,161,0.12)" },
    icon: UserGroupIcon,
    stats: ["SCANS_TODAY"],
    allowsUndo: false,
    isLookup: false,
  },
  STAFF_CHECKOUT: {
    id: "STAFF_CHECKOUT",
    name: STAFF_CHECKOUT_STATION,
    verb: "Checking Out Staff",
    successVerb: "Checked Out",
    duplicateVerb: "Already Checked Out",
    theme: { bg: "#a16207", bgStrong: "#854d0e", fg: "#fefce8", ring: "#fde047", tint: "rgba(161,98,7,0.12)" },
    icon: UserGroupIcon,
    stats: ["SCANS_TODAY"],
    allowsUndo: false,
    isLookup: false,
  },
};

/** Identity Lookup first — it is the safe, read-only default; the sheet
 * marks it "Safe mode · read-only" so returning to it is a deliberate act. */
export const STATION_ORDER: StationId[] = [
  "IDENTITY_LOOKUP",
  "PICKUP_POINT",
  "CAMP_ARRIVAL",
  "HOSTEL_ARRIVAL",
  "BREAKFAST",
  "LUNCH",
  "DINNER",
  "COLLECTIBLES",
  "CHECKOUT",
  "EMERGENCY_LOOKUP",
  "CUSTOM",
  "STAFF_CHECK_IN",
  "STAFF_CHECKOUT",
];

export const DEFAULT_STATION: StationId = "IDENTITY_LOOKUP";

/** Reproduces ScanCenterShell's existing label strings exactly, so the wire
 * format sent to the scan router (and its substring-based classifier) is
 * unchanged by this redesign. */
export function getStationLabel(id: StationId, subName?: string): string {
  if (id === "PICKUP_POINT") return subName || "Pickup Point";
  if (id === "CUSTOM") return subName || "Custom Station";
  if (id === "COLLECTIBLES") return subName || "Collectibles";
  return STATIONS[id].name;
}

/**
 * Resolves which station a scanner session starts in. Identity Lookup is
 * the only read-only mode, so it is the fallback whenever neither an
 * in-session pick nor an explicit route default apply — an unattended or
 * freshly-launched device must never be pre-armed to write meal, arrival,
 * or checkout records. Precedence: in-session pick > route default > safe
 * fallback.
 */
export function resolveInitialStation(opts: {
  routeDefault?: StationId | null;
  sessionPick?: StationId | null;
}): StationId {
  return opts.sessionPick ?? opts.routeDefault ?? DEFAULT_STATION;
}
