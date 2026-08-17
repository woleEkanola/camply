import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import * as regEngine from "../../registration/engine";
import * as accommodationEngine from "../engine";

const prisma = new PrismaClient();

let orgId: string;
let campId: string;
let campusId: string;
let venueId: string;
let parentId: string;

async function makeCamper(gender = "MALE", dateOfBirth = new Date(2013, 5, 1)) {
  return prisma.camper.create({
    data: {
      name: "Bed Test Camper",
      firstName: "Bed",
      lastName: "Test",
      dateOfBirth,
      gender,
      userId: parentId,
      organizationId: orgId,
      homeCampusId: campusId,
    },
  });
}

async function approvedRegistrationFor(camperId: string) {
  const draft = await regEngine.createDraft({ camperId, campId, campusId, actorId: parentId });
  return regEngine.submitRegistration({ registrationId: draft.id, actorId: parentId });
}

async function makeApprovedStaff(gender = "MALE", type: "TEACHER" | "VOLUNTEER" = "TEACHER") {
  const user = await prisma.user.create({
    data: { email: `bed-staff-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "PARENT", organizationId: orgId },
  });
  return prisma.staffProfile.create({
    data: {
      userId: user.id,
      organizationId: orgId,
      campId,
      type,
      status: "APPROVED",
      firstName: "Staff",
      lastName: "Test",
      gender,
      phone: "+1-555-0000",
      email: user.email,
      assignedVenueId: venueId,
    },
  });
}

async function makeHostelWithBeds(gender: string | undefined, beds: number) {
  const hostel = await prisma.hostel.create({
    data: { organizationId: orgId, venueId, name: `Hostel ${Date.now()}-${Math.random()}`, gender },
  });
  const room = await prisma.room.create({ data: { hostelId: hostel.id, name: "Room 1" } });
  for (let i = 0; i < beds; i++) {
    await prisma.bed.create({ data: { roomId: room.id, label: `Bed ${i + 1}` } });
  }
  return { hostel, room };
}

beforeEach(async () => {
  const org = await prisma.organization.create({ data: { name: `Bed Org ${Date.now()}-${Math.random()}` } });
  orgId = org.id;

  const camp = await prisma.camp.create({
    data: {
      name: `${Date.now()}`,
      slug: `bed-test-${Date.now()}-${Math.random()}`,
      year: 2026,
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 11, 31),
      organizationId: orgId,
      status: "OPEN",
      approvalMode: "AUTO",
      ageCutoffDate: new Date(2026, 8, 1),
      orgCode: "BED",
      bedAllocationEnabled: true,
      bedAllocationRules: [
        { criterion: "AGE_GROUP", enabled: true },
        { criterion: "GROUP_TOGETHER", enabled: true },
        { criterion: "POPULATION_BALANCE", enabled: true },
      ],
    },
  });
  campId = camp.id;

  const campus = await prisma.campus.create({
    data: {
      name: `Bed Campus ${Date.now()}`,
      slug: `bed-campus-${Date.now()}-${Math.random()}`,
      address: "1 Test St",
      city: "Testville",
      country: "Testland",
      organizationId: orgId,
      campusCode: "TLC",
    },
  });
  campusId = campus.id;

  const venue = await prisma.venue.create({
    data: { name: `Bed Venue ${Date.now()}`, campId, quota: 100 },
  });
  venueId = venue.id;

  const parent = await prisma.user.create({
    data: { email: `bed-parent-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "PARENT", organizationId: orgId },
  });
  parentId = parent.id;
});

