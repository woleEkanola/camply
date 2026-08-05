import type { Prisma } from "@prisma/client";
import type { StaffIdCardData } from "./renderStaffCard";

// Sibling of ID_CARD_INCLUDE (./data.ts), scoped to what the staff card needs.
export const STAFF_ID_CARD_INCLUDE = {
  camp: {
    select: {
      name: true,
      year: true,
      logoUrl: true,
      organization: { select: { branding: { select: { logoUrl: true } } } },
    },
  },
  preferredCampus: { select: { name: true } },
  department: { select: { name: true } },
  assignedTribe: { select: { name: true } },
} satisfies Prisma.StaffProfileInclude;

export type StaffProfileForIdCard = Prisma.StaffProfileGetPayload<{
  include: typeof STAFF_ID_CARD_INCLUDE;
}>;

/**
 * Builds the staff ID card data from a StaffProfile, or null if the card
 * can't be rendered yet — not APPROVED, or no qrToken issued.
 *
 * Deliberately has NO tribe requirement, unlike buildCampIdCardData for
 * campers — many teachers and all volunteers have no tribe assignment at
 * all, and the staff card's colour band shows role, not tribe.
 */
export function buildStaffIdCardData(profile: StaffProfileForIdCard): StaffIdCardData | null {
  if (profile.status !== "APPROVED" || !profile.qrToken) return null;

  const name = `${profile.preferredName || profile.firstName} ${profile.lastName}`.trim();

  const tribeLine = profile.assignedTribe
    ? profile.assignedTribe.name + (profile.isCampMonitor ? " · Camp Monitor" : profile.isAssistantMonitor ? " · Asst. Monitor" : "")
    : null;

  const departmentLine = profile.department
    ? profile.department.name + (profile.isDepartmentHead ? " · Head" : profile.isAssistantHead ? " · Asst. Head" : "")
    : profile.volunteerCategory || null;

  return {
    staffName: name,
    roleLabel: profile.type === "TEACHER" ? "TEACHER" : "VOLUNTEER",
    campusName: profile.preferredCampus?.name ?? "—",
    gender: profile.gender,
    departmentLine,
    tribeLine,
    campName: profile.camp.name,
    campYear: String(profile.camp.year),
    logoUrl: profile.camp.logoUrl ?? profile.camp.organization?.branding?.logoUrl ?? null,
    qrToken: profile.qrToken,
  };
}
