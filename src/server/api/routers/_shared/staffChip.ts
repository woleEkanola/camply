import type { Prisma } from "@prisma/client";

/**
 * Lean, chip-complete Prisma select for StaffProfile, shared by
 * `orgStructure.getCampDirectory` and `orgStructure.searchDirectory` so a
 * search result can open the profile sheet with zero additional fetch.
 *
 * Deliberately never `include: { user: true }` (unlike the old
 * getLeadershipTree/getPersonProfile) — that pulls the whole User row,
 * password hash included, for data this UI never needs.
 */
export const staffChipSelect = {
  id: true,
  firstName: true,
  lastName: true,
  preferredName: true,
  photoUrl: true,
  phone: true,
  email: true,
  type: true,
  status: true,
  gender: true,
  departmentId: true,
  isDepartmentHead: true,
  isAssistantHead: true,
  isCampMonitor: true,
  isAssistantMonitor: true,
  department: { select: { id: true, name: true } },
  // NOTE: this is StaffProfile.preferredCampus — a signup-time PREFERENCE,
  // not a confirmed campus assignment. There is no assigned-campus concept
  // on StaffProfile today (the operational equivalent is assignedVenue).
  // Labelled plainly "Campus" in the UI as a deliberate simplification.
  preferredCampus: { select: { id: true, name: true } },
  assignedTribe: { select: { id: true, name: true } },
  assignedHostel: { select: { id: true, name: true } },
  reportsTo: { select: { firstName: true, lastName: true } },
  reportsToUser: { select: { firstName: true, lastName: true, email: true } },
  positionAssignments: {
    where: { isCurrent: true },
    select: { position: { select: { id: true, name: true, displayOrder: true } } },
    orderBy: { startDate: "desc" },
    take: 3,
  },
} satisfies Prisma.StaffProfileSelect;

export type StaffChipRow = Prisma.StaffProfileGetPayload<{ select: typeof staffChipSelect }>;

export interface StaffChip {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  displayName: string;
  photoUrl: string | null;
  phone: string;
  email: string;
  type: "TEACHER" | "VOLUNTEER";
  status: string;
  gender: string | null;
  departmentId: string | null;
  departmentName: string | null;
  campusId: string | null;
  campusName: string | null;
  tribeName: string | null;
  hostelName: string | null;
  reportsToName: string | null;
  positionTitle: string | null;
  positionTitles: string[];
  isDepartmentHead: boolean;
  isAssistantHead: boolean;
  /** 0 = head, 1 = assistant head (and not head), 2 = member — for sorting within a department group. */
  roleRank: 0 | 1 | 2;
}

/** Shape returned per-department by `orgStructure.getCampDirectory`. */
export interface DepartmentGroup {
  id: string;
  name: string;
  description: string | null;
  status: string;
  maxCapacity: number | null;
  responsibilities: string[];
  heads: StaffChip[];
  assistantHeads: StaffChip[];
  members: StaffChip[];
  memberCount: number;
  approvedCount: number;
  signedUpCount: number;
  volunteerCount: number;
}

export interface CampDirectoryResult {
  departments: DepartmentGroup[];
  unassigned: StaffChip[];
  totalStaff: number;
  generatedAt: Date;
}

export function toStaffChip(row: StaffChipRow): StaffChip {
  const positionTitles = row.positionAssignments
    .map((a) => a.position.name)
    .filter((name): name is string => !!name);

  const roleRank: 0 | 1 | 2 = row.isDepartmentHead ? 0 : row.isAssistantHead ? 1 : 2;

  const reportsToName = row.reportsTo
    ? `${row.reportsTo.firstName} ${row.reportsTo.lastName}`
    : row.reportsToUser
      ? `${row.reportsToUser.firstName ?? ""} ${row.reportsToUser.lastName ?? ""}`.trim() || row.reportsToUser.email
      : null;

  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    preferredName: row.preferredName,
    displayName: `${row.preferredName || row.firstName} ${row.lastName}`.trim(),
    photoUrl: row.photoUrl,
    phone: row.phone,
    email: row.email,
    type: row.type,
    status: row.status,
    gender: row.gender,
    departmentId: row.departmentId,
    departmentName: row.department?.name ?? null,
    campusId: row.preferredCampus?.id ?? null,
    campusName: row.preferredCampus?.name ?? null,
    tribeName: row.assignedTribe?.name ?? null,
    hostelName: row.assignedHostel?.name ?? null,
    reportsToName,
    positionTitle: positionTitles[0] ?? null,
    positionTitles,
    isDepartmentHead: row.isDepartmentHead,
    isAssistantHead: row.isAssistantHead,
    roleRank,
  };
}
