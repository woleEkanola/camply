import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithOtp, deleteStaffByEmail, onlyVisible } from "./helpers";

test.describe("Teacher Dashboard & Campus Rep Improvements", () => {
  test.describe.configure({ mode: "serial" });

  const teacherEmail = `e2e-teacher-imp-${Date.now()}@camply.test`;
  const repEmail = `e2e-rep-imp-${Date.now()}@camply.test`;
  const parentEmail = `e2e-parent-imp-${Date.now()}@camply.test`;

  let organizationId: string;
  let campId: string;
  let campusId: string;
  let teacherUserId: string;
  let repUserId: string;
  let parentUserId: string;
  let camperId: string;
  let registrationId: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;
    campusId = ctx.campusId;

    // 1. Regular Teacher
    const teacherUser = await prisma.user.create({
      data: { email: teacherEmail, password: "unused-otp-login", role: "TEACHER", organizationId },
    });
    teacherUserId = teacherUser.id;
    await prisma.staffProfile.create({
      data: {
        userId: teacherUser.id, organizationId, campId, type: "TEACHER", status: "APPROVED",
        firstName: "Test", lastName: "Teacher", phone: "+1-555-0901", email: teacherEmail, approvedAt: new Date(),
      },
    });

    // 2. Campus Rep (Teacher with managed campus)
    const repUser = await prisma.user.create({
      data: { email: repEmail, password: "unused-otp-login", role: "TEACHER", organizationId, managedCampuses: { connect: { id: campusId } } },
    });
    repUserId = repUser.id;
    await prisma.staffProfile.create({
      data: {
        userId: repUser.id, organizationId, campId, type: "TEACHER", status: "APPROVED",
        firstName: "Test", lastName: "Rep", phone: "+1-555-0902", email: repEmail, approvedAt: new Date(),
      },
    });

    // 3. Parent, Camper & Registration (Completed/Checked Out status)
    const parent = await prisma.user.create({
      data: { email: parentEmail, password: "x", role: "PARENT", organizationId, firstName: "Test", lastName: "Parent" },
    });
    parentUserId = parent.id;

    const camper = await prisma.camper.create({
      data: {
        name: "Test Camper Imp",
        userId: parent.id,
        organizationId,
        homeCampusId: campusId,
        gender: "Male",
        dateOfBirth: new Date("2014-06-01"),
        allergies: "Peanuts",
      },
    });
    camperId = camper.id;

    const reg = await prisma.registration.create({
      data: {
        camperId: camper.id,
        campId,
        campusId,
        status: "COMPLETED",
        registrationNumber: `E2E-IMP-${Date.now()}`,
      },
    });
    registrationId = reg.id;
  });

  test.afterAll(async () => {
    await prisma.registration.deleteMany({ where: { id: registrationId } });
    await prisma.camper.deleteMany({ where: { id: camperId } });
    await prisma.user.deleteMany({ where: { id: parentUserId } });
    await deleteStaffByEmail(teacherEmail);
    await deleteStaffByEmail(repEmail);
  });

  test("regular teacher cannot export CSV", async ({ page }) => {
    test.setTimeout(60000);
    await loginWithOtp(page, teacherEmail);
    await page.waitForURL(/\/teacher/, { timeout: 45000 });
    await page.goto("/teacher/campers");
    await expect(page.getByRole("heading", { name: "Campers", exact: true })).toBeVisible();

    // Export CSV button should NOT be visible
    await expect(page.getByRole("button", { name: "Export CSV" })).not.toBeVisible();
  });

  test("campus rep can export CSV", async ({ page }) => {
    test.setTimeout(60000);
    await loginWithOtp(page, repEmail);
    await page.waitForURL(/\/teacher/, { timeout: 45000 });
    await page.goto("/teacher/campers");
    await expect(page.getByRole("heading", { name: "Campers", exact: true })).toBeVisible();

    // Export CSV button should be visible
    await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
  });

  test("campers view layout toggle, completed status change, medical column removal", async ({ page }) => {
    test.setTimeout(60000);
    await loginWithOtp(page, repEmail);
    await page.waitForURL(/\/teacher/, { timeout: 45000 });
    await page.goto("/teacher/campers");

    // "Medical" header should not be present in the table headers (removed column)
    await expect(page.locator("th", { hasText: "Medical" })).toHaveCount(0);

    // Check "Checked Out" label mapping for COMPLETED registrations in List View
    await expect(page.locator("tr", { hasText: "Test Camper Imp" }).locator("span", { hasText: "Checked Out" })).toBeVisible();

    // Toggle view to Card
    await page.getByRole("button", { name: "Card", exact: true }).click();

    // In Card view, the status badge should say "Checked Out"
    await expect(page.locator("div", { hasText: "Test Camper Imp" }).locator("span", { hasText: "Checked Out" })).toBeVisible();
    
    // Toggle view to Thumbnail
    await page.getByRole("button", { name: "Thumbnail", exact: true }).click();
    await expect(page.getByText("Test Camper Imp").first()).toBeVisible();
  });
});
