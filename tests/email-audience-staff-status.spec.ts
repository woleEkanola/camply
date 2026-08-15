import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, fieldByLabel } from "./helpers";

/**
 * Regression coverage for the email-audience staff-status bug
 * (src/server/email/audience/resolver.ts): the status post-filter only ever
 * walked `user.campers[].registrations[]`, so a TEACHERS (or VOLUNTEERS /
 * CAMPUS_REPS) audience with any status selected silently matched zero
 * users — a TEACHER has no Camper rows, so `.some()` was always false.
 * The fix makes the filter recipient-type aware: staff roles are checked
 * against StaffProfile.status, parents against Registration.status.
 */
test.describe("Email audience: staff-status bug fix", () => {
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now();
  let organizationId: string;
  let campId: string;
  let campusId: string;

  let teacherUserId: string | undefined;
  let teacherProfileId: string | undefined;

  let parentUserId: string | undefined;
  let camperId: string | undefined;
  let registrationId: string | undefined;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;
    campusId = ctx.campusId;

    // An APPROVED teacher — no Camper rows at all, which is exactly the
    // shape that used to vanish the instant a status filter was applied.
    const teacherUser = await prisma.user.create({
      data: { email: `e2e-audience-teacher-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId },
    });
    teacherUserId = teacherUser.id;
    const teacherProfile = await prisma.staffProfile.create({
      data: {
        userId: teacherUser.id,
        organizationId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: "E2E Audience",
        lastName: "Teacher",
        phone: "+1-555-0177",
        email: teacherUser.email,
      },
    });
    teacherProfileId = teacherProfile.id;

    // An APPROVED parent registration — the pre-existing working path,
    // asserted here so the fix doesn't regress it.
    const parentUser = await prisma.user.create({
      data: { email: `e2e-audience-parent-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId, homeCampusId: campusId },
    });
    parentUserId = parentUser.id;
    const camper = await prisma.camper.create({
      data: { name: "E2E Audience Camper", userId: parentUser.id, organizationId, homeCampusId: campusId, gender: "MALE", dateOfBirth: new Date(2013, 5, 1) },
    });
    camperId = camper.id;
    const registration = await prisma.registration.create({
      data: { camperId: camper.id, campId, campusId, status: "APPROVED", registrationNumber: `E2E-AUD-${stamp}` },
    });
    registrationId = registration.id;
  });

  test.afterAll(async () => {
    if (registrationId) await prisma.registration.deleteMany({ where: { id: registrationId } });
    if (camperId) await prisma.camper.deleteMany({ where: { id: camperId } });
    if (parentUserId) await prisma.user.deleteMany({ where: { id: parentUserId } });
    if (teacherProfileId) await prisma.staffProfile.deleteMany({ where: { id: teacherProfileId } });
    if (teacherUserId) await prisma.user.deleteMany({ where: { id: teacherUserId } });
  });

  test("a Teachers audience with Approved status returns the approved teacher, not zero", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/communication/audiences/new");
    await expect(page.getByRole("heading", { name: "New Audience" })).toBeVisible({ timeout: 15000 });

    await fieldByLabel(page, "Recipient Type").selectOption({ label: "Teachers" });
    // The status control relabels to "Staff Status" for staff recipient
    // types (audiences/new/page.tsx) — locate it by the new label.
    await fieldByLabel(page, "Staff Status").selectOption({ label: "Approved" });

    // This is the exact regression: before the fix, any status selected on
    // a staff recipient type always resolved to 0, regardless of real data.
    await expect(async () => {
      const text = await recipientCount(page).textContent();
      expect(Number(text)).toBeGreaterThan(0);
    }).toPass({ timeout: 15000 });
  });

  test("a Parents audience with a camper registration status still works", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/communication/audiences/new");
    await expect(page.getByRole("heading", { name: "New Audience" })).toBeVisible({ timeout: 15000 });

    await fieldByLabel(page, "Recipient Type").selectOption({ label: "Parents" });
    await fieldByLabel(page, "Registration Status").selectOption({ label: "Approved" });

    await expect(async () => {
      const text = await recipientCount(page).textContent();
      expect(Number(text)).toBeGreaterThan(0);
    }).toPass({ timeout: 15000 });
  });
});

/** The "Recipients Found: N" count is the sibling span right after its label — see audiences/new/page.tsx. */
function recipientCount(page: import("@playwright/test").Page) {
  return page.getByText("Recipients Found:").locator("xpath=following-sibling::span[1]");
}
