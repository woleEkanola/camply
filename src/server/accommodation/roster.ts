import { ACTIVE_ASSIGNMENT_REGISTRATION_STATUSES } from "../assignments/eligibility";
import { gendersMatch } from "../../lib/gender";

export type OccupantType = "CAMPER" | "TEACHER" | "VOLUNTEER";

export interface RosterFilters {
  campId?: string;
  venueId?: string;
  hostelId?: string;
  floorId?: string;
  roomId?: string;
  gender?: string;
  tribeId?: string;
  campusId?: string;
  status?: string;
  occupantType?: OccupantType | "STAFF";
  search?: string;
}

export interface RosterOccupant {
  occupantType: OccupantType;
  sourceId: string; // registrationId (camper) or staffProfileId (staff)
  name: string;
  gender: string | null;
  age: number | null;
  tribeName: string | null;
  campusName: string | null;
  venueName: string | null;
  registrationNumber: string | null;
  registrationStatus: string | null;
  phone: string | null;
  hostelId: string | null;
  hostelName: string | null;
  hostelGender: string | null;
  floorId: string | null;
  floorName: string | null;
  roomId: string | null;
  roomName: string | null;
  roomCapacity: number | null;
  bedId: string | null;
  bedLabel: string | null;
  flags: string[];
}

