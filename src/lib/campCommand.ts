export const CAMP_COMMAND_PERMISSIONS = [
  "DASHBOARD",
  "REGISTRATIONS",
  "CAMPERS",
  "STAFF",
  "TRIBES",
  "ACCOMMODATION",
  "CAMP_STRUCTURE",
  "QR_SCANNING",
  "CAMP_POINTS",
  "LEADERBOARD",
  "REPORTS",
  "COMMUNICATION",
  "INCIDENTS_MEDICAL",
  "CAMP_SETTINGS",
] as const;

export type CampCommandPermission = (typeof CAMP_COMMAND_PERMISSIONS)[number];
export type CampCommandRole = "COMMANDANT" | "ASSISTANT_COMMANDANT";
export type CommandAccessMode = "INHERIT" | "FULL" | "CUSTOM";

export const CAMP_COMMAND_PERMISSION_LABELS: Record<CampCommandPermission, string> = {
  DASHBOARD: "Dashboard",
  REGISTRATIONS: "Registrations and approvals",
  CAMPERS: "Campers",
  STAFF: "Teachers and volunteers",
  TRIBES: "Tribes",
  ACCOMMODATION: "Accommodation and room allocation",
  CAMP_STRUCTURE: "Camp structure and assignments",
  QR_SCANNING: "QR scanning and attendance",
  CAMP_POINTS: "Camp Points",
  LEADERBOARD: "Leaderboard management",
  REPORTS: "Reports",
  COMMUNICATION: "Communication",
  INCIDENTS_MEDICAL: "Incidents and medical information",
  CAMP_SETTINGS: "Camp settings",
};

export const FULL_CAMP_COMMAND_PERMISSIONS: CampCommandPermission[] = [...CAMP_COMMAND_PERMISSIONS];

export function isCampCommandPermission(value: string): value is CampCommandPermission {
  return (CAMP_COMMAND_PERMISSIONS as readonly string[]).includes(value);
}

export function sanitizeCampCommandPermissions(values: readonly string[]): CampCommandPermission[] {
  return Array.from(new Set<CampCommandPermission>(["DASHBOARD", ...values.filter(isCampCommandPermission)]));
}

export function permissionForAdminPath(pathname: string): CampCommandPermission | null {
  if (pathname.startsWith("/admin/registrations")) return "REGISTRATIONS";
  if (pathname.startsWith("/admin/campers")) return "CAMPERS";
  if (pathname.startsWith("/admin/teachers") || pathname.startsWith("/admin/volunteers")) return "STAFF";
  if (pathname.startsWith("/admin/tribes")) return "TRIBES";
  if (pathname.startsWith("/admin/accommodation") || pathname.startsWith("/admin/venues")) return "ACCOMMODATION";
  if (pathname.startsWith("/admin/camp-structure") || pathname.startsWith("/admin/departments")) return "CAMP_STRUCTURE";
  if (pathname.startsWith("/admin/qr-scan")) return "QR_SCANNING";
  if (pathname.startsWith("/admin/points")) return "CAMP_POINTS";
  if (pathname.startsWith("/leaderboard")) return "LEADERBOARD";
  if (pathname.startsWith("/admin/reports")) return "REPORTS";
  if (pathname.startsWith("/admin/communication")) return "COMMUNICATION";
  if (pathname.startsWith("/admin/settings")) return "CAMP_SETTINGS";
  if (
    pathname.startsWith("/admin/users")
    || pathname.startsWith("/admin/access-control")
    || pathname.startsWith("/admin/profile-fields")
    || pathname.startsWith("/admin/import-export")
    || pathname.startsWith("/admin/trash")
    || pathname.startsWith("/admin/campuses")
    || pathname.startsWith("/admin/camps")
  ) return null;
  return "DASHBOARD";
}
