import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, deleteStaffByEmail, fieldByLabel } from "./helpers";

test.describe("Camp Structure", () => {
  // Shares one set of Prisma fixtures (built in beforeAll) across every test
  // in this file — fullyParallel would otherwise run beforeAll once per
  // worker and double-create them (unique constraint failures, duplicate rows).
  test.describe.configure({ mode: "serial" });

  const managerEmail = `e2e-cs-manager-${Date.now()}@camply.test`;
  const reportEmail = `e2e-cs-report-${Date.now()}@camply.test`;
  let managerId: string;
  let reportId: string;
  let departmentId: string;
  let hostelId: string;
  let roomId: string;
  let bedId: string;
  let registrationId: string;

  test.beforeAll(async () => {
    const { organizationId, yearId, locationId } = await getFixtureOrgContext();

    const dept = await prisma.department.create({
      data: { organizationId, yearId, name: "E2E Structure Department", responsibilities: ["Do the thing", "Do the other thing"] },
    });
    departmentId = dept.id;

    const managerUser = await prisma.user.create({
      data: { email: managerEmail, password: "placeholder-not-used-for-login", role: "TEACHER", organizationId },
    });
    const manager = await prisma.staffProfile.create({
      data: {
        userId: managerUser.id, organizationId, yearId, type: "TEACHER", status: "APPROVED",
        firstName: "CS", lastName: "ManagerE2E", phone: "+1-555-0500", email: managerEmail,
        departmentId, isDepartmentHead: true, approvedAt: new Date(),
      },
    });
    managerId = manager.id;

    const reportUser = await prisma.user.create({
      data: { email: reportEmail, password: "placeholder-not-used-for-login", role: "TEACHER", organizationId },
    });
    const report = await prisma.staffProfile.create({
      data: {
        userId: reportUser.id, organizationId, yearId, type: "TEACHER", status: "APPROVED",
        firstName: "CS", lastName: "ReportE2E", phone: "+1-555-0600", email: reportEmail,
        reportsToId: manager.id, approvedAt: new Date(),
      },
    });
    reportId = report.id;

    const hostel = await prisma.hostel.create({ data: { organizationId, locationId, name: "E2E Hostel" } });
    hostelId = hostel.id;
    const room = await prisma.room.create({ data: { hostelId, name: "E2E Room" } });
    roomId = room.id;
    const bed = await prisma.bed.create({ data: { roomId, label: "E2E Bed 1" } });
    bedId = bed.id;

    const camperUser = await prisma.user.create({
      data: { email: `e2e-cs-camper-${Date.now()}@camply.test`, password: "placeholder-not-used-for-login", role: "BASE_USER", organizationId, locationId },
    });
    const camper = await prisma.camperProfile.create({
      data: { name: "E2E Structure Camper", userId: camperUser.id, organizationId, locationId },
    });
    const registration = await prisma.registration.create({
      data: { camperProfileId: camper.id, yearId, locationId, status: "APPROVED", registrationNumber: `E2E-CS-${Date.now()}` },
    });
    registrationId = registration.id;
  });

  test.afterAll(async () => {
    await prisma.bed.deleteMany({ where: { id: bedId } });
    await prisma.room.deleteMany({ where: { id: roomId } });
    await prisma.hostel.deleteMany({ where: { id: hostelId } });
    await prisma.registration.deleteMany({ where: { id: registrationId } });
    await prisma.department.deleteMany({ where: { id: departmentId } });
    await deleteStaffByEmail(managerEmail);
    await deleteStaffByEmail(reportEmail);
  });

  test("leadership tree shows the reporting relationship and opens a person's profile", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/camp-structure");

    await expect(page.getByText("CS ManagerE2E")).toBeVisible({ timeout: 10000 });

    // Top two tree depths start expanded (see OrgTree.tsx), so the direct
    // report should already be visible with no interaction needed.
    await expect(page.getByText("CS ReportE2E")).toBeVisible();

    await page.getByText("CS ReportE2E").click();
    await expect(page.getByRole("heading", { name: "CS ReportE2E" })).toBeVisible();
  });

  test("reassigning reports-to into a cycle is rejected with an inline error", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/teachers");

    await page.getByText("CS ManagerE2E").click();
    await page.getByRole("tab", { name: "Hierarchy" }).click();
    await fieldByLabel(page, "Reports To").selectOption({ label: "CS ReportE2E (TEACHER)" });

    await expect(page.getByText("That assignment would create a reporting cycle")).toBeVisible({ timeout: 10000 });

    const manager = await prisma.staffProfile.findUniqueOrThrow({ where: { id: managerId } });
    expect(manager.reportsToId).toBeNull();
  });

  test("department detail panel shows the head and configured responsibilities", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/camp-structure");
    await page.getByRole("tab", { name: "Departments" }).click();

    await page.getByText("E2E Structure Department").click();
    // The Departments grid card behind the dialog also shows the head's
    // name, so scope assertions to the detail dialog to avoid ambiguity.
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("CS ManagerE2E")).toBeVisible();
    await expect(dialog.getByText("Do the thing")).toBeVisible();
    await expect(dialog.getByText("Do the other thing")).toBeVisible();
  });

  test("admin can assign a camper down to bed level from the Accommodation tab", async ({ page }) => {
    const { locationName } = await getFixtureOrgContext();

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/camp-structure");
    await page.getByRole("tab", { name: "Accommodation" }).click();

    await page.locator("select").first().selectOption({ label: locationName });
    await expect(page.getByText("E2E Hostel")).toBeVisible({ timeout: 10000 });

    await page.getByText("E2E Bed 1").click();
    await page.getByPlaceholder("Camper name or registration #").fill("E2E Structure Camper");
    await page.getByText("E2E Structure Camper").click();

    await expect
      .poll(async () => {
        const bed = await prisma.bed.findUniqueOrThrow({ where: { id: bedId } });
        return bed.status;
      }, { timeout: 10000 })
      .toBe("OCCUPIED");

    const registration = await prisma.registration.findUniqueOrThrow({ where: { id: registrationId } });
    expect(registration.roomId).toBe(roomId);
  });
});
