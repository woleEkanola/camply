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

function caller(id: string, role: UserRole, email: string) {
  return appRouter.createCaller({ prisma, session: { user: { id, role, email, organizationId }, expires: "" } });
}

beforeAll(async () => {
  const organization = await prisma.organization.create({ data: { name: `Readiness ${stamp}`, slug: `readiness-${stamp}` } });
  organizationId = organization.id;
  const camp = await prisma.camp.create({
    data: { name: `Readiness ${stamp}`, slug: `readiness-camp-${stamp}`, year: 2026, startDate: new Date("2026-08-01"), endDate: new Date("2026-08-31"), organizationId, active: true, status: "OPEN", bedAllocationEnabled: true },
  });
  campId = camp.id;
  const campus = await prisma.campus.create({ data: { name: `Readiness Campus ${stamp}`, slug: `readiness-campus-${stamp}`, address: "1 Test St", city: "Lagos", country: "Nigeria", organizationId } });
  campusId = campus.id;
  const venue = await prisma.venue.create({ data: { name: `Readiness Venue ${stamp}`, campId, quota: 100, visible: true } });
  venueId = venue.id;
  const owner = await prisma.user.create({ data: { email: `readiness-owner-${stamp}@camply.test`, password: "x", role: "OWNER", organizationId } });
  ownerId = owner.id;

  // A FEMALE-only hostel with 2 free beds — no MALE or MIXED capacity at all.
  const hostel = await prisma.hostel.create({ data: { organizationId, venueId, name: "Readiness Hostel", gender: "FEMALE" } });
  const room = await prisma.room.create({ data: { hostelId: hostel.id, name: "Room 1" } });
  await prisma.bed.create({ data: { roomId: room.id, label: "Bed 1" } });
  await prisma.bed.create({ data: { roomId: room.id, label: "Bed 2" } });

  // Two unassigned MALE campers and one unassigned camper with no gender on file.
  for (const [label, gender] of [["Male One", "MALE"], ["Male Two", "MALE"], ["No Gender", null]] as const) {
    const parent = await prisma.user.create({ data: { email: `readiness-parent-${label.replace(/\s+/g, "")}-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId } });
    const camper = await prisma.camper.create({ data: { name: `${label} ${stamp}`, userId: parent.id, organizationId, homeCampusId: campusId, gender } });
    await prisma.registration.create({ data: { camperId: camper.id, campId, campusId, venueId, status: "APPROVED" } });
  }
});

afterAll(async () => {
  await prisma.registration.deleteMany({ where: { camp: { organizationId } } });
  await prisma.camper.deleteMany({ where: { organizationId } });
  await prisma.bed.deleteMany({ where: { room: { hostel: { venueId } } } });
  await prisma.room.deleteMany({ where: { hostel: { venueId } } });
  await prisma.hostel.deleteMany({ where: { venueId } });
  await prisma.venue.deleteMany({ where: { campId } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.campus.deleteMany({ where: { organizationId } });
  await prisma.camp.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } });
  await prisma.$disconnect();
});

describe("assignmentReadiness — gender-aware shortfall", () => {
  it("reports a MALE shortfall and a missing-gender person even though total free beds are non-zero", async () => {
    const owner = caller(ownerId, "OWNER", `readiness-owner-${stamp}@camply.test`);
    const readiness = await owner.accommodation.assignmentReadiness({ campId });
    const venue = readiness.venues.find((v) => v.id === venueId);
    expect(venue).toBeTruthy();

    // The old gender-blind capacityShortfall would read 0 here (2 unassigned... wait 3 people, 2 beds — still misleading either way since it never says WHICH gender is short).
    expect(venue!.availableBedsByGender).toMatchObject({ MALE: 0, FEMALE: 2, MIXED: 0 });
    expect(venue!.unassignedByGender).toMatchObject({ MALE: 2, FEMALE: 0, UNKNOWN: 1 });
    expect(venue!.genderShortfall.MALE).toBe(2);
    expect(venue!.genderShortfall.UNKNOWN).toBe(1);
    expect(venue!.missingGenderPeople).toHaveLength(1);
    expect(venue!.missingGenderPeople[0]).toMatchObject({ name: `No Gender ${stamp}`, kind: "CAMPER" });
  });
});
