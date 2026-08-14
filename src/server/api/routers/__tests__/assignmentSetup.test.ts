import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { appRouter } from "../../root";

const prisma = new PrismaClient();

let organizationId: string;
let adminId: string;
let campId: string;
let venueId: string;
let checkedInRegistrationId: string;

function caller() {
  return appRouter.createCaller({
    prisma,
    session: {
      user: { id: adminId, email: "assignment-admin@camply.test", role: "ADMIN", organizationId },
      expires: "",
    },
  });
}

beforeEach(async () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  const organization = await prisma.organization.create({ data: { name: `Assignment Setup ${suffix}` } });
  organizationId = organization.id;
  const admin = await prisma.user.create({
    data: { email: `assignment-admin-${suffix}@camply.test`, password: "x", role: "ADMIN", organizationId },
  });
  adminId = admin.id;
  const parent = await prisma.user.create({
    data: { email: `assignment-parent-${suffix}@camply.test`, password: "x", role: "PARENT", organizationId },
  });
  const campus = await prisma.campus.create({
    data: { name: `Campus ${suffix}`, slug: `campus-${suffix}`, address: "1 Test St", city: "Lagos", country: "Nigeria", campusCode: "AST", organizationId },
  });
  const camp = await prisma.camp.create({
    data: {
      name: `Camp ${suffix}`,
      slug: `camp-${suffix}`,
      year: 2026,
      startDate: new Date("2026-08-01T00:00:00.000Z"),
      endDate: new Date("2026-08-31T00:00:00.000Z"),
      organizationId,
      status: "OPEN",
      approvalMode: "AUTO",
      orgCode: "AST",
    },
  });
  campId = camp.id;
  const venue = await prisma.venue.create({ data: { name: `Venue ${suffix}`, campId, quota: 100 } });
  venueId = venue.id;
  const hostel = await prisma.hostel.create({ data: { name: "Hostel", organizationId, venueId } });
  const room = await prisma.room.create({ data: { name: "Room 1", hostelId: hostel.id } });
  await prisma.bed.create({ data: { label: "Bed 1", roomId: room.id } });

  const checkedInCamper = await prisma.camper.create({
    data: { name: "Checked In Camper", gender: "MALE", userId: parent.id, organizationId, homeCampusId: campus.id },
  });
  const checkedIn = await prisma.registration.create({
    data: { camperId: checkedInCamper.id, campId, campusId: campus.id, status: "CHECKED_IN" },
  });
  checkedInRegistrationId = checkedIn.id;

  const completedCamper = await prisma.camper.create({
    data: { name: "Completed Camper", gender: "MALE", userId: parent.id, organizationId, homeCampusId: campus.id },
  });
  await prisma.registration.create({
    data: { camperId: completedCamper.id, campId, campusId: campus.id, status: "COMPLETED" },
  });
});

afterEach(async () => {
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Assignment Setup active camper lifecycle", () => {
  it("includes CHECKED_IN campers in readiness while excluding COMPLETED campers", async () => {
    const readiness = await caller().accommodation.assignmentReadiness({ campId });

    expect(readiness.totals.approvedCampers).toBe(0);
    expect(readiness.totals.checkedInCampers).toBe(1);
    expect(readiness.totals.assignableCampers).toBe(1);
    expect(readiness.totals.campersWithoutVenue).toBe(1);
    expect(readiness.totals.campersWithoutTribe).toBe(1);
    expect(readiness.totals.checkedInCampersWithAssignmentGaps).toBe(1);
  });

  it("repairs only missing active-camper venues in a single-venue camp", async () => {
    const result = await caller().accommodation.assignUnassignedStaffToSoleVenue({ campId });

    expect(result).toMatchObject({ camperCount: 1, staffCount: 0, count: 1, venueId });
    expect((await prisma.registration.findUniqueOrThrow({ where: { id: checkedInRegistrationId } })).venueId).toBe(venueId);
    expect(await prisma.registration.count({ where: { campId, status: "COMPLETED", venueId: { not: null } } })).toBe(0);
  });
});
