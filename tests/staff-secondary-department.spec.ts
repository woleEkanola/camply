import { expect, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma, loginWithPassword } from "./helpers";

test.describe("Staff primary/secondary department assignment", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);
  const stamp = `${Date.now()}-${Math.random()}`.replace(".", "-");
  const ownerEmail = `e2e-secondary-dept-owner-${stamp}@camply.test`;
  let organizationId = "";
  let campId = "";
  let teacherId = "";
  let registrationId = "";
  let medicalId = "";
  let securityId = "";

  test.beforeAll(async () => {
    const password = await bcrypt.hash("password123", 12);
    const organization = await prisma.organization.create({ data: { name: `E2E Secondary Dept ${stamp}`, slug: `e2e-secondary-dept-${stamp}` } });
    organizationId = organization.id;
    const camp = await prisma.camp.create({ data: { name: `E2E Secondary Dept Camp ${stamp}`, slug: `e2e-secondary-dept-camp-${stamp}`, year: 2026, startDate: new Date("2026-08-01"), endDate: new Date("2026-08-31"), active: true, status: "OPEN", organizationId } });
    campId = camp.id;
    await prisma.organization.update({ where: { id: organizationId }, data: { activeCampId: campId } });
    await prisma.user.create({ data: { email: ownerEmail, password, role: "OWNER", firstName: "Secondary", lastName: "Owner", organizationId } });

    const registration = await prisma.department.create({ data: { organizationId, campId, name: "Registration", status: "ACTIVE" } });
    const medical = await prisma.department.create({ data: { organizationId, campId, name: "Medical", status: "ACTIVE" } });
    const security = await prisma.department.create({ data: { organizationId, campId, name: "Security", status: "ACTIVE" } });
    registrationId = registration.id;
    medicalId = medical.id;
    securityId = security.id;

    const teacherUser = await prisma.user.create({ data: { email: `e2e-secondary-dept-teacher-${stamp}@camply.test`, password, role: "TEACHER", firstName: "Two", lastName: "Departments", organizationId } });
    const teacher = await prisma.staffProfile.create({ data: { userId: teacherUser.id, organizationId, campId, type: "TEACHER", status: "APPROVED", firstName: "Two", lastName: "Departments", phone: "08099990000", email: teacherUser.email } });
    teacherId = teacher.id;
  });

  test.afterAll(async () => {
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });

  test("adds secondary departments, promotes one to primary, and removes another", async ({ page }) => {
    await loginWithPassword(page, ownerEmail, "password123");
    await page.goto(`/admin/teachers/${teacherId}`);
    await page.getByRole("tab", { name: "Assignments" }).click();

    // The primary picker is the simple denormalized StaffProfile.departmentId
    // setter (staff.assignDepartment) — it deliberately doesn't create a
    // PositionAssignment row, unlike secondary departments below.
    await page.getByLabel("Primary department").selectOption(registrationId);
    // Wait for the mutation to actually round-trip and refetch — the select's
    // value is bound to the query cache, so this proves the write landed
    // before we try to add a secondary department (which requires a primary
    // to already exist server-side).
    await expect(page.getByLabel("Primary department")).toHaveValue(registrationId, { timeout: 15_000 });
    await expect(page.getByText("Not attached to any other department.")).toBeVisible({ timeout: 15_000 });

    await page.getByLabel("Add to another department").selectOption(medicalId);
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByTestId(`secondary-department-name-${medicalId}`)).toBeVisible({ timeout: 15_000 });

    await page.getByLabel("Add to another department").selectOption(securityId);
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByTestId(`secondary-department-name-${securityId}`)).toBeVisible({ timeout: 15_000 });

    const teacherAfterAdds = await prisma.staffProfile.findUniqueOrThrow({ where: { id: teacherId } });
    expect(teacherAfterAdds.departmentId).toBe(registrationId);
    const medicalAssignment = await prisma.positionAssignment.findFirstOrThrow({ where: { staffId: teacherId, isCurrent: true, position: { departmentId: medicalId } } });
    expect(medicalAssignment.isPrimary).toBe(false);
    const securityAssignment = await prisma.positionAssignment.findFirstOrThrow({ where: { staffId: teacherId, isCurrent: true, position: { departmentId: securityId } } });
    expect(securityAssignment.isPrimary).toBe(false);

    // Promote Medical (a real, position-backed secondary) to primary.
    await page.getByRole("listitem").filter({ hasText: "Medical" }).getByRole("button", { name: "Make primary" }).click();
    await expect(page.getByLabel("Primary department")).toHaveValue(medicalId, { timeout: 15_000 });

    const teacherAfterPromote = await prisma.staffProfile.findUniqueOrThrow({ where: { id: teacherId } });
    expect(teacherAfterPromote.departmentId).toBe(medicalId);
    const medicalAssignmentAfter = await prisma.positionAssignment.findUniqueOrThrow({ where: { id: medicalAssignment.id } });
    // Same row, promoted in place — not torn down and recreated.
    expect(medicalAssignmentAfter.isPrimary).toBe(true);
    expect(medicalAssignmentAfter.isCurrent).toBe(true);
    const securityAssignmentAfter = await prisma.positionAssignment.findUniqueOrThrow({ where: { id: securityAssignment.id } });
    expect(securityAssignmentAfter.isPrimary).toBe(false);

    // Security is untouched by the promotion and still listed as secondary.
    await expect(page.getByTestId(`secondary-department-name-${securityId}`)).toBeVisible();
    await page.getByRole("listitem").filter({ hasText: "Security" }).getByRole("button", { name: "Remove" }).click();
    await expect(page.getByTestId(`secondary-department-name-${securityId}`)).toBeHidden({ timeout: 15_000 });
    const securityAssignmentRemoved = await prisma.positionAssignment.findUniqueOrThrow({ where: { id: securityAssignment.id } });
    expect(securityAssignmentRemoved.isCurrent).toBe(false);
  });
});
