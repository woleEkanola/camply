import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, showAllRows } from "./helpers";

test.describe("Campers page: Registration Status filter replaces Active/Inactive", () => {
  test.describe.configure({ mode: "serial" });

  let organizationId: string;
  let campId: string;
  let campusId: string;

  let parentUserId: string | undefined;
  let camperId: string | undefined;
  let registrationId: string | undefined;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;
    campusId = ctx.campusId;

    const parent = await prisma.user.create({
      data: { email: `e2e-camperstatus-parent-${Date.now()}@camply.test`, password: "x", role: "PARENT", organizationId, homeCampusId: campusId },
    });
    parentUserId = parent.id;
    const camper = await prisma.camper.create({
      data: { name: "E2E StatusFilter Camper", userId: parent.id, organizationId, homeCampusId: campusId, gender: "MALE", dateOfBirth: new Date(2013, 5, 1) },
    });
    camperId = camper.id;

    // Created directly via Prisma (not the registration engine's
    // submitRegistration) — this shared fixture org has accumulated custom
    // required FormFields over many prior e2e sessions this test doesn't
    // care about; see tests/phase3-soft-delete.spec.ts for the same pattern.
    const registration = await prisma.registration.create({
      data: { camperId: camper.id, campId, campusId, status: "APPROVED", registrationNumber: `E2E-STATUSFILTER-${Date.now()}` },
    });
    registrationId = registration.id;
  });

  test.afterAll(async () => {
    if (registrationId) await prisma.registration.deleteMany({ where: { id: registrationId } });
    if (camperId) await prisma.camper.deleteMany({ where: { id: camperId } });
    if (parentUserId) await prisma.user.deleteMany({ where: { id: parentUserId } });
  });

  test("Registration Status dropdown filters the list and no Active/Inactive column or filter remains", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campers");
    await showAllRows(page);

    // The old Active/Inactive controls are gone (no column header is exactly "Status" — only "Registration Status" remains).
    await expect(page.getByRole("option", { name: "Inactive", exact: true })).toHaveCount(0);
    await expect(page.locator("th", { hasText: /^Status$/ })).toHaveCount(0);

    const row = page.locator("tr", { hasText: "StatusFilter Camper" });
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row).toContainText("APPROVED");

    // The new Registration Status dropdown (toolbar) shows the full status list and filters correctly.
    await page.getByLabel("Registration Status", { exact: true }).selectOption("APPROVED");
    await expect(page.locator("tr", { hasText: "StatusFilter Camper" })).toBeVisible({ timeout: 10000 });

    await page.getByLabel("Registration Status", { exact: true }).selectOption("REJECTED");
    await expect(page.locator("tr", { hasText: "StatusFilter Camper" })).toHaveCount(0);
  });
});
