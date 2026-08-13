import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { appRouter } from "../../root";

const prisma = new PrismaClient();
const stamp = `${Date.now()}-${Math.random()}`.replace(".", "-");
let attackerOrgId = "";
let victimOrgId = "";
let attackerId = "";
let victimCampId = "";
let victimCamperId = "";
let victimRegistrationId = "";
let victimVenueId = "";

const caller = () => appRouter.createCaller({
  prisma,
  session: { user: { id: attackerId, email: `attacker-${stamp}@camply.test`, role: "ADMIN", organizationId: attackerOrgId }, expires: "" },
});

beforeAll(async () => {
  const [attackerOrg, victimOrg] = await Promise.all([
    prisma.organization.create({ data: { name: `Attacker ${stamp}` } }),
    prisma.organization.create({ data: { name: `Victim ${stamp}` } }),
  ]);
  attackerOrgId = attackerOrg.id;
  victimOrgId = victimOrg.id;
  const attacker = await prisma.user.create({ data: { email: `attacker-${stamp}@camply.test`, password: "x", role: "ADMIN", organizationId: attackerOrgId } });
  const parent = await prisma.user.create({ data: { email: `victim-parent-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId: victimOrgId } });
  attackerId = attacker.id;
  const camp = await prisma.camp.create({ data: { name: `Victim Camp ${stamp}`, slug: `victim-camp-${stamp}`, year: 2026, organizationId: victimOrgId, startDate: new Date("2026-08-13T00:00:00Z"), endDate: new Date("2026-08-15T00:00:00Z") } });
  const campus = await prisma.campus.create({ data: { name: `Victim Campus ${stamp}`, slug: `victim-campus-${stamp}`, address: "1 Safe Road", city: "Lagos", country: "Nigeria", organizationId: victimOrgId } });
  const venue = await prisma.venue.create({ data: { name: `Victim Venue ${stamp}`, campId: camp.id } });
  await prisma.hostel.create({ data: { name: `Victim Hostel ${stamp}`, organizationId: victimOrgId, venueId: venue.id, gender: "MALE" } });
  await prisma.tribe.create({ data: { name: `Victim Tribe ${stamp}`, campId: camp.id } });
  const camper = await prisma.camper.create({ data: { name: "Protected Camper", firstName: "Protected", lastName: "Camper", userId: parent.id, organizationId: victimOrgId, homeCampusId: campus.id, gender: "MALE" } });
  const registration = await prisma.registration.create({ data: { camperId: camper.id, campId: camp.id, campusId: campus.id, status: "APPROVED" } });
  victimCampId = camp.id;
  victimCamperId = camper.id;
  victimRegistrationId = registration.id;
  victimVenueId = venue.id;
});

afterAll(async () => {
  await prisma.camp.deleteMany({ where: { organizationId: { in: [attackerOrgId, victimOrgId] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [attackerOrgId, victimOrgId] } } });
  await prisma.$disconnect();
});

describe("cross-tenant authorization", () => {
  it("blocks a foreign roster and camper profile", async () => {
    await expect(caller().registration.getByOrganizationAndYear({ organizationId: victimOrgId, campId: victimCampId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller().camper.getById({ id: victimCamperId })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not bulk-delete a foreign registration", async () => {
    const result = await caller().registration.bulkSoftDelete({ ids: [victimRegistrationId] });
    expect(result.succeeded).toBe(0);
    expect(await prisma.registration.findUniqueOrThrow({ where: { id: victimRegistrationId } })).toMatchObject({ deletedAt: null });
  });

  it("blocks foreign sleeping maps and tribes", async () => {
    await expect(caller().accommodation.listHostels({ venueId: victimVenueId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller().tribe.listByCamp({ campId: victimCampId })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
