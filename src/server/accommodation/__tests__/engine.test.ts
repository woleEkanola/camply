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
  const orgName = `Bed Org ${Date.now()}-${Math.random()}`;
  const org = await prisma.organization.create({ data: { name: orgName, slug: orgName.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '') } });
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
  it("never suggests a bed in a hostel of the wrong gender", async () => {
    await makeHostelWithBeds("FEMALE", 2);
    const { room: maleRoom } = await makeHostelWithBeds("MALE", 2);

    const camper = await makeCamper("MALE");
    const registration = await approvedRegistrationFor(camper.id);
    const suggestion = await accommodationEngine.suggestBed(prisma, venueId, {
      kind: "CAMPER",
      registrationId: registration.id,
      gender: "MALE",
      dateOfBirth: camper.dateOfBirth,
      groupId: registration.tribeId,
      campusId: registration.campusId,
    });

    expect(suggestion?.roomId).toBe(maleRoom.id);
  });

  it("returns null when no beds of the matching gender are available", async () => {
    await makeHostelWithBeds("FEMALE", 2);

    const camper = await makeCamper("MALE");
    const registration = await approvedRegistrationFor(camper.id);
    const suggestion = await accommodationEngine.suggestBed(prisma, venueId, {
      kind: "CAMPER",
      registrationId: registration.id,
      gender: "MALE",
      dateOfBirth: camper.dateOfBirth,
      groupId: registration.tribeId,
      campusId: registration.campusId,
    });

    expect(suggestion).toBeNull();
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

    const suggestion = await accommodationEngine.suggestBed(prisma, venueId, {
      kind: "CAMPER",
      registrationId: registration.id,
      gender: "MALE",
      dateOfBirth: camper.dateOfBirth,
      groupId: tribe.id,
      campusId: registration.campusId,
    });

    expect(suggestion?.roomId).toBe(roomA.id);
    expect(suggestion?.roomId).not.toBe(roomB.id);
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
        occupant: { kind: "CAMPER", registrationId: registration.id, gender: "MALE", dateOfBirth: camper.dateOfBirth, groupId: null, campusId: campusId },
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
        occupant: { kind: "STAFF", staffProfileId: staff.id, gender: "MALE", dateOfBirth: null, groupId: null, campusId: null },
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
        occupant: { kind: "STAFF", staffProfileId: staff.id, gender: "MALE", dateOfBirth: null, groupId: null, campusId: null },
        actorId: parentId,
      })
    );

    const camper = await makeCamper("MALE");
    const registration = await approvedRegistrationFor(camper.id);

    await expect(
      prisma.$transaction((tx) =>
        accommodationEngine.assignBedInTx(tx, {
          bedId: bed.id,
          occupant: { kind: "CAMPER", registrationId: registration.id, gender: "MALE", dateOfBirth: camper.dateOfBirth, groupId: null, campusId: campusId },
          actorId: parentId,
        })
      )
    ).rejects.toBeInstanceOf(accommodationEngine.BedAllocationError);
  });
});

describe("bulkAutoAssignBeds", () => {
  it("assigns a mixed batch of campers and staff, and reports failures for the rest when capacity runs out", async () => {
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
});