function ageFromDob(dob: Date | string | null | undefined): number | null {
  if (!dob) return null;
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

/** Correction-signal flags — shared by the rooming-list export, the door
 * sheets, and the roster page so "what counts as wrong" is defined once. */
function computeFlags(occupant: {
  occupantType: OccupantType;
  roomId: string | null;
  bedId: string | null;
  gender: string | null;
  hostelGender: string | null;
  registrationStatus: string | null;
}): string[] {
  const flags: string[] = [];
  if (occupant.roomId && !occupant.bedId) flags.push("ROOM ONLY (NO BED)");
  if (occupant.hostelGender && occupant.gender && !gendersMatch(occupant.gender, occupant.hostelGender)) {
    flags.push("GENDER MISMATCH");
  }
  if (
    occupant.occupantType === "CAMPER" &&
    occupant.registrationStatus &&
    !ACTIVE_ASSIGNMENT_REGISTRATION_STATUSES.includes(occupant.registrationStatus as any)
  ) {
    flags.push("INACTIVE STATUS");
  }
  return flags;
}

function roomWhere(filters: RosterFilters) {
  const where: Record<string, any> = {};
  if (filters.floorId) where.floorId = filters.floorId;
  if (filters.hostelId) where.hostelId = filters.hostelId;
  return where;
}

/** Everyone (camper or staff) holding any accommodation link — a room-only
 * assignment or a bed — regardless of registration status. Status stays a
 * filter, not a hard gate: a stale assignment on a rejected/cancelled
 * registration is exactly the kind of thing this feature exists to surface. */
export async function fetchRoomingOccupants(
  prisma: any,
  organizationId: string,
  filters: RosterFilters,
  ids?: string[]
): Promise<RosterOccupant[]> {
  const wantsCampers = !filters.occupantType || filters.occupantType === "CAMPER";
  const wantsStaff = !filters.occupantType || filters.occupantType === "TEACHER" || filters.occupantType === "VOLUNTEER" || filters.occupantType === "STAFF";
  const roomFilter = roomWhere(filters);

  const [registrations, staff] = await Promise.all([
    wantsCampers
      ? prisma.registration.findMany({
          where: {
            deletedAt: null,
            camper: { organizationId, deletedAt: null },
            roomId: { not: null },
            ...(ids?.length ? { id: { in: ids } } : {}),
            ...(filters.campId ? { campId: filters.campId } : {}),
            ...(filters.venueId ? { venueId: filters.venueId } : {}),
            ...(filters.roomId ? { roomId: filters.roomId } : {}),
            ...(Object.keys(roomFilter).length ? { room: roomFilter } : {}),
            ...(filters.tribeId ? { tribeId: filters.tribeId } : {}),
            ...(filters.campusId ? { campusId: filters.campusId } : {}),
            ...(filters.status ? { status: filters.status as any } : {}),
            ...(filters.search?.trim() ? { camper: { organizationId, deletedAt: null, name: { contains: filters.search.trim(), mode: "insensitive" } } } : {}),
          },
          include: {
            camper: { select: { name: true, gender: true } },
            tribe: { select: { name: true } },
            campus: { select: { name: true } },
            venue: { select: { name: true } },
            room: { select: { id: true, name: true, capacity: true, floor: { select: { id: true, name: true } }, hostel: { select: { id: true, name: true, gender: true } } } },
            bed: { select: { id: true, label: true } },
          },
        })
      : Promise.resolve([]),
    wantsStaff
      ? prisma.staffProfile.findMany({
          where: {
            organizationId,
            deletedAt: null,
            assignedRoomId: { not: null },
            ...(ids?.length ? { id: { in: ids } } : {}),
            ...(filters.campId ? { campId: filters.campId } : {}),
            ...(filters.venueId ? { assignedVenueId: filters.venueId } : {}),
            ...(filters.roomId ? { assignedRoomId: filters.roomId } : {}),
            ...(Object.keys(roomFilter).length ? { assignedRoom: roomFilter } : {}),
            ...(filters.tribeId ? { assignedTribeId: filters.tribeId } : {}),
            ...(filters.campusId ? { preferredCampusId: filters.campusId } : {}),
            ...(filters.occupantType === "TEACHER" || filters.occupantType === "VOLUNTEER" ? { type: filters.occupantType } : {}),
            ...(filters.search?.trim() ? {
              OR: [
                { firstName: { contains: filters.search.trim(), mode: "insensitive" } },
                { lastName: { contains: filters.search.trim(), mode: "insensitive" } },
              ],
            } : {}),
          },
          include: {
            assignedTribe: { select: { name: true } },
            preferredCampus: { select: { name: true } },
            assignedVenue: { select: { name: true } },
            assignedRoom: { select: { id: true, name: true, capacity: true, floor: { select: { id: true, name: true } }, hostel: { select: { id: true, name: true, gender: true } } } },
            assignedBed: { select: { id: true, label: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const camperGenderFilter = filters.gender?.trim().toUpperCase();
  const occupants: RosterOccupant[] = [];

  for (const reg of registrations) {
    const base = {
      occupantType: "CAMPER" as const,
      roomId: reg.room?.id ?? null,
      bedId: reg.bed?.id ?? null,
      gender: reg.camper.gender ?? null,
      hostelGender: reg.room?.hostel?.gender ?? null,
      registrationStatus: reg.status,
    };
    if (camperGenderFilter && !gendersMatch(base.gender, camperGenderFilter)) continue;
    occupants.push({
      ...base,
      sourceId: reg.id,
      name: reg.camper.name,
      age: ageFromDob(reg.camper.dateOfBirth),
      tribeName: reg.tribe?.name ?? null,
      campusName: reg.campus?.name ?? null,
      venueName: reg.venue?.name ?? null,
      registrationNumber: reg.registrationNumber ?? null,
      phone: null,
      hostelId: reg.room?.hostel?.id ?? null,
      hostelName: reg.room?.hostel?.name ?? null,
      floorId: reg.room?.floor?.id ?? null,
      floorName: reg.room?.floor?.name ?? null,
      roomName: reg.room?.name ?? null,
      roomCapacity: reg.room?.capacity ?? null,
      bedLabel: reg.bed?.label ?? null,
      flags: computeFlags(base),
    });
  }

  for (const member of staff) {
    const base = {
      occupantType: member.type as OccupantType,
      roomId: member.assignedRoom?.id ?? null,
      bedId: member.assignedBed?.id ?? null,
      gender: member.gender ?? null,
      hostelGender: member.assignedRoom?.hostel?.gender ?? null,
      registrationStatus: null,
    };
    if (camperGenderFilter && !gendersMatch(base.gender, camperGenderFilter)) continue;
    occupants.push({
      ...base,
      sourceId: member.id,
      name: `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim(),
      age: null,
      tribeName: member.assignedTribe?.name ?? null,
      campusName: member.preferredCampus?.name ?? null,
      venueName: member.assignedVenue?.name ?? null,
      registrationNumber: null,
      phone: member.phone ?? null,
      hostelId: member.assignedRoom?.hostel?.id ?? null,
      hostelName: member.assignedRoom?.hostel?.name ?? null,
      floorId: member.assignedRoom?.floor?.id ?? null,
      floorName: member.assignedRoom?.floor?.name ?? null,
      roomName: member.assignedRoom?.name ?? null,
      roomCapacity: member.assignedRoom?.capacity ?? null,
      bedLabel: member.assignedBed?.label ?? null,
      flags: computeFlags(base),
    });
  }

  occupants.sort((a, b) => {
    const hostel = (a.hostelName ?? "").localeCompare(b.hostelName ?? "");
    if (hostel) return hostel;
    const floor = (a.floorName ?? "").localeCompare(b.floorName ?? "");
    if (floor) return floor;
    const room = (a.roomName ?? "").localeCompare(b.roomName ?? "");
    if (room) return room;
    return (a.bedLabel ?? "").localeCompare(b.bedLabel ?? "");
  });

  return occupants;
}

export interface RosterRoom {
  id: string;
  name: string;
  capacity: number | null;
  hostelId: string;
  hostelName: string;
  hostelGender: string | null;
  floorId: string | null;
  floorName: string | null;
  beds: { id: string; label: string; occupant: RosterOccupant | null }[];
  roomOnlyOccupants: RosterOccupant[];
  occupied: number;
  free: number;
}

/** Room-centric view (hostel → floor → room → beds), including empty beds —
 * used by the door-sheets PDF (one page per room, blank beds shown as blank
 * lines) and the accommodation roster page. Built on top of
 * fetchRoomingOccupants so the same occupant shaping and correction-flag
 * logic applies in both places. */
export async function fetchRoomsWithOccupancy(
  prisma: any,
  organizationId: string,
  filters: Pick<RosterFilters, "campId" | "venueId" | "hostelId" | "floorId" | "roomId" | "gender">
): Promise<RosterRoom[]> {
  const hostelGenderFilter = filters.gender?.trim().toUpperCase();
  const rooms = await prisma.room.findMany({
    where: {
      deletedAt: null,
      ...(filters.roomId ? { id: filters.roomId } : {}),
      ...(filters.floorId ? { floorId: filters.floorId } : {}),
      hostel: {
        organizationId,
        deletedAt: null,
        ...(filters.hostelId ? { id: filters.hostelId } : {}),
        ...(hostelGenderFilter ? { gender: { equals: hostelGenderFilter, mode: "insensitive" } } : {}),
        venue: {
          deletedAt: null,
          ...(filters.campId ? { campId: filters.campId } : {}),
          ...(filters.venueId ? { id: filters.venueId } : {}),
        },
      },
    },
    include: {
      floor: { select: { id: true, name: true } },
      hostel: { select: { id: true, name: true, gender: true } },
      beds: { where: { deletedAt: null }, orderBy: { label: "asc" } },
    },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });
  if (!rooms.length) return [];

  const occupants = await fetchRoomingOccupants(prisma, organizationId, {
    campId: filters.campId,
    venueId: filters.venueId,
    hostelId: filters.hostelId,
    floorId: filters.floorId,
    roomId: filters.roomId,
  });
  const byBedId = new Map(occupants.filter((o) => o.bedId).map((o) => [o.bedId as string, o]));
  const roomOnlyByRoomId = new Map<string, RosterOccupant[]>();
  for (const occupant of occupants) {
    if (occupant.roomId && !occupant.bedId) {
      const list = roomOnlyByRoomId.get(occupant.roomId) ?? [];
      list.push(occupant);
      roomOnlyByRoomId.set(occupant.roomId, list);
    }
  }

  return rooms.map((room: any) => {
    const beds = room.beds.map((bed: any) => ({ id: bed.id, label: bed.label, occupant: byBedId.get(bed.id) ?? null }));
    const roomOnlyOccupants = roomOnlyByRoomId.get(room.id) ?? [];
    return {
      id: room.id,
      name: room.name,
      capacity: room.capacity,
      hostelId: room.hostel.id,
      hostelName: room.hostel.name,
      hostelGender: room.hostel.gender,
      floorId: room.floor?.id ?? null,
      floorName: room.floor?.name ?? null,
      beds,
      roomOnlyOccupants,
      occupied: beds.filter((b: any) => b.occupant).length,
      free: beds.filter((b: any) => !b.occupant).length,
    };
  });
}
