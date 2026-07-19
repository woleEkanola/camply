import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

test.describe("Admin: campus reassignment (single and bulk)", () => {
  test.describe.configure({ mode: "serial" });

  const parentEmail = `e2e-reassign-parent-${Date.now()}@camply.test`;
  let organizationId: string;
  let campId: string;
  let campusIdA: string;
  let campusIdB: string;
  let registrationId: string;
  let userId: string;
  let camperId: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;

    // Create Campus A
    const campusA = await prisma.campus.create({
      data: {
        name: `E2E Reassign Campus A ${Date.now()}`,
        slug: `e2e-reassign-campus-a-${Date.now()}`,
        address: "100 Campus A St",
        city: "Town A",
        country: "Country A",
        organizationId,
      },
    });
    campusIdA = campusA.id;

    // Create Campus B
    const campusB = await prisma.campus.create({
      data: {
        name: `E2E Reassign Campus B ${Date.now()}`,
        slug: `e2e-reassign-campus-b-${Date.now()}`,
        address: "200 Campus B St",
        city: "Town B",
        country: "Country B",
        organizationId,
      },
    });
    campusIdB = campusB.id;

    const parent = await prisma.user.create({
      data: {
        email: parentEmail,
        password: "unused",
        role: "PARENT",
        organizationId,
      },
    });
    userId = parent.id;

    const camper = await prisma.camper.create({
      data: {
        name: `E2E Reassign Camper ${Date.now()}`,
        userId: parent.id,
        organizationId,
        homeCampusId: campusIdA,
      },
    });
    camperId = camper.id;

    const registration = await prisma.registration.create({
      data: {
        camperId: camper.id,
        campId,
        campusId: campusIdA,
        status: "PENDING",
      },
    });
    registrationId = registration.id;
  });

  test.afterAll(async () => {
    await prisma.registration.deleteMany({ where: { id: registrationId } });
    await prisma.camper.deleteMany({ where: { id: camperId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.campus.deleteMany({ where: { id: { in: [campusIdA, campusIdB] } } });
  });

  test("admin can reassign a single registration's campus via the detail drawer", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/registrations");

    // Locate the row and click it to open the drawer
    const row = page.locator("tbody tr").filter({ hasText: `E2E Reassign Camper` });
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.click();

    // The drawer should open. Wait for the select dropdown under Campus
    const drawer = page.locator('[role="dialog"]').filter({ hasText: 'E2E Reassign Camper' });
    const select = drawer.locator('div').filter({ has: page.locator('span', { hasText: 'Campus' }) }).locator('select');
    await expect(select).toBeVisible({ timeout: 15000 });

    // Reassign to Campus B
    await select.selectOption(campusIdB);

    // Verify database update
    await expect.poll(async () => {
      const reg = await prisma.registration.findUnique({ where: { id: registrationId } });
      return reg?.campusId;
    }, { timeout: 10000 }).toBe(campusIdB);

    // Close the drawer
    await page.getByRole("button", { name: "Close" }).click();
  });

  test("admin can reassign campus in bulk from registrations action bar", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/registrations");

    // Filter status and verify row is visible
    const row = page.locator("tbody tr").filter({ hasText: `E2E Reassign Camper` });
    await expect(row).toBeVisible({ timeout: 15000 });

    // Select the checkbox
    await row.locator('input[type="checkbox"]').first().click();

    // Click bulk reassign campus
    await page.getByRole("button", { name: "Reassign Campus" }).click();

    // In the dialog, select Campus A
    const dialogSelect = page.getByTestId("dialog-panel").locator("select");
    await dialogSelect.selectOption(campusIdA);

    // Click Reassign
    await page.getByRole("button", { name: "Reassign", exact: true }).click();

    // Verify database update back to Campus A
    await expect.poll(async () => {
      const reg = await prisma.registration.findUnique({ where: { id: registrationId } });
      return reg?.campusId;
    }, { timeout: 10000 }).toBe(campusIdA);

    await expect(page.getByText(/Reassigned 1 registration successfully/)).toBeVisible();
  });

  test("admin dashboard stat cards and filtered counts pull correct numbers", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/registrations");

    // 1. Verify "Total Registrations" card is visible
    const totalCard = page.getByRole("button").filter({ hasText: "Total Registrations" });
    await expect(totalCard).toBeVisible({ timeout: 15000 });

    // 2. Select Campus A in campus dropdown filter
    const campusSelect = page.locator('select').first();
    await campusSelect.selectOption(campusIdA);

    // 3. Verify showing 1 of 1 registrations in toolbar (since we created exactly 1 registration on Campus A)
    await expect(page.getByText(/Showing 1 of 1 registration/)).toBeVisible({ timeout: 15000 });
  });
});
