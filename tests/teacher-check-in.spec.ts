import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithOtp, deleteCamperByEmail, deleteStaffByEmail } from "./helpers";

/**
 * Phase 2: teacher check-in page. Teachers can scan/search by registration
 * number, see mismatch warnings, check in/out approved campers, and see who
 * checked them in.
 */
test.describe("Teacher check-in", () => {
  test.describe.configure({ mode: "serial" });

  const teacherEmail = `e2e-teacher-checkin-${Date.now()}@camply.test`;
  const parentEmail = `e2e-checkin-parent-${Date.now()}@camply.test`;

  let organizationId: string;
  let campId: string;
  let campusId: string;
  let teacherUserId: string;
  let parentId: string;
  let camperId: string;
  let registrationId: string;
  let registrationNumber: string;

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
        firstName: "Checkin",
        lastName: "Teacher",
        phone: "+1-555-0910",
        email: teacherEmail,
        approvedAt: new Date(),
      },
    });

    const parent = await prisma.user.create({
      data: { email: parentEmail, password: "x", role: "PARENT", organizationId, firstName: "Checkin", lastName: "Parent" },
    });
    parentId = parent.id;

    const camper = await prisma.camper.create({
      data: {
        name: "Checkin Camper",
        userId: parent.id,
        organizationId,
        homeCampusId: campusId,
        gender: "Female",
        dateOfBirth: new Date("2011-03-15"),
        medicalConditions: "Asthma",
      },
    });
    camperId = camper.id;

    registrationNumber = `E2E-CHK-${Date.now()}`;
    const reg = await prisma.registration.create({
      data: {
        camperId: camper.id,
        campId,
        campusId,
        status: "APPROVED",
        registrationNumber,
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

  test("teacher can search and check in an approved camper", async ({ page }) => {
    test.setTimeout(120000);
    await loginWithOtp(page, teacherEmail);
    await page.waitForURL(/\/teacher/, { timeout: 90000 });

    await page.goto("/teacher/check-in");
    await expect(page.getByRole("heading", { name: "Camp Arrival" })).toBeVisible();

    // Manual search by registration number.
    await page.locator('input[placeholder*="Enter Registration #"]').fill(registrationNumber);
    await page.getByRole("button", { name: "Search", exact: true }).click();

    // Medical alert overlay appears because of Asthma condition.
    await expect(page.getByText("Medical & safety alert")).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("Checkin Camper")).toBeVisible();
    await expect(page.getByText("Asthma")).toBeVisible();
 
    // Acknowledge and confirm scan.
    await page.getByRole("button", { name: "Acknowledge & Confirm Scan" }).click();
 
    // Success overlay appears.
    await expect(page.getByRole("heading", { name: "Checked In at Camp Arrival", exact: true })).toBeVisible({ timeout: 20000 });
    
    // Dismiss overlay by clicking it
    await page.click("text=Checked In at Camp Arrival");
    await expect(page.getByRole("heading", { name: "Checked In at Camp Arrival" })).not.toBeVisible();

    // Verify recent scan entry in activity logs.
    await expect(page.getByText("Checkin Camper")).toBeVisible();

    // Checked-in state is persisted.
    const reg = await prisma.registration.findUniqueOrThrow({ where: { id: registrationId } });
    expect(reg.status).toBe("CHECKED_IN");
    expect(reg.checkedInById).toBe(teacherUserId);
  });
});
