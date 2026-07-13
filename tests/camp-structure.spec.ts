import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, deleteStaffByEmail } from "./helpers";

test.describe("Camp Structure Redesign", () => {
  test.describe.configure({ mode: "serial" });

  const managerEmail = `e2e-cs-manager-${Date.now()}@camply.test`;
  const reportEmail = `e2e-cs-report-${Date.now()}@camply.test`;
  let managerId: string;
  let reportId: string;
  let departmentId: string;
  let directorPositionId: string;
  let headPositionId: string;
  let volPositionId: string;
  let managerAssignmentId: string;
  let reportAssignmentId: string;
  let campId: string;
  let orgId: string;

  test.beforeAll(async () => {
    const { organizationId, campId: fixtureCampId } = await getFixtureOrgContext();
    campId = fixtureCampId;
    orgId = organizationId;

    // 1. Create department
    const dept = await prisma.department.create({
      data: {
        organizationId,
        campId,
        name: "E2E Structure Department",
        responsibilities: ["Do the thing", "Do the other thing"],
      },
    });
    departmentId = dept.id;

    // 2. Create staff profiles
    const managerUser = await prisma.user.create({
      data: { email: managerEmail, password: "placeholder-not-used-for-login", role: "TEACHER", organizationId },
    });
    const manager = await prisma.staffProfile.create({
      data: {
        userId: managerUser.id,
        organizationId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: "CS",
        lastName: "ManagerE2E",
        phone: "+1-555-0500",
        email: managerEmail,
        approvedAt: new Date(),
      },
    });
    managerId = manager.id;

    const reportUser = await prisma.user.create({
      data: { email: reportEmail, password: "placeholder-not-used-for-login", role: "TEACHER", organizationId },
    });
    const report = await prisma.staffProfile.create({
      data: {
        userId: reportUser.id,
        organizationId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: "CS",
        lastName: "ReportE2E",
        phone: "+1-555-0600",
        email: reportEmail,
        approvedAt: new Date(),
      },
    });
    reportId = report.id;

    // 3. Create position hierarchy
    const directorPos = await prisma.position.create({
      data: { name: "Camp Director", campId, displayOrder: 1 },
    });
    directorPositionId = directorPos.id;

    const headPos = await prisma.position.create({
      data: {
        name: `${dept.name} Head`,
        campId,
        departmentId: dept.id,
        parentPositionId: directorPos.id,
        displayOrder: 2,
      },
    });
    headPositionId = headPos.id;

    const volPos = await prisma.position.create({
      data: {
        name: `${dept.name} Volunteer`,
        campId,
        departmentId: dept.id,
        parentPositionId: headPos.id,
        displayOrder: 3,
      },
    });
    volPositionId = volPos.id;

    // 4. Assign staff profiles to positions
    const managerAssign = await prisma.positionAssignment.create({
      data: { positionId: headPos.id, staffId: manager.id, isCurrent: true },
    });
    managerAssignmentId = managerAssign.id;

    const reportAssign = await prisma.positionAssignment.create({
      data: { positionId: volPos.id, staffId: report.id, isCurrent: true },
    });
    reportAssignmentId = reportAssign.id;
  });

  test.afterAll(async () => {
    // Cleanup assignments
    await prisma.positionAssignment.deleteMany({
      where: { id: { in: [managerAssignmentId, reportAssignmentId] } },
    });
    // Cleanup positions
    await prisma.position.deleteMany({
      where: { id: { in: [directorPositionId, headPositionId, volPositionId] } },
    });
    // Cleanup departments
    await prisma.department.deleteMany({
      where: { id: departmentId },
    });
    // Cleanup staff and users
    await deleteStaffByEmail(managerEmail);
    await deleteStaffByEmail(reportEmail);
  });

  test("leadership tab displays position hierarchy and opens department detail drawer", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/camp-structure");

    // Check custom graph tree elements
    await expect(page.getByText("Camp Director").first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("E2E Structure Department Head").first()).toBeVisible();
    await expect(page.getByText("CS ManagerE2E").first()).toBeVisible();

    // Switch to Nested List view to place nodes comfortably inside viewport
    await page.getByRole("button", { name: "Nested List" }).click();

    // Click department link to open operations center drawer
    await page.getByRole("button", { name: "E2E Structure Department" }).first().click();

    await expect(page.getByText("Department Operations Center").first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Do the thing").first()).toBeVisible();
  });

  test("directory tab allows searching and filtering of staff list", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/camp-structure");

    // Switch to Directory Tab
    await page.getByRole("tab", { name: "Directory" }).click();

    // Search by query
    const searchInput = page.getByPlaceholder("Search staff by name or email…");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("ManagerE2E");

    // Only matching profile should be visible
    await expect(page.getByText("CS ManagerE2E").first()).toBeVisible();
    await expect(page.getByText("CS ReportE2E")).not.toBeVisible();
  });

  test("departments tab lists organization units and supports details sliding drawer", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/camp-structure");

    // Switch to Departments Tab
    await page.getByRole("tab", { name: "Departments" }).click();

    // Verify grid card details
    await expect(page.getByText("E2E Structure Department").first()).toBeVisible();
    
    // Click card to open drawer
    await page.getByText("E2E Structure Department").first().click();

    await expect(page.getByText("Department Operations Center").first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Do the other thing").first()).toBeVisible();
  });
});
