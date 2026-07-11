import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../db";
import { logEvent } from "../audit";
import { calculateAge } from "../registration/validation";

type TxClient = PrismaClient | Prisma.TransactionClient;

export class BedAllocationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "BedAllocationError";
    this.code = code;
  }
}

type Criterion = "AGE_GROUP" | "GROUP_TOGETHER" | "CAMPUS_TOGETHER" | "POPULATION_BALANCE";

interface Rule {
  criterion: Criterion;
  enabled: boolean;
}

const DEFAULT_RULES: Rule[] = [
  { criterion: "AGE_GROUP", enabled: true },
  { criterion: "GROUP_TOGETHER", enabled: true },
  { criterion: "POPULATION_BALANCE", enabled: true },
  { criterion: "CAMPUS_TOGETHER", enabled: false },
];

function ageGroup(dateOfBirth: Date | null, cutoff: Date): string {
  if (!dateOfBirth) return "unknown";
  const age = calculateAge(dateOfBirth, cutoff);
  if (age <= 12) return "10-12";
  if (age <= 15) return "13-15";
  if (age <= 18) return "16-18";
  return "19+";
}

/** Unifies Camper (Registration) and Staff (StaffProfile) occupants behind one shape so scoring is population-agnostic. */
export type Occupant =
  | { kind: "CAMPER"; registrationId: string; gender: string | null; dateOfBirth: Date | null; groupId: string | null; campusId: string | null }
  | { kind: "STAFF"; staffProfileId: string; gender: string | null; dateOfBirth: Date | null; groupId: string | null; campusId: string | null };

function occupantKey(occupant: Occupant): string {
  return occupant.kind === "CAMPER" ? `camper:${occupant.registrationId}` : `staff:${occupant.staffProfileId}`;
}

export interface BedSuggestion {
  bedId: string;
  roomId: string;
  roomName: string;
  hostelId: string;
  hostelName: string;
  confidence: number;
  reasons: string[];
}

/**
 * Scores every AVAILABLE bed in the venue's hostels against the camp's enabled
 * bed allocation criteria and returns the best match. Gender-match to
 * Hostel.gender is always a hard filter, never a toggleable rule — a hostel
 * marked MALE/FEMALE physically cannot house the other gender, unlike the
 * soft preferences below. Pure read — never mutates anything.
 */
