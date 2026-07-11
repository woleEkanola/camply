import { prisma } from "../db";
import type { Prisma } from "@prisma/client";

export type TrashEntityType =
  | "campus"
  | "venue"
  | "camp"
  | "camper"
  | "registration"
  | "staffProfile"
  | "tribe"
  | "department"
  | "hostel"
  | "room"
  | "bed"
  | "formField"
  | "document"
  | "documentRequirement"
  | "user";

interface TrashEntry {
  /** Human label for the Trash page. */
  displayName: string;
  /** Scopes a findMany to the caller's org — some are direct fields, most nested relations. */
  orgWhere: (organizationId: string) => Record<string, unknown>;
  /** Extra `include` needed to build a readable label. */
  include?: Record<string, unknown>;
  /** Builds a one-line label for the Trash table from a row (shaped per `include` above). */
  label: (row: any) => string;
  delegate: () => { findMany: Function; findFirst: Function; update: Function; delete: Function };
}

export const TRASH_REGISTRY: Record<TrashEntityType, TrashEntry> = {
  campus: {
    displayName: "Campus",
    orgWhere: (organizationId) => ({ organizationId }),
    label: (row) => row.name,
    delegate: () => prisma.campus,
  },
  venue: {
    displayName: "Venue",
    orgWhere: (organizationId) => ({ camp: { organizationId } }),
    include: { camp: { select: { name: true } } },
    label: (row) => `${row.name} (${row.camp?.name ?? "unknown camp"})`,
    delegate: () => prisma.venue,
  },
  camp: {
    displayName: "Camp",
    orgWhere: (organizationId) => ({ organizationId }),
    label: (row) => row.name,
    delegate: () => prisma.camp,
  },
  camper: {
    displayName: "Camper",
    orgWhere: (organizationId) => ({ organizationId }),
    label: (row) => row.name,
    delegate: () => prisma.camper,
  },
  registration: {
    displayName: "Registration",
    orgWhere: (organizationId) => ({ camp: { organizationId } }),
    include: { camper: { select: { name: true } }, camp: { select: { name: true } } },
    label: (row) => `${row.registrationNumber ?? row.id} — ${row.camper?.name ?? "unknown camper"} (${row.camp?.name ?? "unknown camp"})`,
    delegate: () => prisma.registration,
  },
  staffProfile: {
    displayName: "Staff Profile",
    orgWhere: (organizationId) => ({ organizationId }),
    label: (row) => `${row.firstName} ${row.lastName} (${row.type})`,
    delegate: () => prisma.staffProfile,
  },
  tribe: {
    displayName: "Tribe",
    orgWhere: (organizationId) => ({ camp: { organizationId } }),
    include: { camp: { select: { name: true } } },
    label: (row) => `${row.name} (${row.camp?.name ?? "unknown camp"})`,
    delegate: () => prisma.tribe,
  },
  department: {
    displayName: "Department",
    orgWhere: (organizationId) => ({ organizationId }),
    label: (row) => row.name,
    delegate: () => prisma.department,
  },
  hostel: {
    displayName: "Hostel",
    orgWhere: (organizationId) => ({ organizationId }),
    label: (row) => row.name,
    delegate: () => prisma.hostel,
  },
  room: {
    displayName: "Room",
    orgWhere: (organizationId) => ({ hostel: { organizationId } }),
    include: { hostel: { select: { name: true } } },
    label: (row) => `${row.name} (${row.hostel?.name ?? "unknown hostel"})`,
    delegate: () => prisma.room,
  },
  bed: {
    displayName: "Bed",
    orgWhere: (organizationId) => ({ room: { hostel: { organizationId } } }),
    include: { room: { select: { name: true } } },
    label: (row) => `${row.label} (${row.room?.name ?? "unknown room"})`,
    delegate: () => prisma.bed,
  },
  formField: {
    displayName: "Form Field",
    orgWhere: (organizationId) => ({ organizationId }),
    label: (row) => `${row.label} (${row.audience})`,
    delegate: () => prisma.formField,
  },
  document: {
    displayName: "Document",
    orgWhere: (organizationId) => ({
      OR: [{ camper: { organizationId } }, { registration: { camp: { organizationId } } }],
    }),
    label: (row) => row.fileName,
    delegate: () => prisma.document,
  },
  documentRequirement: {
    displayName: "Document Requirement",
    orgWhere: (organizationId) => ({ camp: { organizationId } }),
    include: { camp: { select: { name: true } } },
    label: (row) => `${row.name} (${row.camp?.name ?? "unknown camp"})`,
    delegate: () => prisma.documentRequirement,
  },
  user: {
    displayName: "User",
    orgWhere: (organizationId) => ({ organizationId }),
    label: (row) => `${row.firstName ?? ""} ${row.lastName ?? ""} (${row.email})`.trim(),
    delegate: () => prisma.user,
  },
};

/** Hard-delete order: children before parents, best-effort (skips rows still
 * blocked by a remaining live FK reference rather than aborting the whole sweep). */
export const PURGE_ORDER: TrashEntityType[] = [
  "document",
  "bed",
  "registration",
  "room",
  "hostel",
  "staffProfile",
  "venue",
  "tribe",
  "department",
  "documentRequirement",
  "camper",
  "camp",
  "campus",
  "user",
];
