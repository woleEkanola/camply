import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type UserRole } from "@prisma/client";
import { appRouter } from "../../root";

const prisma = new PrismaClient();
const stamp = `${Date.now()}-${Math.random()}`.replace(".", "-");
let organizationId = "";
let campId = "";
let ownerId = "";
let volunteerUserId = "";
let volunteerStaffId = "";
let vmdId = "";
let hallLeadPositionId = "";

function caller(id: string, role: UserRole, email: string) {
  return appRouter.createCaller({ prisma, session: { user: { id, role, email, organizationId }, expires: "" } });
}

beforeAll(async () => {
  const organization = await prisma.organization.create({ data: { name: `Department Ops ${stamp}`, slug: `department-ops-${stamp}` } });
  organizationId = organization.id;
  const camp = await prisma.camp.create({
    data: { name: `Department Ops ${stamp}`, slug: `department-ops-camp-${stamp}`, year: 2026, startDate: new Date("2026-08-01"), endDate: new Date("2026-08-31"), organizationId, active: true, status: "OPEN" },
  });
  campId = camp.id;
  await prisma.organization.update({ where: { id: organizationId }, data: { activeCampId: campId } });
  const owner = await prisma.user.create({ data: { email: `dept-owner-${stamp}@camply.test`, password: "x", role: "OWNER", organizationId } });
  ownerId = owner.id;
  const volunteer = await prisma.user.create({ data: { email: `dept-volunteer-${stamp}@camply.test`, password: "x", role: "VOLUNTEER", organizationId } });
  volunteerUserId = volunteer.id;
  const profile = await prisma.staffProfile.create({ data: { userId: volunteer.id, organizationId, campId, type: "VOLUNTEER", status: "APPROVED", firstName: "VMD", lastName: "Volunteer", phone: "08000000000", email: volunteer.email } });
  volunteerStaffId = profile.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } });
  await prisma.$disconnect();
});

