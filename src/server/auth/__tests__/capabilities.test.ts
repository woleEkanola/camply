import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { getUserCapabilities, hasStaffCapability, hasMultipleContexts } from "../capabilities";

const prisma = new PrismaClient();

const stamp = `${Date.now()}-${Math.random()}`;
let orgId: string;
let campId: string;
let campusId: string;
const createdUserIds: string[] = [];

async function makeUser(role: string, email: string) {
  const user = await prisma.user.create({
    data: { email, password: "x", role: role as never, organizationId: orgId },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeStaffProfile(userId: string, type: "TEACHER" | "VOLUNTEER", status: string) {
  return prisma.staffProfile.create({
    data: {
      userId,
      organizationId: orgId,
      campId,
      type: type as never,
      status: status as never,
      firstName: "S",
      lastName: "T",
      phone: "1234567890",
      email: `profile-${Math.random()}@camply.test`,
    },
  });
}

async function makeCamper(userId: string) {
  return prisma.camper.create({
    data: {
      name: "Cap Camper",
      firstName: "Cap",
      lastName: "Camper",
      gender: "Male",
      dateOfBirth: new Date(2013, 5, 1),
      userId,
      organizationId: orgId,
      homeCampusId: campusId,
    },
  });
}

beforeAll(async () => {
  const org = await prisma.organization.create({ data: { name: `Cap Org ${stamp}` } });
  orgId = org.id;
  const camp = await prisma.camp.create({
    data: {
      name: `Cap Camp ${stamp}`,
      slug: `cap-camp-${stamp}`,
      year: 2026,
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 11, 31),
      organizationId: orgId,
      status: "OPEN",
      approvalMode: "MANUAL",
      minAge: 10,
      maxAge: 17,
      ageCutoffDate: new Date(2026, 8, 1),
      orgCode: "CAP",
    },
  });
  campId = camp.id;
  const campus = await prisma.campus.create({
    data: {
      name: `Cap Campus ${stamp}`,
      slug: `cap-campus-${stamp}`,
      address: "1 Test St",
      city: "Testville",
      country: "Testland",
      organizationId: orgId,
      campusCode: "CAP",
    },
  });
  campusId = campus.id;
});

afterAll(async () => {
  await prisma.staffProfile.deleteMany({ where: { organizationId: orgId } });
  await prisma.camper.deleteMany({ where: { organizationId: orgId } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.campus.deleteMany({ where: { organizationId: orgId } });
  await prisma.camp.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

describe("getUserCapabilities", () => {
  it("gives a plain parent only parent capability", async () => {
    const user = await makeUser("PARENT", `cap-parent-${stamp}@camply.test`);
    await makeCamper(user.id);

    const caps = await getUserCapabilities(user.id);
    expect(caps.parent).toBe(true);
    expect(caps.staff).toEqual([]);
    expect(caps.orgAdmin).toBe(false);
    expect(hasMultipleContexts(caps)).toBe(false);
  });

  it("gives a legacy TEACHER staff capability from role alone", async () => {
    // Accounts predating this model carry the type in `role` and may have no
    // APPROVED profile — they must not lose access.
    const user = await makeUser("TEACHER", `cap-teacher-${stamp}@camply.test`);

    const caps = await getUserCapabilities(user.id);
    expect(caps.staff).toContain("TEACHER");
    expect(caps.parent).toBe(false);
  });

  it("gives a parent who also teaches BOTH capabilities", async () => {
    // The case this whole change exists for.
    const user = await makeUser("PARENT", `cap-both-${stamp}@camply.test`);
    await makeCamper(user.id);
    await makeStaffProfile(user.id, "TEACHER", "APPROVED");

    const caps = await getUserCapabilities(user.id);
    expect(caps.parent).toBe(true);
    expect(caps.staff).toContain("TEACHER");
    expect(hasMultipleContexts(caps)).toBe(true);
  });

  it("does NOT grant staff capability for a PENDING profile", async () => {
    // An application is not an approval — this is the security-relevant case.
    const user = await makeUser("PARENT", `cap-pending-${stamp}@camply.test`);
    await makeStaffProfile(user.id, "TEACHER", "PENDING");

    const caps = await getUserCapabilities(user.id);
    expect(caps.staff).toEqual([]);
    expect(await hasStaffCapability(user.id)).toBe(false);
  });

  it("does NOT grant staff capability for a soft-deleted profile", async () => {
    const user = await makeUser("PARENT", `cap-deleted-${stamp}@camply.test`);
    const profile = await makeStaffProfile(user.id, "VOLUNTEER", "APPROVED");
    await prisma.staffProfile.update({ where: { id: profile.id }, data: { deletedAt: new Date() } });

    expect(await hasStaffCapability(user.id)).toBe(false);
  });

  it("treats an admin who is also a parent as having both", async () => {
    const user = await makeUser("ADMIN", `cap-admin-parent-${stamp}@camply.test`);
    await makeCamper(user.id);

    const caps = await getUserCapabilities(user.id);
    expect(caps.orgAdmin).toBe(true);
    expect(caps.parent).toBe(true);
    expect(hasMultipleContexts(caps)).toBe(true);
  });

  it("returns empty capabilities for an unknown user", async () => {
    const caps = await getUserCapabilities("does-not-exist");
    expect(caps).toEqual({ parent: false, staff: [], orgAdmin: false, campusRep: false });
  });
});

describe("hasStaffCapability", () => {
  it("narrows by type", async () => {
    const user = await makeUser("PARENT", `cap-narrow-${stamp}@camply.test`);
    await makeStaffProfile(user.id, "VOLUNTEER", "APPROVED");

    expect(await hasStaffCapability(user.id, { type: "VOLUNTEER" })).toBe(true);
    expect(await hasStaffCapability(user.id, { type: "TEACHER" })).toBe(false);
    expect(await hasStaffCapability(user.id)).toBe(true);
  });

  it("scopes by organization", async () => {
    const user = await makeUser("PARENT", `cap-org-${stamp}@camply.test`);
    await makeStaffProfile(user.id, "TEACHER", "APPROVED");

    expect(await hasStaffCapability(user.id, { organizationId: orgId })).toBe(true);
    expect(await hasStaffCapability(user.id, { organizationId: "other-org" })).toBe(false);
  });
});