afterEach(async () => {
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("bed suggestion — hard gender filter", () => {
  it("matches legacy title-case occupants to canonical gendered hostels", async () => {
    const { room } = await makeHostelWithBeds("MALE", 1);
    const outcome = await accommodationEngine.suggestBed(prisma, venueId, {
      kind: "CAMPER", registrationId: "legacy-registration", name: "Legacy Camper", gender: "Male", dateOfBirth: null, groupId: null, campusId,
    });
    expect(outcome.ok && outcome.suggestion.roomId).toBe(room.id);
  });

  it("never suggests a bed in a hostel of the wrong gender", async () => {
    await makeHostelWithBeds("FEMALE", 2);
    const { room: maleRoom } = await makeHostelWithBeds("MALE", 2);

    const camper = await makeCamper("MALE");
    const registration = await approvedRegistrationFor(camper.id);
    const outcome = await accommodationEngine.suggestBed(prisma, venueId, {
      kind: "CAMPER",
      registrationId: registration.id,
      name: camper.name,
      gender: "MALE",
      dateOfBirth: camper.dateOfBirth,
      groupId: registration.tribeId,
      campusId: registration.campusId,
    });

    expect(outcome.ok && outcome.suggestion.roomId).toBe(maleRoom.id);
  });

  it("returns a NO_GENDER_MATCH reason when no beds of the matching gender are available", async () => {
    await makeHostelWithBeds("FEMALE", 2);

    const camper = await makeCamper("MALE");
    const registration = await approvedRegistrationFor(camper.id);
    const outcome = await accommodationEngine.suggestBed(prisma, venueId, {
      kind: "CAMPER",
      registrationId: registration.id,
      name: camper.name,
      gender: "MALE",
      dateOfBirth: camper.dateOfBirth,
      groupId: registration.tribeId,
      campusId: registration.campusId,
    });

    expect(outcome).toMatchObject({ ok: false, reason: "NO_GENDER_MATCH" });
  });

  it("returns a MISSING_GENDER reason when the occupant's own gender doesn't normalize", async () => {
    await makeHostelWithBeds("MALE", 2);
    const outcome = await accommodationEngine.suggestBed(prisma, venueId, {
      kind: "CAMPER", registrationId: "unknown-gender-registration", name: "Unknown Gender", gender: null, dateOfBirth: null, groupId: null, campusId,
    });
    expect(outcome).toMatchObject({ ok: false, reason: "MISSING_GENDER" });
  });
});

describe("bed suggestion — GROUP_TOGETHER scoring", () => {
  it("prefers a room that already has an occupant from the same tribe", async () => {
    const tribe = await prisma.tribe.create({ data: { campId, name: "Green" } });
    const { room: roomA } = await makeHostelWithBeds("MALE", 2);
    const { room: roomB } = await makeHostelWithBeds("MALE", 2);

    // Seat a tribemate in roomA.
    const filler = await makeCamper("MALE");
    const fillerReg = await approvedRegistrationFor(filler.id);
    await prisma.registration.update({ where: { id: fillerReg.id }, data: { tribeId: tribe.id, roomId: roomA.id } });

    const camper = await makeCamper("MALE");
    const registration = await approvedRegistrationFor(camper.id);
    await prisma.registration.update({ where: { id: registration.id }, data: { tribeId: tribe.id } });

    const outcome = await accommodationEngine.suggestBed(prisma, venueId, {
      kind: "CAMPER",
      registrationId: registration.id,
      name: camper.name,
      gender: "MALE",
      dateOfBirth: camper.dateOfBirth,
      groupId: tribe.id,
      tribeId: tribe.id,
      campusId: registration.campusId,
    });

    expect(outcome.ok && outcome.suggestion.roomId).toBe(roomA.id);
    expect(outcome.ok && outcome.suggestion.roomId).not.toBe(roomB.id);
  });

  it("never mixes campers from different tribes when tribe cohesion is enabled", async () => {
    const tribeA = await prisma.tribe.create({ data: { campId, name: "Alpha" } });
    const tribeB = await prisma.tribe.create({ data: { campId, name: "Beta" } });
    const { room: alphaRoom } = await makeHostelWithBeds("MALE", 2);
    const { room: emptyRoom } = await makeHostelWithBeds("MALE", 2);
    const alphaCamper = await makeCamper("MALE");
    const alphaRegistration = await approvedRegistrationFor(alphaCamper.id);
    await prisma.registration.update({ where: { id: alphaRegistration.id }, data: { tribeId: tribeA.id, roomId: alphaRoom.id } });
    const betaCamper = await makeCamper("MALE");
    const betaRegistration = await approvedRegistrationFor(betaCamper.id);

    const outcome = await accommodationEngine.suggestBed(prisma, venueId, {
      kind: "CAMPER", registrationId: betaRegistration.id, name: betaCamper.name, gender: "MALE", dateOfBirth: betaCamper.dateOfBirth,
      groupId: tribeB.id, tribeId: tribeB.id, campusId,
    });

    expect(outcome.ok && outcome.suggestion.roomId).toBe(emptyRoom.id);
  });

  it("places a tribe teacher only in a room occupied by that teacher's tribe", async () => {
    const tribeA = await prisma.tribe.create({ data: { campId, name: "Teacher Alpha" } });
    const tribeB = await prisma.tribe.create({ data: { campId, name: "Teacher Beta" } });
    const { room: alphaRoom } = await makeHostelWithBeds("MALE", 2);
    const { room: betaRoom } = await makeHostelWithBeds("MALE", 2);
    for (const [tribe, room] of [[tribeA, alphaRoom], [tribeB, betaRoom]] as const) {
      const camper = await makeCamper("MALE");
      const registration = await approvedRegistrationFor(camper.id);
      await prisma.registration.update({ where: { id: registration.id }, data: { tribeId: tribe.id, roomId: room.id } });
    }
    const teacher = await makeApprovedStaff("MALE");

    const outcome = await accommodationEngine.suggestBed(prisma, venueId, {
      kind: "STAFF", staffProfileId: teacher.id, name: `${teacher.firstName} ${teacher.lastName}`, gender: "MALE", dateOfBirth: null,
      groupId: tribeA.id, tribeId: tribeA.id, campusId: null,
    });

    expect(outcome.ok && outcome.suggestion.roomId).toBe(alphaRoom.id);
    expect(outcome.ok && outcome.suggestion.roomId).not.toBe(betaRoom.id);
  });

  it("places a teacher outside their tribe's rooms rather than leaving them unhoused when no tribe-compatible bed exists", async () => {
    const tribeA = await prisma.tribe.create({ data: { campId, name: "Fallback Alpha" } });
    const tribeB = await prisma.tribe.create({ data: { campId, name: "Fallback Beta" } });
    const { room: alphaRoom } = await makeHostelWithBeds("MALE", 1);
    const { room: betaRoom } = await makeHostelWithBeds("MALE", 2);
    const alphaBed = await prisma.bed.findFirstOrThrow({ where: { roomId: alphaRoom.id } });
    const betaBeds = await prisma.bed.findMany({ where: { roomId: betaRoom.id }, orderBy: { label: "asc" } });

    // tribeA's only room/bed is completely full — actually occupied, not
    // just roomId-tagged, so it never shows up as an AVAILABLE candidate.
    const alphaCamper = await makeCamper("MALE");
    const alphaRegistration = await approvedRegistrationFor(alphaCamper.id);
    await prisma.registration.update({ where: { id: alphaRegistration.id }, data: { tribeId: tribeA.id } });
    await prisma.$transaction((tx) => accommodationEngine.assignBedInTx(tx, {
      bedId: alphaBed.id,
      occupant: { kind: "CAMPER", registrationId: alphaRegistration.id, name: alphaCamper.name, gender: "MALE", dateOfBirth: alphaCamper.dateOfBirth, groupId: tribeA.id, tribeId: tribeA.id, campusId },
      actorId: parentId,
    }));

    // tribeB's room has one occupant and one free bed — the only free bed in
    // the venue, but it belongs to a different tribe.
    const betaCamper = await makeCamper("MALE");
    const betaRegistration = await approvedRegistrationFor(betaCamper.id);
    await prisma.registration.update({ where: { id: betaRegistration.id }, data: { tribeId: tribeB.id } });
    await prisma.$transaction((tx) => accommodationEngine.assignBedInTx(tx, {
      bedId: betaBeds[0].id,
      occupant: { kind: "CAMPER", registrationId: betaRegistration.id, name: betaCamper.name, gender: "MALE", dateOfBirth: betaCamper.dateOfBirth, groupId: tribeB.id, tribeId: tribeB.id, campusId },
      actorId: parentId,
    }));

    // Strict: the venue's only free bed exists, but it's in tribeB's room —
    // the hard tribe filter correctly rejects it for a tribeA teacher.
    const teacher = await makeApprovedStaff("MALE");
    const strict = await accommodationEngine.suggestBed(prisma, venueId, {
      kind: "STAFF", staffProfileId: teacher.id, name: `${teacher.firstName} ${teacher.lastName}`, gender: "MALE", dateOfBirth: null,
      groupId: tribeA.id, tribeId: tribeA.id, campusId: null,
    });
    expect(strict).toMatchObject({ ok: false, reason: "NO_TRIBE_COMPATIBLE_ROOM" });

    // ignoreTribe relaxes the constraint and finds that same free bed in
    // tribeB's room — this is the staff fallback bulkAutoAssignBeds uses so a
    // teacher isn't left unhoused when their own tribe's rooms are full.
    const relaxed = await accommodationEngine.suggestBed(
      prisma, venueId,
      { kind: "STAFF", staffProfileId: teacher.id, name: `${teacher.firstName} ${teacher.lastName}`, gender: "MALE", dateOfBirth: null, groupId: tribeA.id, tribeId: tribeA.id, campusId: null },
      undefined,
      { ignoreTribe: true }
    );
    expect(relaxed.ok && relaxed.suggestion.roomId).toBe(betaRoom.id);
  });
});

describe("assignBedInTx", () => {
  it("assigns a camper and denormalizes Registration.roomId", async () => {
    const { room } = await makeHostelWithBeds("MALE", 1);
    const bed = await prisma.bed.findFirstOrThrow({ where: { roomId: room.id } });

    const camper = await makeCamper("MALE");
    const registration = await approvedRegistrationFor(camper.id);

    await prisma.$transaction((tx) =>
      accommodationEngine.assignBedInTx(tx, {
        bedId: bed.id,
        occupant: { kind: "CAMPER", registrationId: registration.id, name: camper.name, gender: "MALE", dateOfBirth: camper.dateOfBirth, groupId: null, campusId: campusId },
        actorId: parentId,
      })
    );

    const updatedBed = await prisma.bed.findUniqueOrThrow({ where: { id: bed.id } });
    expect(updatedBed.status).toBe("OCCUPIED");
    expect(updatedBed.registrationId).toBe(registration.id);
    const updatedReg = await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } });
    expect(updatedReg.roomId).toBe(room.id);
  });

  it("assigns a staff member and denormalizes assignedRoomId/assignedHostelId", async () => {
    const { hostel, room } = await makeHostelWithBeds("MALE", 1);
    const bed = await prisma.bed.findFirstOrThrow({ where: { roomId: room.id } });
    const staff = await makeApprovedStaff("MALE");

    await prisma.$transaction((tx) =>
      accommodationEngine.assignBedInTx(tx, {
        bedId: bed.id,
        occupant: { kind: "STAFF", staffProfileId: staff.id, name: `${staff.firstName} ${staff.lastName}`, gender: "MALE", dateOfBirth: null, groupId: null, campusId: null },
        actorId: parentId,
      })
    );

    const updatedBed = await prisma.bed.findUniqueOrThrow({ where: { id: bed.id } });
    expect(updatedBed.status).toBe("OCCUPIED");
    expect(updatedBed.staffProfileId).toBe(staff.id);
    const updatedStaff = await prisma.staffProfile.findUniqueOrThrow({ where: { id: staff.id } });
    expect(updatedStaff.assignedRoomId).toBe(room.id);
    expect(updatedStaff.assignedHostelId).toBe(hostel.id);
  });

  it("rejects assigning a camper to a bed already occupied by staff", async () => {
    const { room } = await makeHostelWithBeds("MALE", 1);
    const bed = await prisma.bed.findFirstOrThrow({ where: { roomId: room.id } });
    const staff = await makeApprovedStaff("MALE");

    await prisma.$transaction((tx) =>
      accommodationEngine.assignBedInTx(tx, {
        bedId: bed.id,
        occupant: { kind: "STAFF", staffProfileId: staff.id, name: `${staff.firstName} ${staff.lastName}`, gender: "MALE", dateOfBirth: null, groupId: null, campusId: null },
        actorId: parentId,
      })
    );

    const camper = await makeCamper("MALE");
    const registration = await approvedRegistrationFor(camper.id);

    await expect(
      prisma.$transaction((tx) =>
        accommodationEngine.assignBedInTx(tx, {
          bedId: bed.id,
          occupant: { kind: "CAMPER", registrationId: registration.id, name: camper.name, gender: "MALE", dateOfBirth: camper.dateOfBirth, groupId: null, campusId: campusId },
          actorId: parentId,
        })
      )
    ).rejects.toBeInstanceOf(accommodationEngine.BedAllocationError);
  });
});

