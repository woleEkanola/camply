import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient, type RegistrationStatus } from "@prisma/client";
import { appRouter } from "../../root";

const prisma = new PrismaClient();

let orgId: string;
let campId: string;
let campusId: string;
let adminId: string;

beforeEach(async () => {
  const org = await prisma.organization.create({ data: { name: `Test Org ${Date.now()}-${Math.random()}` } });
  orgId = org.id;

  const camp = await prisma.camp.create({
    data: {
      name: `${Date.now()}`,
      slug: `test-${Date.now()}-${Math.random()}`,
      year: 2026,
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 11, 31),
      organizationId: orgId,
      status: "OPEN",
      approvalMode: "MANUAL",
      minAge: 10,
      maxAge: 17,
      ageCutoffDate: new Date(2026, 8, 1),
      orgCode: "TST",
    },
  });
  campId = camp.id;

  const campus = await prisma.campus.create({
    data: {
      name: `Test Campus ${Date.now()}`,
      slug: `test-campus-${Date.now()}-${Math.random()}`,
      address: "1 Test St",
      city: "Testville",
      country: "Testland",
      organizationId: orgId,
      campusCode: "TLC",
    },
  });
  campusId = campus.id;

  const admin = await prisma.user.create({
    data: { email: `admin-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "ADMIN", organizationId: orgId },
  });
  adminId = admin.id;
});

afterEach(async () => {
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

function adminCaller() {
  return appRouter.createCaller({
    prisma,
    session: {
      user: { id: adminId, email: "admin@test.com", role: "ADMIN", organizationId: orgId },
      expires: "",
    },
  } as any);
}

async function makeCamperAndReg(params: { name: string; dob: Date; status: RegistrationStatus; camperId?: string }) {
  const parent = await prisma.user.create({
    data: { email: `parent-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "PARENT", organizationId: orgId },
  });
  const camper =
    params.camperId
      ? await prisma.camper.findUniqueOrThrow({ where: { id: params.camperId } })
      : await prisma.camper.create({
          data: {
            name: params.name,
            firstName: params.name.split(" ")[0],
            lastName: params.name.split(" ")[1] ?? "",
            dateOfBirth: params.dob,
            gender: "Male",
            userId: parent.id,
            organizationId: orgId,
            homeCampusId: campusId,
          },
        });
  const reg = await prisma.registration.create({
    data: { camperId: camper.id, campId, campusId, status: params.status },
  });
  return { camper, reg };
}

describe("registrationRouter - duplicate detection", () => {
  it("getAdminListStats counts a camperId-based duplicate pair", async () => {
    const { camper } = await makeCamperAndReg({ name: "Dup CamperId", dob: new Date(2013, 0, 1), status: "PENDING" });
    await makeCamperAndReg({ name: "Dup CamperId", dob: new Date(2013, 0, 1), status: "APPROVED", camperId: camper.id });

    const caller = adminCaller();
    const stats = await caller.registration.getAdminListStats({ organizationId: orgId, campId });
    expect(stats.duplicateCount).toBe(2);
  });

  it("getAdminListStats counts a name+DOB duplicate pair across distinct Camper rows", async () => {
    await makeCamperAndReg({ name: "Name Dob Twin", dob: new Date(2012, 3, 4), status: "PENDING" });
    await makeCamperAndReg({ name: "Name Dob Twin", dob: new Date(2012, 3, 4), status: "REJECTED" });

    const caller = adminCaller();
    const stats = await caller.registration.getAdminListStats({ organizationId: orgId, campId });
    expect(stats.duplicateCount).toBe(2);
  });

  it("does not flag a lone registration as a duplicate", async () => {
    await makeCamperAndReg({ name: "Solo Camper", dob: new Date(2011, 6, 6), status: "PENDING" });

    const caller = adminCaller();
    const stats = await caller.registration.getAdminListStats({ organizationId: orgId, campId });
    expect(stats.duplicateCount).toBe(0);
  });

  it("adminList with duplicatesOnly groups siblings adjacently, best-status-first, with duplicateSiblings populated", async () => {
    const { camper } = await makeCamperAndReg({ name: "Grouped Camper", dob: new Date(2013, 2, 2), status: "REJECTED" });
    await makeCamperAndReg({ name: "Grouped Camper", dob: new Date(2013, 2, 2), status: "PENDING", camperId: camper.id });
    await makeCamperAndReg({ name: "Grouped Camper", dob: new Date(2013, 2, 2), status: "APPROVED", camperId: camper.id });
    // An unrelated, non-duplicate registration that must be excluded entirely.
    await makeCamperAndReg({ name: "Unrelated Camper", dob: new Date(2010, 1, 1), status: "PENDING" });

    const caller = adminCaller();
    const result = await caller.registration.adminList({ organizationId: orgId, campId, duplicatesOnly: true, limit: 25 });

    expect(result.items).toHaveLength(3);
    expect(result.items.every((item: any) => item.camperId === camper.id)).toBe(true);
    // Best-to-worst-for-keeping order: APPROVED, then PENDING, then REJECTED.
    expect(result.items.map((item: any) => item.status)).toEqual(["APPROVED", "PENDING", "REJECTED"]);
    for (const item of result.items as any[]) {
      expect(item.isDuplicate).toBe(true);
      expect(item.duplicateSiblings).toHaveLength(2);
      const siblingStatuses = item.duplicateSiblings.map((s: { status: string }) => s.status).sort();
      const expectedSiblingStatuses = ["APPROVED", "PENDING", "REJECTED"].filter((s) => s !== item.status).sort();
      expect(siblingStatuses).toEqual(expectedSiblingStatuses);
    }
    expect(result.nextCursor).toBeUndefined();
  });

  it("adminList without duplicatesOnly leaves non-duplicate rows with an empty duplicateSiblings array", async () => {
    await makeCamperAndReg({ name: "Plain Camper", dob: new Date(2014, 5, 5), status: "PENDING" });

    const caller = adminCaller();
    const result = await caller.registration.adminList({ organizationId: orgId, campId, limit: 25 });

    expect(result.items.length).toBeGreaterThan(0);
    for (const item of result.items as any[]) {
      expect(item.isDuplicate).toBe(false);
      expect(item.duplicateSiblings).toEqual([]);
    }
  });
});
