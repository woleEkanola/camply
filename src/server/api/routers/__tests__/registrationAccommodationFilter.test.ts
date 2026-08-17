import { afterEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { appRouter } from "../../root";

const prisma = new PrismaClient();

async function createFixture() {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const org = await prisma.organization.create({ data: { name: `Accommodation Filter Test ${stamp}` } });
  const admin = await prisma.user.create({
    data: { email: `admin-${stamp}@test.com`, password: "x", role: "ADMIN", organizationId: org.id },
  });
  const campus = await prisma.campus.create({
    data: {
      name: `Campus ${stamp}`,
      slug: `campus-${stamp}`,
      address: "1 Test Rd",
      city: "Lagos",
      country: "NG",
      organizationId: org.id,
    },
  });
  const camp = await prisma.camp.create({
    data: {
      name: `Camp ${stamp}`,
      slug: `camp-${stamp}`,
      year: 2026,
      startDate: new Date(),
      endDate: new Date(),
      organizationId: org.id,
    },
  });
  const venue = await prisma.venue.create({ data: { name: `Venue ${stamp}`, campId: camp.id } });
  const hostel = await prisma.hostel.create({ data: { organizationId: org.id, venueId: venue.id, name: `Hostel ${stamp}` } });
  const room = await prisma.room.create({ data: { hostelId: hostel.id, name: `Room ${stamp}` } });
  const bed = await prisma.bed.create({ data: { roomId: room.id, label: "Bed 1" } });

  async function makeRegistration(name: string, accommodationState: "UNASSIGNED" | "ROOM_ONLY" | "ASSIGNED") {
    const parent = await prisma.user.create({
      data: { email: `parent-${stamp}-${name}@test.com`, password: "x", role: "PARENT", organizationId: org.id },
    });
    const camper = await prisma.camper.create({
      data: { name, user: { connect: { id: parent.id } }, organization: { connect: { id: org.id } } },
    });
    const registration = await prisma.registration.create({
      data: {
        camperId: camper.id,
        campId: camp.id,
        campusId: campus.id,
        status: "APPROVED",
        ...(accommodationState !== "UNASSIGNED" && { roomId: room.id }),
      },
    });
    if (accommodationState === "ASSIGNED") {
      await prisma.bed.update({ where: { id: bed.id }, data: { registrationId: registration.id } });
    }
    return registration;
  }

  const unassigned = await makeRegistration("Unassigned Camper", "UNASSIGNED");
  const roomOnly = await makeRegistration("Room Only Camper", "ROOM_ONLY");
  const assigned = await makeRegistration("Assigned Camper", "ASSIGNED");

  return { org, admin, campus, camp, venue, hostel, room, bed, unassigned, roomOnly, assigned };
}

async function cleanup(orgId: string) {
  await prisma.bed.deleteMany({ where: { room: { hostel: { organizationId: orgId } } } });
  await prisma.room.deleteMany({ where: { hostel: { organizationId: orgId } } });
  await prisma.hostel.deleteMany({ where: { organizationId: orgId } });
  await prisma.registration.deleteMany({ where: { campus: { organizationId: orgId } } });
  await prisma.camper.deleteMany({ where: { organizationId: orgId } });
  await prisma.venue.deleteMany({ where: { camp: { organizationId: orgId } } });
  await prisma.camp.deleteMany({ where: { organizationId: orgId } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
}

describe("registration.adminList — accommodationState filter", () => {
  let orgId: string | undefined;
  let campusId: string | undefined;

  afterEach(async () => {
    if (orgId) await cleanup(orgId);
    if (campusId) await prisma.campus.deleteMany({ where: { id: campusId } });
    orgId = undefined;
    campusId = undefined;
  });

  function caller(fixture: Awaited<ReturnType<typeof createFixture>>) {
    return appRouter.createCaller({
      prisma,
      session: { user: { id: fixture.admin.id, email: fixture.admin.email, role: "ADMIN", organizationId: fixture.org.id }, expires: "" },
    } as any);
  }

  it("UNASSIGNED returns only registrations with no room", async () => {
    const fixture = await createFixture();
    orgId = fixture.org.id;
    campusId = fixture.campus.id;

    const result = await caller(fixture).registration.adminList({
      organizationId: fixture.org.id,
      campId: fixture.camp.id,
      accommodationState: "UNASSIGNED",
      limit: 50,
    });

    expect(result.items.map((r: any) => r.id)).toEqual([fixture.unassigned.id]);
  });

  it("ROOM_ONLY returns registrations with a room but no bed — reachable via assignCamperToRoomOnly", async () => {
    const fixture = await createFixture();
    orgId = fixture.org.id;
    campusId = fixture.campus.id;

    const result = await caller(fixture).registration.adminList({
      organizationId: fixture.org.id,
      campId: fixture.camp.id,
      accommodationState: "ROOM_ONLY",
      limit: 50,
    });

    expect(result.items.map((r: any) => r.id)).toEqual([fixture.roomOnly.id]);
  });

  it("ASSIGNED returns registrations with a bed", async () => {
    const fixture = await createFixture();
    orgId = fixture.org.id;
    campusId = fixture.campus.id;

    const result = await caller(fixture).registration.adminList({
      organizationId: fixture.org.id,
      campId: fixture.camp.id,
      accommodationState: "ASSIGNED",
      limit: 50,
    });

    expect(result.items.map((r: any) => r.id)).toEqual([fixture.assigned.id]);
  });

  it("getAdminListStats.unassignedBedCount counts only APPROVED/CHECKED_IN registrations with no room", async () => {
    const fixture = await createFixture();
    orgId = fixture.org.id;
    campusId = fixture.campus.id;

    const stats = await caller(fixture).registration.getAdminListStats({
      organizationId: fixture.org.id,
      campId: fixture.camp.id,
    });

    expect(stats.unassignedBedCount).toBe(1);
  });
});
