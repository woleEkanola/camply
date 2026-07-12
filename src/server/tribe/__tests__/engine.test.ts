import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import * as regEngine from "../../registration/engine";
import * as tribeEngine from "../engine";

const prisma = new PrismaClient();

let orgId: string;
let campId: string;
let campusId: string;
let parentId: string;

async function makeCamper(gender = "MALE") {
  return prisma.camper.create({
    data: {
      name: "Tribe Test Camper",
      firstName: "Tribe",
      lastName: "Test",
      dateOfBirth: new Date(2013, 5, 1),
      gender,
      userId: parentId,
      organizationId: orgId,
      homeCampusId: campusId,
    },
  });
}

async function approvedRegistrationFor(camperId: string) {
  const draft = await regEngine.createDraft({ camperId: camperId, campId, campusId, actorId: parentId });
  return regEngine.submitRegistration({ registrationId: draft.id, actorId: parentId });
}

beforeEach(async () => {
  const orgName = `Tribe Org ${Date.now()}-${Math.random()}`;
  const org = await prisma.organization.create({ data: { name: orgName, slug: orgName.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '') } });
  orgId = org.id;

  const camp = await prisma.camp.create({
    data: {
      name: `${Date.now()}`,
      slug: `tribe-test-${Date.now()}-${Math.random()}`,
      year: 2026,
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 11, 31),
      organizationId: orgId,
      status: "OPEN",
      approvalMode: "AUTO",
      ageCutoffDate: new Date(2026, 8, 1),
      orgCode: "TRB",
      tribeAllocationEnabled: true,
      tribeAllocationMode: "MANUAL",
      tribeAllocationRules: [{ criterion: "POPULATION", enabled: true }],
    },
  });
  campId = camp.id;

  const campus = await prisma.campus.create({
    data: {
      name: `Tribe Campus ${Date.now()}`,
      slug: `tribe-campus-${Date.now()}-${Math.random()}`,
      address: "1 Test St",
      city: "Testville",
      country: "Testland",
      organizationId: orgId,
      campusCode: "TLC",
    },
  });
  campusId = campus.id;

  // Sole venue for the camp so approveRegistrationInTx auto-assigns it.
  await prisma.venue.create({
    data: {
      name: `Tribe Venue ${Date.now()}`,
      campId,
      quota: 100,
    },
  });

  const parent = await prisma.user.create({
    data: { email: `tribe-parent-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "PARENT", organizationId: orgId },
  });
  parentId = parent.id;
});

afterEach(async () => {
  // beforeEach creates a fresh Organization -> Camp/Campus -> Venue tree plus
  // a parent User per test case, but nothing ever deleted them — every run
  // left ~19 throwaway orgs sitting in the dev DB permanently. User has no
  // cascade from Organization (restrict), so delete it first; Organization's
  // cascade then takes care of Campus/Camp/Venue/Tribe/etc.
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("tribe suggestion", () => {
  it("returns null when no tribes exist", async () => {
    const camper = await makeCamper();
    const registration = await approvedRegistrationFor(camper.id);
    const suggestion = await tribeEngine.suggestTribe(prisma, registration.id);
    expect(suggestion).toBeNull();
  });

  it("suggests the lower-population tribe when balancing by population", async () => {
    const tribeA = await prisma.tribe.create({ data: { campId, name: "Green" } });
    const tribeB = await prisma.tribe.create({ data: { campId, name: "Blue" } });

    // Pre-fill Green with a camper so Blue has lower population.
    const filler = await makeCamper();
    const fillerReg = await approvedRegistrationFor(filler.id);
    await tribeEngine.assignTribe({ registrationId: fillerReg.id, tribeId: tribeA.id, actorId: parentId });

    const camper = await makeCamper();
    const registration = await approvedRegistrationFor(camper.id);
    const suggestion = await tribeEngine.suggestTribe(prisma, registration.id);

    expect(suggestion?.tribeId).toBe(tribeB.id);
  });

  it("excludes tribes that are at max capacity", async () => {
    const full = await prisma.tribe.create({ data: { campId, name: "Full Tribe", maxCapacity: 1 } });
    const open = await prisma.tribe.create({ data: { campId, name: "Open Tribe" } });

    const filler = await makeCamper();
    const fillerReg = await approvedRegistrationFor(filler.id);
    await tribeEngine.assignTribe({ registrationId: fillerReg.id, tribeId: full.id, actorId: parentId });

    const camper = await makeCamper();
    const registration = await approvedRegistrationFor(camper.id);
    const suggestion = await tribeEngine.suggestTribe(prisma, registration.id);

    expect(suggestion?.tribeId).toBe(open.id);
  });
});

describe("automatic assignment on approval", () => {
  it("assigns a tribe automatically when the camp is in AUTOMATIC mode", async () => {
    await prisma.camp.update({ where: { id: campId }, data: { tribeAllocationMode: "AUTOMATIC" } });
    await prisma.tribe.create({ data: { campId, name: "Auto Tribe" } });

    const camper = await makeCamper();
    const registration = await approvedRegistrationFor(camper.id);

    expect(registration.status).toBe("APPROVED");
    const updated = await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } });
    expect(updated.tribeId).toBeTruthy();
    expect(updated.tribeAssignmentMethod).toBe("AUTOMATIC");
  });

  it("does not block approval when no tribes are configured", async () => {
    const camper = await makeCamper();
    const registration = await approvedRegistrationFor(camper.id);
    expect(registration.status).toBe("APPROVED");
  });
});

describe("manual assignment and capacity enforcement", () => {
  it("rejects assignment to a full tribe", async () => {
    const tribe = await prisma.tribe.create({ data: { campId, name: "Tiny Tribe", maxCapacity: 1 } });

    const camperA = await makeCamper();
    const regA = await approvedRegistrationFor(camperA.id);
    await tribeEngine.assignTribe({ registrationId: regA.id, tribeId: tribe.id, actorId: parentId });

    const camperB = await makeCamper();
    const regB = await approvedRegistrationFor(camperB.id);

    await expect(
      tribeEngine.assignTribe({ registrationId: regB.id, tribeId: tribe.id, actorId: parentId })
    ).rejects.toBeInstanceOf(tribeEngine.TribeAllocationError);
  });

  it("records an audit event on assignment", async () => {
    const tribe = await prisma.tribe.create({ data: { campId, name: "Audited Tribe" } });
    const camper = await makeCamper();
    const registration = await approvedRegistrationFor(camper.id);

    await tribeEngine.assignTribe({ registrationId: registration.id, tribeId: tribe.id, actorId: parentId });

    const logs = await prisma.auditLog.findMany({ where: { registrationId: registration.id, action: { in: ["TRIBE_ASSIGNED", "TRIBE_CHANGED"] } } });
    expect(logs.length).toBeGreaterThan(0);
  });
});