describe("bulkAutoAssignBeds", () => {
  it("assigns CHECKED_IN campers but ignores COMPLETED campers", async () => {
    await prisma.camp.update({ where: { id: campId }, data: { bedAllocationRules: [{ criterion: "GROUP_TOGETHER", enabled: false }] } });
    await makeHostelWithBeds("MALE", 2);

    const checkedInCamper = await makeCamper("MALE");
    const checkedInRegistration = await approvedRegistrationFor(checkedInCamper.id);
    await prisma.registration.update({ where: { id: checkedInRegistration.id }, data: { status: "CHECKED_IN" } });

    const completedCamper = await makeCamper("MALE");
    const completedRegistration = await approvedRegistrationFor(completedCamper.id);
    await prisma.registration.update({ where: { id: completedRegistration.id }, data: { status: "COMPLETED" } });

    const results = await accommodationEngine.bulkAutoAssignBeds({ venueId, actorId: parentId });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ occupantKey: `camper:${checkedInRegistration.id}` });
    expect(results[0].bedId).toBeTruthy();
    expect((await prisma.registration.findUniqueOrThrow({ where: { id: completedRegistration.id } })).roomId).toBeNull();
  });

  it("preserves a camper bed assigned after a bulk preview", async () => {
    await prisma.camp.update({ where: { id: campId }, data: { bedAllocationRules: [{ criterion: "GROUP_TOGETHER", enabled: false }] } });
    const { room } = await makeHostelWithBeds("MALE", 2);
    const beds = await prisma.bed.findMany({ where: { roomId: room.id }, orderBy: { label: "asc" } });
    const camper = await makeCamper("MALE");
    const registration = await approvedRegistrationFor(camper.id);
    const occupant = { kind: "CAMPER" as const, registrationId: registration.id, name: camper.name, gender: "MALE", dateOfBirth: camper.dateOfBirth, groupId: null, campusId };

    await prisma.$transaction((tx) => accommodationEngine.assignBedInTx(tx, { bedId: beds[0].id, occupant, actorId: parentId }));
    const skipped = await prisma.$transaction((tx) => accommodationEngine.assignBedInTx(tx, {
      bedId: beds[1].id,
      occupant,
      actorId: parentId,
      preserveExistingAssignment: true,
    }));

    expect(skipped).toBeNull();
    expect((await prisma.bed.findUniqueOrThrow({ where: { id: beds[0].id } })).registrationId).toBe(registration.id);
    expect((await prisma.bed.findUniqueOrThrow({ where: { id: beds[1].id } })).registrationId).toBeNull();
  });

  it("assigns a mixed batch of campers and staff, and reports failures for the rest when capacity runs out", async () => {
    await prisma.camp.update({ where: { id: campId }, data: { bedAllocationRules: [{ criterion: "GROUP_TOGETHER", enabled: false }] } });
    await makeHostelWithBeds("MALE", 1);
    await makeHostelWithBeds("FEMALE", 1);

    const maleCamper = await makeCamper("MALE");
    const maleReg = await approvedRegistrationFor(maleCamper.id);
    const femaleStaff = await makeApprovedStaff("FEMALE", "TEACHER");
    // No matching bed for this one — only one MALE bed exists, already about to be taken.
    const extraMaleCamper = await makeCamper("MALE");
    const extraMaleReg = await approvedRegistrationFor(extraMaleCamper.id);

    const results = await accommodationEngine.bulkAutoAssignBeds({ venueId, actorId: parentId });

    const succeeded = results.filter((r) => r.bedId);
    const failed = results.filter((r) => r.error);
    expect(succeeded.length).toBe(2); // one MALE camper + one FEMALE staff
    expect(failed.length).toBe(1); // the second MALE camper has no bed left

    const updatedMaleReg = await prisma.registration.findUniqueOrThrow({ where: { id: maleReg.id } });
    expect(updatedMaleReg.roomId).toBeTruthy();
    const updatedStaff = await prisma.staffProfile.findUniqueOrThrow({ where: { id: femaleStaff.id } });
    expect(updatedStaff.assignedRoomId).toBeTruthy();
    const updatedExtraReg = await prisma.registration.findUniqueOrThrow({ where: { id: extraMaleReg.id } });
    expect(updatedExtraReg.roomId).toBeNull();
  });

  it("saves a teacher stranded in their own reserved bed's room once a different tribe's camper takes the other bed in it", async () => {
    // Reproduces the reported bug end-to-end: reserveBedsForStaff reads room
    // tribe occupancy before any camper has been placed, so it can reserve a
    // bed in a room that a *different* tribe's camper later shares — at
    // which point the teacher's own reserved bed becomes tribe-blocked for
    // them, with no retry, unless the staff fallback below exists.
    const tribeA = await prisma.tribe.create({ data: { campId, name: "Strand Alpha" } });
    const tribeB = await prisma.tribe.create({ data: { campId, name: "Strand Beta" } });

    const hostel = await prisma.hostel.create({ data: { organizationId: orgId, venueId, name: "Strand Hostel", gender: "MALE" } });
    const room1 = await prisma.room.create({ data: { hostelId: hostel.id, name: "Room 1", displayOrder: 1 } });
    const room2 = await prisma.room.create({ data: { hostelId: hostel.id, name: "Room 2", displayOrder: 2 } });
    await prisma.bed.create({ data: { roomId: room1.id, label: "Bed A" } });
    await prisma.bed.create({ data: { roomId: room1.id, label: "Bed B" } });
    await prisma.bed.create({ data: { roomId: room2.id, label: "Bed A" } });
    await prisma.bed.create({ data: { roomId: room2.id, label: "Bed B" } });

    const teacher = await makeApprovedStaff("MALE");
    await prisma.staffProfile.update({ where: { id: teacher.id }, data: { assignedTribeId: tribeA.id } });

    // Three tribeB campers exactly fill the three non-reserved beds — one of
    // them lands in Room 1 alongside the teacher's reserved bed.
    const tribeBRegistrationIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const camper = await makeCamper("MALE");
      const registration = await approvedRegistrationFor(camper.id);
      await prisma.registration.update({ where: { id: registration.id }, data: { tribeId: tribeB.id } });
      tribeBRegistrationIds.push(registration.id);
    }

    const results = await accommodationEngine.bulkAutoAssignBeds({ venueId, actorId: parentId });

    for (const id of tribeBRegistrationIds) {
      const result = results.find((r) => r.occupantKey === `camper:${id}`);
      expect(result?.bedId, `tribeB camper ${id}`).toBeTruthy();
    }

    const teacherResult = results.find((r) => r.occupantKey === `staff:${teacher.id}`);
    expect(teacherResult?.bedId).toBeTruthy();
    expect(teacherResult?.placedOutsideTribe).toBe(true);

    const updatedTeacher = await prisma.staffProfile.findUniqueOrThrow({ where: { id: teacher.id } });
    expect(updatedTeacher.assignedRoomId).toBe(room1.id);
  });

  it("refuses to run while bed allocation is disabled", async () => {
    await prisma.camp.update({ where: { id: campId }, data: { bedAllocationEnabled: false } });
    await expect(accommodationEngine.bulkAutoAssignBeds({ venueId, actorId: parentId })).rejects.toMatchObject({ code: "BED_ALLOCATION_DISABLED" });
  });
});
