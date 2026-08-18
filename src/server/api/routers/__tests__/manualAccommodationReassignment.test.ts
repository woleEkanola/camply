import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type UserRole } from "@prisma/client";
import { appRouter } from "../../root";

const prisma = new PrismaClient();
const stamp = `${Date.now()}-${Math.random()}`.replace(".", "-");
let organizationId = "";
let campId = "";
let campusId = "";
let venueId = "";
let ownerId = "";
let hostelId = "";
let roomId = "";
let bed1Id = "";
let bed2Id = "";
let camperRegId = "";
let teacherProfileId = "";
let customFieldId = "";

function caller(id: string, role: UserRole, email: string) {
  return appRouter.createCaller({
    prisma,
    session: { user: { id, role, email, organizationId }, expires: "" },
  });
}

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { name: `SpaceTest Org ${stamp}`, slug: `spacetest-${stamp}` },
  });
  organizationId = org.id;

  const camp = await prisma.camp.create({
    data: {
      name: `SpaceTest Camp ${stamp}`,
      slug: `spacetest-camp-${stamp}`,
      year: 2026,
      startDate: new Date("2026-08-01"),
      endDate: new Date("2026-08-31"),
      organizationId,
      active: true,
      status: "OPEN",
      bedAllocationEnabled: true,
    },
  });
  campId = camp.id;

  const campus = await prisma.campus.create({
    data: {
      name: `SpaceTest Campus ${stamp}`,
      slug: `spacetest-campus-${stamp}`,
      address: "123 Camp Way",
      city: "Lagos",
      country: "Nigeria",
      organizationId,
    },
  });
  campusId = campus.id;

  const venue = await prisma.venue.create({
    data: { name: `SpaceTest Venue ${stamp}`, campId, quota: 50, visible: true },
  });
  venueId = venue.id;

  const owner = await prisma.user.create({
    data: {
      email: `spacetest-owner-${stamp}@camply.test`,
      password: "password123",
      role: "OWNER",
      organizationId,
    },
  });
  ownerId = owner.id;

  // Create custom form field
  const field = await prisma.formField.create({
    data: {
      organizationId,
      name: "favorite_scripture",
      label: "Favorite Scripture",
      type: "TEXT",
      audience: "TEACHER",
      source: "CUSTOM",
    },
  });
  customFieldId = field.id;

  // Create Hostel -> Floor -> Room -> Beds
  const hostel = await prisma.hostel.create({
    data: {
      organizationId,
      venueId,
      name: "Alpha Hostel",
      gender: "MALE",
    },
  });
  hostelId = hostel.id;

  const floor = await prisma.hostelFloor.create({
    data: {
      hostelId: hostel.id,
      name: "Floor 1",
      level: 1,
    },
  });

  const room = await prisma.room.create({
    data: {
      hostelId: hostel.id,
      floorId: floor.id,
      name: "Room 101",
      capacity: 2,
    },
  });
  roomId = room.id;

  const bed1 = await prisma.bed.create({
    data: { roomId: room.id, label: "Bed 1", status: "AVAILABLE" },
  });
  bed1Id = bed1.id;

  const bed2 = await prisma.bed.create({
    data: { roomId: room.id, label: "Bed 2", status: "AVAILABLE" },
  });
  bed2Id = bed2.id;

  // Create camper & registration
  const parent = await prisma.user.create({
    data: {
      email: `camper-parent-${stamp}@camply.test`,
      password: "password123",
      role: "PARENT",
      organizationId,
    },
  });
  const camper = await prisma.camper.create({
    data: {
      name: `Test Camper ${stamp}`,
      userId: parent.id,
      organizationId,
      homeCampusId: campusId,
      gender: "MALE",
    },
  });
  const reg = await prisma.registration.create({
    data: {
      camperId: camper.id,
      campId,
      campusId,
      venueId,
      status: "APPROVED",
    },
  });
  camperRegId = reg.id;

  // Create teacher user & profile
  const teacherUser = await prisma.user.create({
    data: {
      email: `teacher-${stamp}@camply.test`,
      password: "password123",
      role: "TEACHER",
      organizationId,
    },
  });
  const teacherProfile = await prisma.staffProfile.create({
    data: {
      userId: teacherUser.id,
      organizationId,
      campId,
      type: "TEACHER",
      status: "APPROVED",
      firstName: "Gabriel",
      lastName: "Doe",
      gender: "MALE",
      phone: "08012345678",
      email: teacherUser.email,
      assignedVenueId: venueId,
    },
  });
  teacherProfileId = teacherProfile.id;
});

afterAll(async () => {
  await prisma.staffFieldValue.deleteMany({ where: { staffProfileId: teacherProfileId } });
  await prisma.staffProfile.deleteMany({ where: { organizationId } });
  await prisma.formField.deleteMany({ where: { organizationId } });
  await prisma.registration.deleteMany({ where: { camp: { organizationId } } });
  await prisma.camper.deleteMany({ where: { organizationId } });
  await prisma.bed.deleteMany({ where: { room: { hostel: { venueId } } } });
  await prisma.room.deleteMany({ where: { hostel: { venueId } } });
  await prisma.hostelFloor.deleteMany({ where: { hostel: { venueId } } });
  await prisma.hostel.deleteMany({ where: { venueId } });
  await prisma.venue.deleteMany({ where: { campId } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.campus.deleteMany({ where: { organizationId } });
  await prisma.camp.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } });
  await prisma.$disconnect();
});

