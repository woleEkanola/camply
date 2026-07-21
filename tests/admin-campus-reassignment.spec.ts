import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, switchRegistrationsToListView } from "./helpers";

test.describe("Admin: campus reassignment (single and bulk)", () => {
  test.describe.configure({ mode: "serial" });

  const parentEmail = `e2e-reassign-parent-${Date.now()}@camply.test`;
  const camperName = `E2E Reassign Camper ${Date.now()}`;
  let organizationId: string;
  let campId: string;
  let campusIdA: string;
  let campusIdB: string;
  let registrationId: string;
  let userId: string;
  let camperId: string;
  let campusNameB: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;
    const stamp = Date.now();

    const campusA = await prisma.campus.create({
      data: {
        name: `E2E Reassign Campus A ${stamp}`,
        slug: `e2e-reassign-campus-a-${stamp}`,
        address: "100 Campus A St",
        city: "Town A",
        country: "Country A",
        organizationId,
      },
    });
    campusIdA = campusA.id;

    campusNameB = `E2E Reassign Campus B ${stamp}`;
    const campusB = await prisma.campus.create({
      data: {
        name: campusNameB,
        slug: `e2e-reassign-campus-b-${stamp}`,
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
        name: camperName,
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
    await switchRegistrationsToListView(page);

    const search = page.getByPlaceholder("Name, email, or registration #");
    await search.fill(camperName);
    const row = page.locator("tbody tr").filter({ hasText: camperName });
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.click();

    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("heading", { name: "Registration Details" })).toBeVisible({ timeout: 15000 });

    // Campus select lives on the Overview tab
    const select = drawer.locator("select").filter({ has: page.locator(`option[value="${campusIdB}"]`) }).first();
    await expect(select).toBeVisible({ timeout: 15000 });
    await select.selectOption(campusIdB);

    await expect.poll(async () => {
      const reg = await prisma.registration.findUnique({ where: { id: registrationId } });
      return reg?.campusId;
    }, { timeout: 10000 }).toBe(campusIdB);

    await drawer.getByRole("button", { name: "Back" }).click();
  });

  test("admin can reassign campus in bulk from registrations action bar", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/registrations");
    await switchRegistrationsToListView(page);

    const search = page.getByPlaceholder("Name, email, or registration #");
    await search.fill(camperName);
    const row = page.locator("tbody tr").filter({ hasText: camperName });
    await expect(row).toBeVisible({ timeout: 15000 });

    await row.locator('input[type="checkbox"]').first().click();

    await page.getByRole("toolbar", { name: "Bulk actions" }).getByRole("button", { name: "Reassign Campus" }).click();

    const dialog = page.getByRole("dialog").filter({ hasText: "Reassign Campus" });
    await dialog.locator("select").selectOption(campusIdA);
    await dialog.getByRole("button", { name: "Reassign", exact: true }).click();

    await expect.poll(async () => {
      const reg = await prisma.registration.findUnique({ where: { id: registrationId } });
      return reg?.campusId;
    }, { timeout: 10000 }).toBe(campusIdA);

    await expect(page.getByText(/Reassigned 1 registration successfully/)).toBeVisible();
  });

  test("admin dashboard stat cards and filtered counts pull correct numbers", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/registrations");
    await switchRegistrationsToListView(page);

    const totalCard = page.getByRole("button").filter({ hasText: "Total Registrations" });
    await expect(totalCard).toBeVisible({ timeout: 15000 });

    // Campus filter is the first select in the filter row (All Campuses)
    const campusSelect = page.locator("select").filter({ has: page.locator('option:text-is("All Campuses")') }).first();
    await campusSelect.selectOption(campusIdA);

    await expect(page.getByText(/Showing 1 of 1 registration/)).toBeVisible({ timeout: 15000 });
  });
});
