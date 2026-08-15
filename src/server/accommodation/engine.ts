import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../db";
import { logEvent } from "../audit";
import { calculateAge } from "../registration/validation";
import { gendersMatch, normalizeGender } from "../../lib/gender";
import { ACTIVE_ASSIGNMENT_REGISTRATION_STATUSES } from "../assignments/eligibility";

type TxClient = PrismaClient<any> | Prisma.TransactionClient;

export class BedAllocationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "BedAllocationError";
    this.code = code;
  }
}

type Criterion = "AGE_GROUP" | "GROUP_TOGETHER" | "CAMPUS_TOGETHER" | "POPULATION_BALANCE" | "STAFF_SPREAD";

interface Rule {
  criterion: Criterion;
  enabled: boolean;
}

const DEFAULT_RULES: Rule[] = [
  { criterion: "AGE_GROUP", enabled: true },
  { criterion: "GROUP_TOGETHER", enabled: true },
  { criterion: "POPULATION_BALANCE", enabled: true },
  { criterion: "STAFF_SPREAD", enabled: true },
  { criterion: "CAMPUS_TOGETHER", enabled: false },
];

/**
 * STAFF_SPREAD tier weights, deliberately orders of magnitude above the soft
 * criteria below. Those are preferences that should trade off against each
 * other; this is closer to a constraint — without the gap, GROUP_TOGETHER's
 * +200 would pull same-tribe staff into one room, which is exactly the
 * clustering this prevents. Tiers still let the soft rules break ties *within*
 * a tier (e.g. which camper-occupied room a teacher covers first).
 */
