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
    await loginWithOtp(page, teacherEmail);
    await page.waitForURL(/\/teacher/, { timeout: 15000 });

    await page.goto("/teacher/check-in");
    await expect(page.getByRole("heading", { name: "Check-in" })).toBeVisible();

    // Manual search by registration number.
    await page.locator('input[placeholder*="Registration #, camper name, email, or phone"]').fill(registrationNumber);
    await page.getByRole("button", { name: "Search", exact: true }).click();

    // Result card appears with medical alert and ready status.
    await expect(page.getByText("Checkin Camper")).toBeVisible();
    await expect(page.getByText("Medical Alert")).toBeVisible();
    await expect(page.getByText("Ready for Check-in")).toBeVisible();

    // Check in.
    await page.locator('button:visible', { hasText: "Check In" }).click();
    await expect(page.getByText("Already Checked In")).toBeVisible();
    await expect(page.getByText(/Checked in:/)).toBeVisible();

    // Checked-in state is persisted.
    const reg = await prisma.registration.findUniqueOrThrow({ where: { id: registrationId } });
    expect(reg.status).toBe("CHECKED_IN");
    expect(reg.checkedInById).toBe(teacherUserId);
  });
});
