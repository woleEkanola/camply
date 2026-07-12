import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { assertDepartmentHasCapacity, DepartmentCapacityError, getDepartmentAvailability } from "../departmentCapacity";

const prisma = new PrismaClient();

let orgId: string;
let campId: string;

async function makeDepartment(maxCapacity: number | null) {
  return prisma.department.create({
    data: { organizationId: orgId, campId, name: `Dept ${Date.now()}-${Math.random()}`, maxCapacity },
  });
}

async function makeStaff(departmentId: string | null, status: "PENDING" | "APPROVED" | "REJECTED" = "PENDING") {
  const user = await prisma.user.create({
    data: { email: `dept-cap-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "PARENT", organizationId: orgId },
  });
  return prisma.staffProfile.create({
    data: {
      userId: user.id,
      organizationId: orgId,
      campId,
      type: "VOLUNTEER",
      status,
      firstName: "Test",
      lastName: "Staffer",
      phone: "555-0000",
      email: user.email,
      departmentId,
    },
  });
}

beforeEach(async () => {
  const orgName = `Dept Cap Org ${Date.now()}-${Math.random()}`;
  const org = await prisma.organization.create({ data: { name: orgName, slug: orgName.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '') } });
  orgId = org.id;

  const camp = await prisma.camp.create({
    data: {
      name: `${Date.now()}`,
      slug: `dept-cap-test-${Date.now()}-${Math.random()}`,
      year: 2026,
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 11, 31),
      organizationId: orgId,
      status: "OPEN",
      approvalMode: "AUTO",
      ageCutoffDate: new Date(2026, 8, 1),
      orgCode: "DCP",
    },
  });
  campId = camp.id;
});

afterEach(async () => {
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("assertDepartmentHasCapacity", () => {
  it("allows signup when maxCapacity is null (unlimited)", async () => {
    const dept = await makeDepartment(null);
    await expect(prisma.$transaction((tx) => assertDepartmentHasCapacity(tx, dept.id))).resolves.toBeUndefined();
  });

  it("allows signup while count is below maxCapacity", async () => {
    const dept = await makeDepartment(2);
    await makeStaff(dept.id, "PENDING");
    await expect(prisma.$transaction((tx) => assertDepartmentHasCapacity(tx, dept.id))).resolves.toBeUndefined();
  });

  it("rejects signup exactly at the maxCapacity boundary", async () => {
    const dept = await makeDepartment(1);
    await makeStaff(dept.id, "PENDING");
    await expect(prisma.$transaction((tx) => assertDepartmentHasCapacity(tx, dept.id))).rejects.toBeInstanceOf(
      DepartmentCapacityError
    );
  });

  it("rejects signup once over maxCapacity", async () => {
    const dept = await makeDepartment(1);
    await makeStaff(dept.id, "APPROVED");
    await makeStaff(dept.id, "PENDING");
    // No assertion needed pre-existing over capacity — just confirm the gate still rejects.
    await expect(prisma.$transaction((tx) => assertDepartmentHasCapacity(tx, dept.id))).rejects.toBeInstanceOf(
      DepartmentCapacityError
    );
  });

  it("counts both PENDING and APPROVED staff toward the cap", async () => {
    const dept = await makeDepartment(2);
    await makeStaff(dept.id, "PENDING");
    await makeStaff(dept.id, "APPROVED");
    await expect(prisma.$transaction((tx) => assertDepartmentHasCapacity(tx, dept.id))).rejects.toBeInstanceOf(
      DepartmentCapacityError
    );
  });

  it("does not count REJECTED staff toward the cap", async () => {
    const dept = await makeDepartment(1);
    await makeStaff(dept.id, "REJECTED");
    await expect(prisma.$transaction((tx) => assertDepartmentHasCapacity(tx, dept.id))).resolves.toBeUndefined();
  });

  it("throws when the department does not exist", async () => {
    await expect(prisma.$transaction((tx) => assertDepartmentHasCapacity(tx, "nonexistent-id"))).rejects.toBeInstanceOf(
      DepartmentCapacityError
    );
  });
});

describe("getDepartmentAvailability", () => {
  it("returns an empty map for an empty id list", async () => {
    const result = await getDepartmentAvailability(prisma, []);
    expect(result.size).toBe(0);
  });

  it("marks isFull false for unlimited departments regardless of count", async () => {
    const dept = await makeDepartment(null);
    await makeStaff(dept.id, "APPROVED");
    const result = await getDepartmentAvailability(prisma, [dept.id]);
    expect(result.get(dept.id)?.isFull).toBe(false);
  });

  it("marks isFull true once count reaches maxCapacity", async () => {
    const dept = await makeDepartment(1);
    await makeStaff(dept.id, "PENDING");
    const result = await getDepartmentAvailability(prisma, [dept.id]);
    expect(result.get(dept.id)?.isFull).toBe(true);
    expect(result.get(dept.id)?.count).toBe(1);
  });

  it("marks isFull false while under capacity", async () => {
    const dept = await makeDepartment(3);
    await makeStaff(dept.id, "PENDING");
    const result = await getDepartmentAvailability(prisma, [dept.id]);
    expect(result.get(dept.id)?.isFull).toBe(false);
    expect(result.get(dept.id)?.count).toBe(1);
  });
});
