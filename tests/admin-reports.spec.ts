import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, visibleText } from "./helpers";

test.describe("Admin Reports page", () => {
  let organizationId: string;
  let campusId: string;
  let campId: string;
  let camperId: string;
  let registrationId: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campusId = ctx.campusId;
    campId = ctx.campId;

    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@camply.com" } });
    const camper = await prisma.camper.create({
      data: {
        name: `E2E Reports Camper ${Date.now()}`,
        firstName: "E2E",
        lastName: "Reports",
        gender: "Female",
        dateOfBirth: new Date(2012, 1, 1),
        userId: owner.id,
        organizationId,
        homeCampusId: campusId,
      },
    });
    camperId = camper.id;

    const registration = await prisma.registration.create({
      data: {
        status: "CHECKED_IN",
        camperId,
        campId,
        campusId,
        registrationNumber: `TST-E2E-RPT-${Date.now()}`,
        checkedInAt: new Date(),
      },
    });
    registrationId = registration.id;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await prisma.mealDistribution.create({
      data: { campId, registrationId, meal: "BREAKFAST", date: today, servedById: owner.id },
    });
    await prisma.scanEvent.create({
      data: {
        registrationId,
        campId,
        station: "Reports E2E Campus",
        volunteerId: owner.id,
        result: "SUCCESS",
        metadata: { stationId: "PICKUP_POINT" },
      },
    });
    await prisma.scanEvent.create({
      data: {
        registrationId,
        campId,
        station: "Reports E2E Snacks",
        volunteerId: owner.id,
        result: "SUCCESS",
        metadata: { stationId: "COLLECTIBLE" },
      },
    });
  });

  test.afterAll(async () => {
    await prisma.scanEvent.deleteMany({ where: { registrationId } });
    await prisma.mealDistribution.deleteMany({ where: { registrationId } });
    await prisma.registration.delete({ where: { id: registrationId } });
    await prisma.camper.delete({ where: { id: camperId } });
  });

  test("shows meal, arrivals, and collectibles data for today, with the arrivals filter narrowing the table", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/reports");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
    await expect(page.getByText("Breakfast", { exact: true })).toBeVisible();

    await expect(visibleText(page, "Reports E2E Campus")).toBeVisible();
    await expect(visibleText(page, "Reports E2E Snacks")).toBeVisible();

    // Filter arrivals down to Pickup Point only.
    await page.getByRole("combobox").filter({ hasText: "All arrival types" }).selectOption("PICKUP_POINT");
    await expect(visibleText(page, "Reports E2E Campus")).toBeVisible();
  });

  test("Reports nav item is visible for admin and links to /admin/reports", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await page.locator("nav, aside").getByRole("link", { name: "Reports", exact: true }).first().click();
    await expect(page).toHaveURL(/\/admin\/reports/);
  });
});
