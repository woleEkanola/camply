/**
 * Why a bed placement failed. Lives outside src/server so both the
 * (server-only) accommodation engine and client components can import it
 * without pulling Prisma into the client bundle. Each reason needs a
 * different admin action:
 *  - MISSING_GENDER: the occupant's own gender doesn't normalize (see
 *    normalizeGender) — they can only ever go in an unspecified/MIXED
 *    hostel, so fix their profile or add MIXED capacity.
 *  - NO_GENDER_MATCH: the occupant has a real gender, but no hostel of that
 *    gender exists at this venue at all — a structural gap, needs a new
 *    hostel.
 *  - NO_FREE_BEDS: a gender-eligible hostel exists, but every bed in it is
 *    taken (or held back for staff) — needs more beds/rooms, not a new
 *    hostel.
 *  - NO_TRIBE_COMPATIBLE_ROOM: GROUP_TOGETHER is on and every gender-eligible
 *    room with a free bed already belongs to a different tribe — needs
 *    either more beds in this tribe's rooms, or a deliberate exception.
 */
export type BedFailureReason = "MISSING_GENDER" | "NO_GENDER_MATCH" | "NO_FREE_BEDS" | "NO_TRIBE_COMPATIBLE_ROOM";

export const BED_FAILURE_MESSAGES: Record<BedFailureReason, { summary: string; action: string }> = {
  MISSING_GENDER: { summary: "No gender on file", action: "Add their gender, or add a MIXED-gender bed" },
  NO_GENDER_MATCH: { summary: "No hostel of their gender exists", action: "Add a hostel for their gender at this venue" },
  NO_FREE_BEDS: { summary: "No free bed of their gender", action: "Add beds or rooms, or free up existing ones" },
  NO_TRIBE_COMPATIBLE_ROOM: { summary: "No free bed in their tribe's rooms", action: "Add beds to their tribe's rooms, or move someone" },
};