const STAFF_SPREAD_OCCUPIED_BY_STAFF = -10_000;
const STAFF_SPREAD_COVERS_CAMPERS = 10_000;
/** Within the "covers campers" tier, put an adult in the fullest uncovered room first. */
const STAFF_SPREAD_PER_CAMPER = 100;

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
  | { kind: "CAMPER"; registrationId: string; gender: string | null; dateOfBirth: Date | null; groupId: string | null; tribeId?: string | null; campusId: string | null }
  | { kind: "STAFF"; staffProfileId: string; gender: string | null; dateOfBirth: Date | null; groupId: string | null; tribeId?: string | null; campusId: string | null };

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
export async function suggestBed(
  tx: TxClient,
  venueId: string,
  occupant: Occupant,
  /**
   * Beds held back for staff during the camper phase of bulkAutoAssignBeds.
   * Without this, campers fill a room to its last bed and the room can never
   * receive a supervising adult — scoring alone can't fix that, since by then
   * there is simply no bed left to score.
   */
  excludeBedIds?: ReadonlySet<string>
): Promise<BedSuggestion | null> {
  const venue = await tx.venue.findUniqueOrThrow({ where: { id: venueId }, include: { camp: true } });

  const hostels = await tx.hostel.findMany({
    where: { venueId, deletedAt: null },
    include: {
      rooms: {
        where: { deletedAt: null },
        include: { beds: { where: { deletedAt: null, status: "AVAILABLE" } } },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }, { id: "asc" }],
      },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  // Hard gender filter — unknown occupant gender can only go to an unspecified/MIXED hostel.
  const genderEligible = hostels.filter((h) => !h.gender || h.gender.toUpperCase() === "MIXED" || gendersMatch(h.gender, occupant.gender));

  const candidates: { bedId: string; roomId: string; roomName: string; hostelId: string; hostelName: string }[] = [];
  for (const hostel of genderEligible) {
    for (const room of hostel.rooms) {
      for (const bed of room.beds) {
        if (excludeBedIds?.has(bed.id)) continue;
        candidates.push({ bedId: bed.id, roomId: room.id, roomName: room.name, hostelId: hostel.id, hostelName: hostel.name });
      }
    }
  }
  if (candidates.length === 0) return null;

  // Merge stored rules *over* the defaults rather than replacing them: a camp
  // configured before a criterion existed has no entry for it, and treating
  // "absent" as "disabled" would silently withhold new behaviour (e.g.
  // STAFF_SPREAD) from every pre-existing camp. Absent => that rule's default.
  const storedRules = Array.isArray(venue.camp.bedAllocationRules)
    ? (venue.camp.bedAllocationRules as unknown as Rule[])
    : [];
  const rules: Rule[] = DEFAULT_RULES.map((fallback) => {
    const stored = storedRules.find((r) => r?.criterion === fallback.criterion);
    return stored ? { criterion: fallback.criterion, enabled: !!stored.enabled } : fallback;
  });
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
      camperCount: campers.length,
      staffCount: staff.length,
      ages: [
        ...campers.map((r) => ageGroup(r.camper.dateOfBirth, cutoff)),
        ...staff.map((s) => ageGroup(s.dateOfBirth, cutoff)),
      ],
      groupIds: [
        ...campers.map((r) => r.tribeId),
        ...staff.map((s) => s.departmentId ?? s.assignedTribeId),
      ].filter((g): g is string => !!g),
      camperTribeIds: campers.map((registration) => registration.tribeId).filter((tribeId): tribeId is string => !!tribeId),
      tribeIds: [
        ...campers.map((registration) => registration.tribeId),
        ...staff.map((member) => member.assignedTribeId),
      ].filter((tribeId): tribeId is string => !!tribeId),
      campusIds: [
        ...campers.map((r) => r.campusId),
        ...staff.map((s) => s.preferredCampusId),
      ].filter((c): c is string => !!c),
    };
  }

  const groupTogether = enabledRules.some((rule) => rule.criterion === "GROUP_TOGETHER");
  const occupantTribeId = occupant.tribeId;
  const eligibleCandidates = groupTogether && occupantTribeId
    ? candidates.filter((candidate) => {
        const room = roomOccupants(candidate.roomId);
        if (occupant.kind === "CAMPER") {
          // A tribe may take the next empty room, but it never silently mixes
          // with another tribe. Stable room ordering above makes each tribe's
          // greedy allocation form a predictable room block.
          return room.tribeIds.length === 0 || room.tribeIds.every((tribeId) => tribeId === occupantTribeId);
        }
        // Tribe-assigned staff sleep with their own campers. If their tribe's
        // rooms have no compatible spare bed, return an explicit exception
        // instead of placing them in another tribe's room.
        return room.tribeIds.length === 0 || room.tribeIds.every((tribeId) => tribeId === occupantTribeId);
      })
    : candidates;
  if (eligibleCandidates.length === 0) return null;

  const scored = eligibleCandidates.map((candidate) => {
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
        case "STAFF_SPREAD": {
          // Campers are unaffected — this only shapes where adults land.
          if (occupant.kind !== "STAFF") break;
          if (occupants.staffCount > 0) {
            // Already supervised; only pick this if nothing better exists.
            score += STAFF_SPREAD_OCCUPIED_BY_STAFF;
            reasons.push("Room already has a staff member");
          } else if (occupants.camperCount > 0) {
            score += STAFF_SPREAD_COVERS_CAMPERS + occupants.camperCount * STAFF_SPREAD_PER_CAMPER;
            reasons.push("Covers a room of campers with no staff yet");
          }
          break;
        }
      }
    }

    return { candidate, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const runnerUp = scored[1]?.score ?? best.score;
  const gap = Math.max(0, best.score - runnerUp);
  const scale = Math.abs(best.score) + Math.abs(runnerUp) + 1;
  const confidence = scored.length === 1 ? 99 : Math.round(Math.min(99, 50 + (gap / scale) * 49));

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
  params: { bedId: string; occupant: Occupant; actorId: string | null; preserveExistingAssignment?: boolean }
) {
  const bed = await tx.bed.findUniqueOrThrow({ where: { id: params.bedId }, include: { room: { include: { hostel: true } } } });
  const { occupant } = params;

  // Neither this function nor its former router-side duplicate checked
  // deletedAt or MAINTENANCE — a camper could be assigned onto a
  // soft-deleted or under-maintenance bed.
  if (bed.deletedAt) {
    throw new BedAllocationError("BED_OCCUPIED", "This bed no longer exists.");
  }
  if (bed.status === "MAINTENANCE") {
    throw new BedAllocationError("BED_OCCUPIED", "This bed is under maintenance.");
  }

  if (occupant.kind === "CAMPER") {
    await tx.$queryRaw`SELECT "id" FROM "Registration" WHERE "id" = ${occupant.registrationId} FOR UPDATE`;
    const registration = await tx.registration.findUniqueOrThrow({
      where: { id: occupant.registrationId },
      select: { roomId: true, status: true, deletedAt: true },
    });
    if (params.preserveExistingAssignment && (
      registration.roomId ||
      registration.deletedAt ||
      !ACTIVE_ASSIGNMENT_REGISTRATION_STATUSES.includes(registration.status as (typeof ACTIVE_ASSIGNMENT_REGISTRATION_STATUSES)[number])
    )) return null;
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
    // Guarded write, not a plain update: the reads above are stale by the
    // time we get here, so two concurrent assignments could both pass them
    // and both write — the second silently overwrites the first with no
    // error, leaving the loser's registration.roomId pointing at a room
    // they have no bed in. Re-asserting the bed's expected state in the
    // WHERE clause makes only one of two racing transactions actually
    // update a row; the other gets count 0 and throws instead of a silent
    // loss.
    const result = await tx.bed.updateMany({
      where: {
        id: bed.id,
        staffProfileId: null,
        deletedAt: null,
        status: { not: "MAINTENANCE" },
        OR: [{ registrationId: null }, { registrationId: occupant.registrationId }],
      },
      data: { registrationId: occupant.registrationId, status: "OCCUPIED" },
    });
    if (result.count === 0) {
      throw new BedAllocationError("BED_OCCUPIED", "This bed is already occupied.");
    }
    await tx.registration.update({ where: { id: occupant.registrationId }, data: { roomId: bed.roomId } });

    await logEvent(tx, {
      organizationId: bed.room.hostel.organizationId,
      registrationId: occupant.registrationId,
      actorId: params.actorId,
      action: "BED_ASSIGNED",
      newValue: { bedId: bed.id, roomId: bed.roomId },
    });
  } else {
    await tx.$queryRaw`SELECT "id" FROM "StaffProfile" WHERE "id" = ${occupant.staffProfileId} FOR UPDATE`;
    const staff = await tx.staffProfile.findUniqueOrThrow({
      where: { id: occupant.staffProfileId },
      select: { assignedRoomId: true, status: true, deletedAt: true },
    });
    if (params.preserveExistingAssignment && (staff.assignedRoomId || staff.deletedAt || staff.status !== "APPROVED")) return null;
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
    // Same guarded-write fix as the CAMPER branch above.
    const result = await tx.bed.updateMany({
      where: {
        id: bed.id,
        registrationId: null,
        deletedAt: null,
        status: { not: "MAINTENANCE" },
        OR: [{ staffProfileId: null }, { staffProfileId: occupant.staffProfileId }],
      },
      data: { staffProfileId: occupant.staffProfileId, status: "OCCUPIED" },
    });
    if (result.count === 0) {
      throw new BedAllocationError("BED_OCCUPIED", "This bed is already occupied.");
    }
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
    gender: normalizeGender(reg.camper.gender),
    dateOfBirth: reg.camper.dateOfBirth,
    groupId: reg.tribeId,
    tribeId: reg.tribeId,
    campusId: reg.campusId,
  };
}

