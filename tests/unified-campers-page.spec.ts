import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithOtp, deleteCamperByEmail, deleteStaffByEmail } from "./helpers";

/**
 * Phase 2: unified teacher campers page. Teachers see all campers for the
 * active camp (not just their own assignments), can search/filter, and export.
 */
test.describe("Unified teacher campers page", () => {
  test.describe.configure({ mode: "serial" });

  const teacherEmail = `e2e-unified-campers-teacher-${Date.now()}@camply.test`;
  const parentEmail = `e2e-unified-campers-parent-${Date.now()}@camply.test`;

  let organizationId: string;
  let campId: string;
  let campusId: string;
  let teacherUserId: string;
  let parentId: string;
  let camperId: string;
  let registrationId: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;
    campusId = ctx.campusId;

    const teacherUser = await prisma.user.create({
      data: { email: teacherEmail, password: "unused-otp-login", role: "TEACHER", organizationId },
    });
    teacherUserId = teacherUser.id;
    await prisma.staffProfile.create({
      data: {
        userId: teacherUser.id,
        organizationId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: "Unified",
        lastName: "Teacher",
        phone: "+1-555-0900",
        email: teacherEmail,
        approvedAt: new Date(),
      },
    });

    const parent = await prisma.user.create({
      data: { email: parentEmail, password: "x", role: "PARENT", organizationId, firstName: "Unified", lastName: "Parent" },
    });
    parentId = parent.id;

    const camper = await prisma.camper.create({
      data: {
        name: "Unified Camper Alpha",
        userId: parent.id,
        organizationId,
        homeCampusId: campusId,
        gender: "Male",
        dateOfBirth: new Date("2012-06-01"),
        allergies: "Peanuts",
      },
    });
    camperId = camper.id;

    const reg = await prisma.registration.create({
      data: {
        camperId: camper.id,
        campId,
        campusId,
        status: "APPROVED",
        registrationNumber: `E2E-UCAMP-${Date.now()}`,
      },
    });
    registrationId = reg.id;
  });

  test.afterAll(async () => {
    await prisma.registration.deleteMany({ where: { id: registrationId } });
    await prisma.camper.deleteMany({ where: { id: camperId } });
    await deleteCamperByEmail(parentEmail);
    await deleteStaffByEmail(teacherEmail);
  });

  test("teacher sees the camper and can search/filter/export", async ({ page }) => {
    await loginWithOtp(page, teacherEmail);
    await page.waitForURL(/\/teacher/, { timeout: 15000 });

    await page.goto("/teacher/campers");
    await expect(page.getByRole("heading", { name: "Campers", exact: true })).toBeVisible();

    // Camper name appears in the list.
    await expect(page.getByText("Unified Camper Alpha")).toBeVisible();
    // Medical alert chip.
    await expect(page.getByText("Alert").first()).toBeVisible();

    // Search filters to the camper.
    await page.locator('input[placeholder*="Search name, email, or registration #"]').fill("Alpha");
    await expect(page.getByText("Unified Camper Alpha")).toBeVisible();
    await expect(page.getByText("Unified Camper Beta")).not.toBeVisible(); // doesn't exist

    // Status filter keeps approved camper visible.
    await page.getByLabel("Filter by Registration").selectOption("APPROVED");
    await expect(page.getByText("Unified Camper Alpha")).toBeVisible();

    // Gender filter.
    await page.getByLabel("Filter by Gender").selectOption("Male");
    await expect(page.getByText("Unified Camper Alpha")).toBeVisible();

    // Export CSV button is present.
    await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
  });
});