describe("JD-driven department operations", () => {
  it("installs the entire JD idempotently and provisions assistant leaders", async () => {
    const owner = caller(ownerId, "OWNER", `dept-owner-${stamp}@camply.test`);
    const first = await owner.departmentOperations.installJd({ campId, overwriteExisting: false });
    expect(first.departmentsCreated).toBe(20);
    expect(first.checklistItemsCreated).toBe(320);
    const second = await owner.departmentOperations.installJd({ campId, overwriteExisting: false });
    expect(second.departmentsCreated).toBe(0);
    expect(second.checklistItemsCreated).toBe(0);

    const departments = await prisma.department.findMany({ where: { campId, deletedAt: null } });
    expect(departments).toHaveLength(20);
    const vmd = departments.find((department) => department.name === "Venue Management Department (VMD)");
    expect(vmd).toBeTruthy();
    vmdId = vmd!.id;
    const assistant = await prisma.position.findFirst({ where: { departmentId: vmdId, roleKind: "ASSISTANT_HEAD", deletedAt: null } });
    expect(assistant?.name).toContain("Assistant Leader");
    expect(await prisma.positionAssignment.count({ where: { positionId: assistant!.id } })).toBe(0);
    const hallLead = await prisma.position.findFirstOrThrow({ where: { departmentId: vmdId, name: "VMD Hall & Environs Lead" } });
    hallLeadPositionId = hallLead.id;
    expect(hallLead.responsibilities).toContain("Arrange chairs according to programme requirements.");

    const coverage = await prisma.department.findMany({
      where: { campId, name: { in: ["Registration", "Prayer", "Medical", "Security", "Food & Catering", "Tribe Heads"] } },
      include: { positions: true, checklistItems: true },
    });
    expect(coverage.map((department) => department.name).sort()).toEqual(["Food & Catering", "Medical", "Prayer", "Registration", "Security", "Tribe Heads"].sort());
    for (const department of coverage) {
      expect(department.purpose, `${department.name} purpose`).toBeTruthy();
      expect(department.responsibilities.length, `${department.name} responsibilities`).toBeGreaterThan(0);
      expect(department.successMeasures.length, `${department.name} success measures`).toBeGreaterThan(0);
      expect(department.positions.length, `${department.name} roles`).toBeGreaterThanOrEqual(2);
      expect(department.checklistItems.length, `${department.name} checklist`).toBeGreaterThan(0);
    }
  });

  it("assigns existing staff, mirrors hierarchy, and exposes role-specific mobile duties", async () => {
    const owner = caller(ownerId, "OWNER", `dept-owner-${stamp}@camply.test`);
    await owner.departmentOperations.assignPerson({ positionId: hallLeadPositionId, staffId: volunteerStaffId, temporary: false });
    expect(await prisma.staffProfile.findUniqueOrThrow({ where: { id: volunteerStaffId } })).toMatchObject({ departmentId: vmdId });

    for (const search of ["VMD Volunteer", `dept-volunteer-${stamp}@camply.test`, "08000000000", "Hall Environs"]) {
      const matches = await owner.departmentOperations.list({ campId, date: "2026-08-12", includeInactive: true, search });
      expect(matches.map((department) => department.id), search).toContain(vmdId);
    }

    const volunteer = caller(volunteerUserId, "VOLUNTEER", `dept-volunteer-${stamp}@camply.test`);
    const workspace = await volunteer.departmentOperations.myDepartment({ campId, date: "2026-08-12" });
    expect(workspace?.department.name).toBe("Venue Management Department (VMD)");
    expect(workspace?.department.positions.map((position) => position.name)).toContain("VMD Hall & Environs Lead");
    expect(workspace?.duties.some((duty) => duty.taskTitle === "Arrange chairs according to the programme layout.")).toBe(true);
  });

  it("enforces member checklist permissions and preserves immutable execution wording", async () => {
    const volunteer = caller(volunteerUserId, "VOLUNTEER", `dept-volunteer-${stamp}@camply.test`);
    await expect(volunteer.departmentOperations.createChecklistItem({ departmentId: vmdId, title: "Check extension cables", routine: "DAILY", assignmentType: "EVERYONE", required: true })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const owner = caller(ownerId, "OWNER", `dept-owner-${stamp}@camply.test`);
    await owner.departmentOperations.updateDepartment({ id: vmdId, allowMembersAddChecklistItems: true, allowMembersEditChecklistItems: true, allowMembersDeactivateChecklistItems: true });
    const item = await volunteer.departmentOperations.createChecklistItem({ departmentId: vmdId, title: "Check extension cables", routine: "DAILY", assignmentType: "EVERYONE", required: true });
    const before = await volunteer.departmentOperations.myDepartment({ campId, date: "2026-08-12" });
    const execution = before!.duties.find((duty) => duty.checklistItemId === item.id)!;
    await volunteer.departmentOperations.updateExecution({ id: execution.id, status: "COMPLETED", note: "Ready" });
    await volunteer.departmentOperations.updateChecklistItem({ id: item.id, title: "Check extension cables and backup batteries" });
    const stored = await prisma.departmentChecklistExecution.findUniqueOrThrow({ where: { id: execution.id } });
    expect(stored).toMatchObject({ taskTitle: "Check extension cables", status: "COMPLETED", completedById: volunteerUserId, note: "Ready" });
    expect((await prisma.departmentChecklistItem.findUniqueOrThrow({ where: { id: item.id } })).version).toBe(2);
  });

  it("auto-assigns only unassigned teachers, honors preferences, and falls back from full departments", async () => {
    const owner = caller(ownerId, "OWNER", `dept-owner-${stamp}@camply.test`);
    const registration = await prisma.department.findFirstOrThrow({ where: { campId, name: "Registration" } });
    const medical = await prisma.department.findFirstOrThrow({ where: { campId, name: "Medical" } });
    await prisma.department.update({ where: { id: vmdId }, data: { maxCapacity: 1 } });

    const createTeacher = async (label: string, preferredDepartmentId: string | null, departmentId: string | null = null) => {
      const user = await prisma.user.create({ data: { email: `${label}-${stamp}@camply.test`, password: "x", role: "TEACHER", organizationId } });
      return prisma.staffProfile.create({ data: { userId: user.id, organizationId, campId, type: "TEACHER", status: "APPROVED", firstName: label, lastName: "Teacher", phone: `081${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}`, email: user.email, preferredDepartmentId, departmentId } });
    };
    const preferred = await createTeacher("Preferred", registration.id);
    const overflow = await createTeacher("Overflow", vmdId);
    const manual = await createTeacher("Manual", registration.id, medical.id);

    const result = await owner.staff.autoAssignToDepartments({ organizationId, campId, strategy: "PREFERENCE" });
    expect(result).toMatchObject({ count: 2, preferenceMatched: 1, fallbackAssigned: 1, unassigned: 0 });
    expect(await prisma.staffProfile.findUniqueOrThrow({ where: { id: preferred.id } })).toMatchObject({ departmentId: registration.id });
    expect((await prisma.staffProfile.findUniqueOrThrow({ where: { id: overflow.id } })).departmentId).not.toBe(vmdId);
    expect(await prisma.staffProfile.findUniqueOrThrow({ where: { id: manual.id } })).toMatchObject({ departmentId: medical.id });
  });

  it("records history and department reports without deleting execution facts", async () => {
    const owner = caller(ownerId, "OWNER", `dept-owner-${stamp}@camply.test`);
    const history = await owner.departmentOperations.history({ departmentId: vmdId, dateFrom: "2026-08-01", dateTo: "2026-08-31", status: "COMPLETED" });
    const completed = history.find((item) => item.taskTitle === "Check extension cables");
    expect(completed?.completedByName).toBe(`dept-volunteer-${stamp}@camply.test`);
    const report = await owner.departmentOperations.submitReport({ departmentId: vmdId, date: "2026-08-12", completedWork: "Prepared halls", outstandingWork: "Final inspection", issues: "None", escalations: "None" });
    expect(report).toMatchObject({ departmentId: vmdId, completedWork: "Prepared halls" });
    expect(await prisma.departmentChecklistExecution.count({ where: { departmentId: vmdId } })).toBeGreaterThan(0);

    const current = await prisma.positionAssignment.findFirstOrThrow({ where: { staffId: volunteerStaffId, positionId: hallLeadPositionId, isCurrent: true } });
    const hostel = await prisma.position.findFirstOrThrow({ where: { departmentId: vmdId, name: "VMD Hostel Lead" } });
    await owner.departmentOperations.movePerson({ assignmentId: current.id, targetPositionId: hostel.id, reason: "Operational reassignment" });
    expect(await prisma.positionAssignment.findUniqueOrThrow({ where: { id: current.id } })).toMatchObject({ isCurrent: false });
    expect(await prisma.positionAssignment.findFirst({ where: { staffId: volunteerStaffId, positionId: hostel.id, isCurrent: true } })).toBeTruthy();
  });
});