function occupantFromStaff(staff: { id: string; gender: string | null; dateOfBirth: Date | null; departmentId: string | null; assignedTribeId: string | null; preferredCampusId: string | null }): Occupant {
  return {
    kind: "STAFF",
    staffProfileId: staff.id,
    gender: normalizeGender(staff.gender),
    dateOfBirth: staff.dateOfBirth,
    // Sleeping-group cohesion follows the staff member's tribe first. Their
    // operational department must not pull them away from their tribe rooms.
    groupId: staff.assignedTribeId ?? staff.departmentId,
    tribeId: staff.assignedTribeId,
    campusId: staff.preferredCampusId,
  };
}

export interface BedAssignmentResult {
  occupantKey: string;
  bedId?: string;
  preserved?: boolean;
  error?: string;
}

/**
 * Holds back one bed per room for the staff about to be placed, so campers
 * can't fill a room to capacity and lock every adult out of it. Greedy and
 * gender-aware: each staff member claims a bed in a distinct room drawn from
 * the hostels their gender allows, preferring rooms that have no staff yet.
 *
 * Reserves at most one bed per room and never more beds than there are staff,
 * so this can only displace a camper when doing so is what actually buys that
 * room its supervising adult.
 */
async function reserveBedsForStaff(
  venueId: string,
  staff: { gender: string | null; assignedTribeId: string | null }[],
  groupTogether: boolean,
): Promise<Set<string>> {
  const reserved = new Set<string>();
  if (staff.length === 0) return reserved;

  const hostels = await prisma.hostel.findMany({
    where: { venueId, deletedAt: null },
    include: {
      rooms: {
        where: { deletedAt: null },
        include: {
          beds: { where: { deletedAt: null, status: "AVAILABLE" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
          staffAssigned: { where: { deletedAt: null }, select: { id: true, assignedTribeId: true } },
          registrations: { where: { deletedAt: null }, select: { tribeId: true } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const roomsWithReservation = new Set<string>();
  for (const member of staff) {
    const eligible = hostels.filter((h) => !h.gender || h.gender.toUpperCase() === "MIXED" || gendersMatch(h.gender, member.gender));
    let claimed = false;
    // Two passes: rooms with no staff at all first (that's the coverage this
    // exists for), then any remaining room so surplus staff still get a bed.
    for (const preferUncovered of [true, false]) {
      if (claimed) break;
      for (const hostel of eligible) {
        for (const room of hostel.rooms) {
          if (roomsWithReservation.has(room.id)) continue;
          if (preferUncovered && room.staffAssigned.length > 0) continue;
          const roomTribes = [...room.registrations.map((row) => row.tribeId), ...room.staffAssigned.map((row) => row.assignedTribeId)].filter(Boolean);
          if (groupTogether && member.assignedTribeId && roomTribes.length > 0 && roomTribes.some((tribeId) => tribeId !== member.assignedTribeId)) continue;
          const bed = room.beds.find((b) => !reserved.has(b.id));
          if (!bed) continue;
          reserved.add(bed.id);
          roomsWithReservation.add(room.id);
          claimed = true;
          break;
        }
        if (claimed) break;
      }
    }
  }

  return reserved;
}

/**
 * Bulk-assigns beds for every unassigned active camper/teacher/volunteer
 * already assigned to this Venue. Scoped by venueId, not just campId — a camp
 * can have multiple Venues, each with its own hostels, so pulling in
 * occupants assigned to a different Venue would misplace them. Registrations
 * normally receive a venue during approval; the Assignment Setup sole-venue
 * repair also covers active records revisited after check-in. Staff without a
 * venue in a multi-venue camp remain skipped until assigned. Never fails the
 * whole batch on one error.
 */
export async function bulkAutoAssignBeds(params: { venueId: string; actorId: string }): Promise<BedAssignmentResult[]> {
  const venue = await prisma.venue.findUniqueOrThrow({ where: { id: params.venueId }, include: { camp: true } });
  if (!venue.camp.bedAllocationEnabled) {
    throw new BedAllocationError("BED_ALLOCATION_DISABLED", "Enable bed allocation in Camp Assignment Setup before assigning rooms and beds.");
  }

  const storedRules = Array.isArray(venue.camp.bedAllocationRules) ? venue.camp.bedAllocationRules as unknown as Rule[] : [];
  const groupTogether = storedRules.find((rule) => rule?.criterion === "GROUP_TOGETHER")?.enabled ?? true;
  if (groupTogether) {
    const [camperWithoutTribe, teacherWithoutTribe] = await Promise.all([
      prisma.registration.count({ where: { campId: venue.campId, venueId: params.venueId, status: { in: [...ACTIVE_ASSIGNMENT_REGISTRATION_STATUSES] }, tribeId: null, roomId: null, deletedAt: null } }),
      prisma.staffProfile.count({ where: { campId: venue.campId, assignedVenueId: params.venueId, type: "TEACHER", status: "APPROVED", assignedTribeId: null, assignedRoomId: null, deletedAt: null } }),
    ]);
    if (camperWithoutTribe || teacherWithoutTribe) {
      throw new BedAllocationError("TRIBE_ASSIGNMENT_REQUIRED", `Assign tribes first: ${camperWithoutTribe} camper(s) and ${teacherWithoutTribe} teacher(s) at this venue still have no tribe.`);
    }
  }

  // Postgres gives no row-order guarantee for a findMany with no orderBy —
  // when capacity runs out mid-batch, which occupant wins the last bed vs.
  // gets a "no bed available" failure would otherwise be nondeterministic.
  // Deterministic FIFO (createdAt, then id as a tiebreaker for same-instant
  // rows) so bulk assignment is reproducible and earlier-registered/approved
  // occupants are prioritized when beds are scarce.
  const [unassignedRegistrations, unassignedStaff] = await Promise.all([
    prisma.registration.findMany({
      where: { campId: venue.campId, venueId: params.venueId, status: { in: [...ACTIVE_ASSIGNMENT_REGISTRATION_STATUSES] }, roomId: null, deletedAt: null },
      include: { camper: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.staffProfile.findMany({
      where: { campId: venue.campId, assignedVenueId: params.venueId, status: "APPROVED", assignedRoomId: null, deletedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);

  // Order matters and is load-bearing, not incidental: every camper is placed
  // before any staff member, so STAFF_SPREAD can see which rooms actually hold
  // campers and needs covering. Don't merge/interleave these by createdAt.
  const camperOccupants = unassignedRegistrations.map(occupantFromRegistration);
  const staffOccupants = unassignedStaff.map(occupantFromStaff);

  // Held back during the camper phase only, then released for staff below.
  const reservedForStaff = await reserveBedsForStaff(params.venueId, unassignedStaff, groupTogether);

  const occupants: Occupant[] = [...camperOccupants, ...staffOccupants];

  const results: BedAssignmentResult[] = [];
  for (const occupant of occupants) {
    const key = occupantKey(occupant);
    try {
      // suggestBed and assignBedInTx now share one transaction — previously
      // suggestBed ran against the raw client outside any transaction, so a
      // bed it suggested could be taken by a concurrent assignment before
      // this occupant's own (separate) transaction got to it. The guarded
      // write in assignBedInTx already makes that safe rather than
      // corrupting data, but running both under one lock avoids the wasted
      // suggestion and the resulting spurious "bed occupied" failure.
      const assignment = await prisma.$transaction(async (tx) => {
        // Staff-reserved beds are off-limits to campers but fair game once
        // we reach the staff phase — that's the whole point of holding them.
        const exclude = occupant.kind === "CAMPER" ? reservedForStaff : undefined;
        let suggestion = await suggestBed(tx, params.venueId, occupant, exclude);
        // Rather than fail a camper outright, fall back to the reserved pool:
        // an unhoused camper is worse than an unsupervised room, and this only
        // triggers once every non-reserved bed in the venue is taken.
        if (!suggestion && occupant.kind === "CAMPER") {
          suggestion = await suggestBed(tx, params.venueId, occupant);
        }
        if (!suggestion) return { bedId: null, preserved: false };
        const assigned = await assignBedInTx(tx, {
          bedId: suggestion.bedId,
          occupant,
          actorId: params.actorId,
          preserveExistingAssignment: true,
        });
        return assigned
          ? { bedId: suggestion.bedId, preserved: false }
          : { bedId: null, preserved: true };
      });
      if (assignment.preserved) {
        results.push({ occupantKey: key, preserved: true });
        continue;
      }
      if (!assignment.bedId) {
        results.push({ occupantKey: key, error: groupTogether && occupant.tribeId ? "No compatible bed is available for this gender and tribe" : "No matching-gender bed available" });
        continue;
      }
      // Keep the reservation set honest: if a camper did consume a reserved
      // bed via the fallback above, it's no longer held for anyone.
      reservedForStaff.delete(assignment.bedId);
      results.push({ occupantKey: key, bedId: assignment.bedId });
    } catch (error) {
      results.push({ occupantKey: key, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}
