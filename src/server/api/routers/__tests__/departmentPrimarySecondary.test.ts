import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type UserRole } from "@prisma/client";
import { appRouter } from "../../root";

const prisma = new PrismaClient();
const stamp = `${Date.now()}-${Math.random()}`.replace(".", "-");
let organizationId = "";
let campId = "";
let ownerId = "";

function caller(id: string, role: UserRole, email: string) {
  return appRouter.createCaller({ prisma, session: { user: { id, role, email, organizationId }, expires: "" } });
}

beforeAll(async () => {
  const organization = await prisma.organization.create({ data: { name: `Primary Secondary ${stamp}`, slug: `primary-secondary-${stamp}` } });
  organizationId = organization.id;
  const camp = await prisma.camp.create({
    data: { name: `Primary Secondary ${stamp}`, slug: `primary-secondary-camp-${stamp}`, year: 2026, startDate: new Date("2026-08-01"), endDate: new Date("2026-08-31"), organizationId, active: true, status: "OPEN" },
  });
  campId = camp.id;
  await prisma.organization.update({ where: { id: organizationId }, data: { activeCampId: campId } });
  const owner = await prisma.user.create({ data: { email: `primary-secondary-owner-${stamp}@camply.test`, password: "x", role: "OWNER", organizationId } });
  ownerId = owner.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } });
  await prisma.$disconnect();
});

describe("primary/secondary department assignment", () => {
  it("persists isPrimary on the assignment row and promotes a secondary to primary without recreating it", async () => {
    const owner = caller(ownerId, "OWNER", `primary-secondary-owner-${stamp}@camply.test`);
    const registration = await prisma.department.create({ data: { organizationId, campId, name: "Registration", status: "ACTIVE" } });
    const medical = await prisma.department.create({ data: { organizationId, campId, name: "Medical", status: "ACTIVE" } });
    const regPosition = await prisma.position.create({ data: { campId, departmentId: registration.id, name: "Registration Member", roleKind: "MEMBER" } });
    const medPosition = await prisma.position.create({ data: { campId, departmentId: medical.id, name: "Medical Member", roleKind: "MEMBER" } });

    const teacherUser = await prisma.user.create({ data: { email: `ps-teacher-${stamp}@camply.test`, password: "x", role: "TEACHER", organizationId } });
    const teacher = await prisma.staffProfile.create({ data: { userId: teacherUser.id, organizationId, campId, type: "TEACHER", status: "APPROVED", firstName: "Primary", lastName: "Secondary", phone: "08099998888", email: teacherUser.email } });

    await owner.departmentOperations.assignPerson({ positionId: regPosition.id, staffId: teacher.id, secondary: false });
    await owner.departmentOperations.assignPerson({ positionId: medPosition.id, staffId: teacher.id, secondary: true });

    const regAssignment = await prisma.positionAssignment.findFirstOrThrow({ where: { staffId: teacher.id, positionId: regPosition.id, isCurrent: true } });
    const medAssignment = await prisma.positionAssignment.findFirstOrThrow({ where: { staffId: teacher.id, positionId: medPosition.id, isCurrent: true } });
    expect(regAssignment.isPrimary).toBe(true);
    expect(medAssignment.isPrimary).toBe(false);

    const memberships = await owner.departmentOperations.staffDepartmentMemberships({ staffId: teacher.id });
    expect(memberships.find((item) => item.departmentId === registration.id)).toMatchObject({ isPrimary: true });
    expect(memberships.find((item) => item.departmentId === medical.id)).toMatchObject({ isPrimary: false });

    await owner.departmentOperations.setPrimaryDepartment({ staffId: teacher.id, departmentId: medical.id });

    const teacherAfter = await prisma.staffProfile.findUniqueOrThrow({ where: { id: teacher.id } });
    expect(teacherAfter.departmentId).toBe(medical.id);
    const regAssignmentAfter = await prisma.positionAssignment.findUniqueOrThrow({ where: { id: regAssignment.id } });
    const medAssignmentAfter = await prisma.positionAssignment.findUniqueOrThrow({ where: { id: medAssignment.id } });
    // Same assignment rows — promoted in place, not torn down and recreated.
    expect(regAssignmentAfter.isPrimary).toBe(false);
    expect(medAssignmentAfter.isPrimary).toBe(true);
    expect(regAssignmentAfter.isCurrent).toBe(true);
    expect(medAssignmentAfter.isCurrent).toBe(true);

    const membershipsAfter = await owner.departmentOperations.staffDepartmentMemberships({ staffId: teacher.id });
    expect(membershipsAfter.find((item) => item.departmentId === medical.id)).toMatchObject({ isPrimary: true });
    expect(membershipsAfter.find((item) => item.departmentId === registration.id)).toMatchObject({ isPrimary: false });
  });

  it("refuses to promote a department the person has no current role in", async () => {
    const owner = caller(ownerId, "OWNER", `primary-secondary-owner-${stamp}@camply.test`);
    const unrelated = await prisma.department.create({ data: { organizationId, campId, name: "Unrelated Dept", status: "ACTIVE" } });
    const teacherUser = await prisma.user.create({ data: { email: `ps-lone-${stamp}@camply.test`, password: "x", role: "TEACHER", organizationId } });
    const teacher = await prisma.staffProfile.create({ data: { userId: teacherUser.id, organizationId, campId, type: "TEACHER", status: "APPROVED", firstName: "Lone", lastName: "Teacher", phone: "08077778888", email: teacherUser.email } });

    await expect(owner.departmentOperations.setPrimaryDepartment({ staffId: teacher.id, departmentId: unrelated.id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