describe("Manual Accommodation Space Allocation & Reassignment", () => {
  it("getAvailableSpaces returns structured hostel hierarchy and availability counts", async () => {
    const admin = caller(ownerId, "OWNER", `spacetest-owner-${stamp}@camply.test`);
    const spaces = await admin.accommodation.getAvailableSpaces({
      organizationId,
      campId,
      venueId,
      gender: "MALE",
      occupantType: "CAMPER",
    });

    expect(spaces.totalCapacity).toBe(2);
    expect(spaces.totalAvailableBeds).toBe(2);
    expect(spaces.hasAvailableSpace).toBe(true);
    expect(spaces.hostels).toHaveLength(1);

    const hostel = spaces.hostels[0];
    expect(hostel.name).toBe("Alpha Hostel");
    expect(hostel.isGenderCompatible).toBe(true);
    expect(hostel.availableBedsCount).toBe(2);
    expect(hostel.rooms).toHaveLength(1);

    const room = hostel.rooms[0];
    expect(room.name).toBe("Room 101");
    expect(room.beds).toHaveLength(2);
    expect(room.beds[0].isAvailable).toBe(true);
  });

  it("assignCamperToBed successfully assigns a camper and marks bed occupied", async () => {
    const admin = caller(ownerId, "OWNER", `spacetest-owner-${stamp}@camply.test`);
    const res = await admin.accommodation.assignCamperToBed({
      registrationId: camperRegId,
      bedId: bed1Id,
    });
    expect(res.success).toBe(true);

    const updatedBed = await prisma.bed.findUnique({ where: { id: bed1Id } });
    expect(updatedBed?.status).toBe("OCCUPIED");
    expect(updatedBed?.registrationId).toBe(camperRegId);

    const updatedReg = await prisma.registration.findUnique({ where: { id: camperRegId } });
    expect(updatedReg?.roomId).toBe(roomId);
  });

  it("assignStaffToBed assigns teacher to second bed and unassignStaffFromBed releases it", async () => {
    const admin = caller(ownerId, "OWNER", `spacetest-owner-${stamp}@camply.test`);
    const assignRes = await admin.accommodation.assignStaffToBed({
      staffProfileId: teacherProfileId,
      bedId: bed2Id,
    });
    expect(assignRes.success).toBe(true);

    const bed2 = await prisma.bed.findUnique({ where: { id: bed2Id } });
    expect(bed2?.status).toBe("OCCUPIED");
    expect(bed2?.staffProfileId).toBe(teacherProfileId);

    const staff = await prisma.staffProfile.findUnique({ where: { id: teacherProfileId } });
    expect(staff?.assignedRoomId).toBe(roomId);
    expect(staff?.assignedHostelId).toBe(hostelId);

    // Spaces query should now show 0 available beds
    const spaces = await admin.accommodation.getAvailableSpaces({
      organizationId,
      campId,
      venueId,
    });
    expect(spaces.totalAvailableBeds).toBe(0);
    expect(spaces.hasAvailableSpace).toBe(false);

    // Unassign staff
    const unassignRes = await admin.accommodation.unassignStaffFromBed({
      staffProfileId: teacherProfileId,
    });
    expect(unassignRes.success).toBe(true);

    const bed2After = await prisma.bed.findUnique({ where: { id: bed2Id } });
    expect(bed2After?.status).toBe("AVAILABLE");
    expect(bed2After?.staffProfileId).toBeNull();

    const staffAfter = await prisma.staffProfile.findUnique({ where: { id: teacherProfileId } });
    expect(staffAfter?.assignedRoomId).toBeNull();
  });
});

describe("Teacher / Staff Profile Admin Editing", () => {
  it("staff.adminUpdateProfile updates profile details and custom field values", async () => {
    const admin = caller(ownerId, "OWNER", `spacetest-owner-${stamp}@camply.test`);

    const updated = await admin.staff.adminUpdateProfile({
      id: teacherProfileId,
      firstName: "Gabriel Updated",
      lastName: "Doe Senior",
      preferredName: "Gabe",
      phone: "08099998888",
      church: "Grace Assembly",
      churchDepartment: "Youth Ministry",
      yearsServing: "5 years",
      allergies: "Peanuts",
      medicalConditions: "None",
      emergencyContactName: "Jane Doe",
      emergencyContactPhone: "08011112222",
      emergencyContactRelationship: "Wife",
      fieldValues: [
        {
          fieldId: customFieldId,
          value: "Romans 8:28",
        },
      ],
    });

    expect(updated.firstName).toBe("Gabriel Updated");
    expect(updated.lastName).toBe("Doe Senior");
    expect(updated.preferredName).toBe("Gabe");
    expect(updated.phone).toBe("08099998888");
    expect(updated.church).toBe("Grace Assembly");
    expect(updated.allergies).toBe("Peanuts");
    expect(updated.emergencyContactName).toBe("Jane Doe");

    // Verify custom field value saved in DB
    const fv = await prisma.staffFieldValue.findUnique({
      where: {
        fieldId_staffProfileId: {
          fieldId: customFieldId,
          staffProfileId: teacherProfileId,
        },
      },
    });
    expect(fv?.value).toBe("Romans 8:28");
  });
});