export async function suggestBed(tx: TxClient, venueId: string, occupant: Occupant): Promise<BedSuggestion | null> {
  const venue = await tx.venue.findUniqueOrThrow({ where: { id: venueId }, include: { camp: true } });

  const hostels = await tx.hostel.findMany({
    where: { venueId, deletedAt: null },
    include: {
      rooms: {
        where: { deletedAt: null },
        include: { beds: { where: { deletedAt: null, status: "AVAILABLE" } } },
      },
    },
  });

  // Hard gender filter — unknown occupant gender can only go to an unspecified/MIXED hostel.
  const genderEligible = hostels.filter((h) => !h.gender || h.gender === "MIXED" || h.gender === occupant.gender);

  const candidates: { bedId: string; roomId: string; roomName: string; hostelId: string; hostelName: string }[] = [];
  for (const hostel of genderEligible) {
    for (const room of hostel.rooms) {
      for (const bed of room.beds) {
        candidates.push({ bedId: bed.id, roomId: room.id, roomName: room.name, hostelId: hostel.id, hostelName: hostel.name });
      }
    }
  }
  if (candidates.length === 0) return null;

  const rules: Rule[] = Array.isArray(venue.camp.bedAllocationRules)
    ? (venue.camp.bedAllocationRules as unknown as Rule[])
    : DEFAULT_RULES;
  const enabledRules = rules.filter((r) => r.enabled);

  const cutoff = venue.camp.ageCutoffDate ?? venue.camp.startDate;
  const myAgeGroup = ageGroup(occupant.dateOfBirth, cutoff);

  const roomIds = Array.from(new Set(candidates.map((c) => c.roomId)));
  const [roomRegistrations, roomStaff] = await Promise.all([
    tx.registration.findMany({ where: { roomId: { in: roomIds }, deletedAt: null }, include: { camper: true } }),
    tx.staffProfile.findMany({ where: { assignedRoomId: { in: roomIds }, deletedAt: null } }),
  ]);

  function roomOccupants(roomId: string) {
    const campers = roomRegistrations.filter((r) => r.roomId === roomId);
    const staff = roomStaff.filter((s) => s.assignedRoomId === roomId);
    return {
      count: campers.length + staff.length,
      ages: [
        ...campers.map((r) => ageGroup(r.camper.dateOfBirth, cutoff)),
        ...staff.map((s) => ageGroup(s.dateOfBirth, cutoff)),
      ],
      groupIds: [
        ...campers.map((r) => r.tribeId),
        ...staff.map((s) => s.departmentId ?? s.assignedTribeId),
      ].filter((g): g is string => !!g),
      campusIds: [
        ...campers.map((r) => r.campusId),
        ...staff.map((s) => s.preferredCampusId),
      ].filter((c): c is string => !!c),
    };
  }

  const scored = candidates.map((candidate) => {
    let score = 0;
    const reasons: string[] = [];
    const occupants = roomOccupants(candidate.roomId);

    for (const rule of enabledRules) {
      switch (rule.criterion) {
        case "AGE_GROUP": {
          const sameAgeCount = occupants.ages.filter((a) => a === myAgeGroup).length;
          score += sameAgeCount * 10; // soft nudge toward rooms with similar ages
          if (sameAgeCount > 0) reasons.push("Similar age group in this room");
          break;
        }
        case "GROUP_TOGETHER": {
          if (occupant.groupId && occupants.groupIds.includes(occupant.groupId)) {
            score += 200;
            reasons.push("Same tribe/department already in this room");
          }
          break;
        }
        case "CAMPUS_TOGETHER": {
          if (occupant.campusId && occupants.campusIds.includes(occupant.campusId)) {
            score += 50;
            reasons.push("Same home campus already in this room");
          }
          break;
        }
        case "POPULATION_BALANCE": {
          // Favor filling an already-partially-occupied room (avoids leaving
          // singles scattered across many rooms) while still respecting the
          // hard AVAILABLE-bed / gender filters above.
          score += occupants.count > 0 ? 30 : 0;
          break;
        }
      }
    }

    return { candidate, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const worstScore = scored[scored.length - 1].score;
  const spread = best.score - worstScore || 1;
  const confidence = Math.round(Math.min(99, 50 + ((best.score - worstScore) / spread) * 49));

  return {
    bedId: best.candidate.bedId,
    roomId: best.candidate.roomId,
    roomName: best.candidate.roomName,
    hostelId: best.candidate.hostelId,
    hostelName: best.candidate.hostelName,
    confidence,
    reasons: Array.from(new Set(best.reasons)),
  };
}

export async function assignBedInTx(
  tx: Prisma.TransactionClient,
  params: { bedId: string; occupant: Occupant; actorId: string | null }
) {
  const bed = await tx.bed.findUniqueOrThrow({ where: { id: params.bedId }, include: { room: { include: { hostel: true } } } });
  const { occupant } = params;

  if (occupant.kind === "CAMPER") {
    if (bed.staffProfileId) {
      throw new BedAllocationError("BED_OCCUPIED", "This bed is occupied by a staff member.");
    }
    if (bed.registrationId && bed.registrationId !== occupant.registrationId) {
      throw new BedAllocationError("BED_OCCUPIED", "This bed is already occupied.");
    }
    // Clear any previous bed this camper occupied (one camper : one bed).
    await tx.bed.updateMany({
      where: { registrationId: occupant.registrationId, id: { not: bed.id } },
      data: { registrationId: null, status: "AVAILABLE" },
    });
    await tx.bed.update({ where: { id: bed.id }, data: { registrationId: occupant.registrationId, status: "OCCUPIED" } });
    await tx.registration.update({ where: { id: occupant.registrationId }, data: { roomId: bed.roomId } });

    await logEvent(tx, {
      organizationId: bed.room.hostel.organizationId,
      registrationId: occupant.registrationId,
      actorId: params.actorId,
      action: "BED_ASSIGNED",
      newValue: { bedId: bed.id, roomId: bed.roomId },
    });
  } else {
    if (bed.registrationId) {
      throw new BedAllocationError("BED_OCCUPIED", "This bed is occupied by a camper.");
    }
    if (bed.staffProfileId && bed.staffProfileId !== occupant.staffProfileId) {
      throw new BedAllocationError("BED_OCCUPIED", "This bed is already occupied.");
    }
    // Clear any previous bed this staff member occupied.
    await tx.bed.updateMany({
      where: { staffProfileId: occupant.staffProfileId, id: { not: bed.id } },
      data: { staffProfileId: null, status: "AVAILABLE" },
    });
    await tx.bed.update({ where: { id: bed.id }, data: { staffProfileId: occupant.staffProfileId, status: "OCCUPIED" } });
    await tx.staffProfile.update({
      where: { id: occupant.staffProfileId },
      data: { assignedRoomId: bed.roomId, assignedHostelId: bed.room.hostelId },
    });

    await logEvent(tx, {
      organizationId: bed.room.hostel.organizationId,
      actorId: params.actorId,
      action: "BED_ASSIGNED",
      newValue: { bedId: bed.id, roomId: bed.roomId, staffProfileId: occupant.staffProfileId },
    });
  }

  return bed;
}

function occupantFromRegistration(reg: { id: string; tribeId: string | null; campusId: string; camper: { gender: string | null; dateOfBirth: Date | null } }): Occupant {
  return {
    kind: "CAMPER",
    registrationId: reg.id,
    gender: reg.camper.gender,
    dateOfBirth: reg.camper.dateOfBirth,
    groupId: reg.tribeId,
    campusId: reg.campusId,
  };
}

function occupantFromStaff(staff: { id: string; gender: string | null; dateOfBirth: Date | null; departmentId: string | null; assignedTribeId: string | null; preferredCampusId: string | null }): Occupant {
  return {
    kind: "STAFF",
    staffProfileId: staff.id,
    gender: staff.gender,
    dateOfBirth: staff.dateOfBirth,
    groupId: staff.departmentId ?? staff.assignedTribeId,
    campusId: staff.preferredCampusId,
  };
}

export interface BedAssignmentResult {
  occupantKey: string;
  bedId?: string;
  error?: string;
}

/**
 * Bulk-assigns beds for every unassigned APPROVED camper/teacher/volunteer
 * already assigned to this Venue. Scoped by venueId, not just campId — a camp
 * can have multiple Venues, each with its own hostels, so pulling in
 * occupants assigned to a different Venue would misplace them. An APPROVED
 * Registration always has a venueId (approveRegistrationInTx requires it —
 * auto sole-Venue or manual); staff only get one via autoAssignSoleVenue or
 * a manual assignVenue, so multi-venue-camp staff without one are simply
 * skipped here until assigned. Never fails the whole batch on one error.
 */
export async function bulkAutoAssignBeds(params: { venueId: string; actorId: string }): Promise<BedAssignmentResult[]> {
  const venue = await prisma.venue.findUniqueOrThrow({ where: { id: params.venueId } });

  const [unassignedRegistrations, unassignedStaff] = await Promise.all([
    prisma.registration.findMany({
      where: { campId: venue.campId, venueId: params.venueId, status: "APPROVED", roomId: null, deletedAt: null },
      include: { camper: true },
    }),
    prisma.staffProfile.findMany({
      where: { campId: venue.campId, assignedVenueId: params.venueId, status: "APPROVED", assignedRoomId: null, deletedAt: null },
    }),
  ]);

  const occupants: Occupant[] = [
    ...unassignedRegistrations.map(occupantFromRegistration),
    ...unassignedStaff.map(occupantFromStaff),
  ];

  const results: BedAssignmentResult[] = [];
  for (const occupant of occupants) {
    const key = occupantKey(occupant);
    try {
      const suggestion = await suggestBed(prisma, params.venueId, occupant);
      if (!suggestion) {
        results.push({ occupantKey: key, error: "No matching-gender bed available" });
        continue;
      }
      await prisma.$transaction((tx) => assignBedInTx(tx, { bedId: suggestion.bedId, occupant, actorId: params.actorId }));
      results.push({ occupantKey: key, bedId: suggestion.bedId });
    } catch (error) {
      results.push({ occupantKey: key, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}
