import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, showAllRows, visibleText } from "./helpers";

test.describe("Admin: Campus CRUD and signup link generation", () => {
  test.describe.configure({ mode: "serial" });

  const campusName = `E2E Campus ${Date.now()}`;
  let campusId: string | undefined;

  test.afterAll(async () => {
    if (campusId) {
      await prisma.signupLink.deleteMany({ where: { campusId } });
      await prisma.campus.deleteMany({ where: { id: campusId } });
    }
  });

  test("owner can create a campus and generate a signup link for it", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campuses");

    await page.getByRole("button", { name: "Add Campus" }).first().click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Campus Name").fill(campusName);
    await dialog.getByLabel("Address").fill("42 E2E Test Ave");
    await dialog.getByLabel("City").fill("Testville");
    await dialog.getByLabel("Country").fill("Testland");
    await dialog.getByRole("button", { name: "Add Campus", exact: true }).click();

    // This shared fixture org has accumulated many campuses across prior e2e
    // sessions — the newly-created row can land off the default 10-row page.
    await showAllRows(page);
    await expect(visibleText(page, campusName)).toBeVisible({ timeout: 10000 });

    const campus = await prisma.campus.findFirstOrThrow({ where: { name: campusName } });
    campusId = campus.id;
    expect(campus.address).toBe("42 E2E Test Ave");
    expect(campus.active).toBe(true);

    const row = page.locator("tr", { hasText: campusName });
    await row.getByRole("button", { name: /Generate Link/i }).click();

    await expect
      .poll(async () => prisma.signupLink.findFirst({ where: { campusId: campus.id } }), { timeout: 10000 })
      .not.toBeNull();

    const link = await prisma.signupLink.findFirstOrThrow({ where: { campusId: campus.id } });
    expect(link.active).toBe(true);
    expect(link.campId).toBeTruthy();
  });

  test("Disable/Enable Signup Link buttons revoke and restore a campus's signup link", async ({ page }) => {
    if (!campusId) throw new Error("campusId not set — earlier test must have failed");

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campuses");
    await showAllRows(page);

    // Wait for the signup links query to actually load into state before
    // interacting — otherwise the bulk handler's `getSignupLinkForCampus`
    // lookup can race ahead of the data and silently no-op.
    const row = page.locator("tr", { hasText: campusName });
    await expect(row).toContainText("Signup Link: Active", { timeout: 10000 });

    await page.getByLabel(`Select campus ${campusName}`).click();
    await expect(page.getByRole("button", { name: "Disable Signup Link" })).toBeVisible();
    await page.getByRole("button", { name: "Disable Signup Link" }).click();

    await expect
      .poll(async () => (await prisma.signupLink.findFirstOrThrow({ where: { campusId: campusId! } })).active, { timeout: 10000 })
      .toBe(false);
    await expect(row).toContainText("Signup Link: Inactive");

    await page.getByLabel(`Select campus ${campusName}`).click();
    await page.getByRole("button", { name: "Enable Signup Link" }).click();

    await expect
      .poll(async () => (await prisma.signupLink.findFirstOrThrow({ where: { campusId: campusId! } })).active, { timeout: 10000 })
      .toBe(true);
  });

  test("campus list is scoped to the caller's organization", async ({ page }) => {
    const { organizationId } = await getFixtureOrgContext();
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campuses");
    await showAllRows(page);

    await expect(visibleText(page, campusName)).toBeVisible({ timeout: 10000 });

    const allCampusesForOrg = await prisma.campus.findMany({ where: { organizationId } });
    expect(allCampusesForOrg.some((c) => c.name === campusName)).toBe(true);
  });

  test("deleting a campus with linked registrations soft-deletes both, recoverable from Trash", async ({ page }) => {
    const { organizationId, campId } = await getFixtureOrgContext();
    if (!campusId) throw new Error("campusId not set — earlier test must have failed");

    const parentEmail = `e2e-campus-delete-parent-${Date.now()}@camply.test`;
    const parent = await prisma.user.create({ data: { email: parentEmail, password: "x", role: "PARENT", organizationId } });
    const camper = await prisma.camper.create({ data: { name: "E2E Delete-Cascade Camper", userId: parent.id, organizationId, homeCampusId: campusId } });
    const registration = await prisma.registration.create({
      data: { camperId: camper.id, campId, campusId, status: "APPROVED", registrationNumber: `E2E-DEL-CASCADE-${Date.now()}` },
    });

    try {
      await loginWithPassword(page, "owner@camply.com", "password123");
      await page.goto("/admin/campuses");
      await showAllRows(page);

      const row = page.locator("tr", { hasText: campusName });
      await row.getByRole("button", { name: "Delete" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();

      await expect(page.getByText("Campus deleted successfully")).toBeVisible({ timeout: 10000 });
      await expect(visibleText(page, campusName)).not.toBeVisible();

      // Soft-deleted, not gone — and the cascade must have reached the registration too.
      await expect
        .poll(async () => (await prisma.campus.findUniqueOrThrow({ where: { id: campusId! } })).deletedAt)
        .not.toBeNull();
      const reloadedRegistration = await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } });
      expect(reloadedRegistration.deletedAt).not.toBeNull();

      await page.goto("/admin/trash");
      await expect(visibleText(page, campusName)).toBeVisible({ timeout: 10000 });
    } finally {
      await prisma.registration.deleteMany({ where: { id: registration.id } });
      await prisma.camper.deleteMany({ where: { id: camper.id } });
      await prisma.user.deleteMany({ where: { id: parent.id } });
    }
  });
});
