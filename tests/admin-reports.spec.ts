import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

test.describe("Admin Reports page", () => {
  let organizationId: string;
  let campusId: string;
  let campId: string;
  let camperId: string;
  let registrationId: string;

  test.beforeEach(async () => {
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

  test.afterEach(async () => {
    if (registrationId) {
      await prisma.scanEvent.deleteMany({ where: { registrationId } });
      await prisma.mealDistribution.deleteMany({ where: { registrationId } });
      await prisma.registration.delete({ where: { id: registrationId } }).catch(() => {});
    }
    if (camperId) {
      await prisma.camper.delete({ where: { id: camperId } }).catch(() => {});
    }
  });

  test("shows live operational report covering all QR stations and live refresh controls", async ({ page }) => {
    test.setTimeout(60000);
    page.on("console", (msg) => console.log("PAGE CONSOLE:", msg.text()));
    page.on("pageerror", (err) => console.error("PAGE ERROR:", err));
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/reports");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Operations & Station Reports" })).toBeVisible();
    await expect(page.getByText(/Live \(3s\)/)).toBeVisible();
    await expect(page.getByText("Total Expected")).toBeVisible();
    await expect(page.getByText("Checked In (Camp)")).toBeVisible();
    await expect(page.getByText("Boarded Bus", { exact: true })).toBeVisible();

    await expect(page.getByText("Breakfast", { exact: true })).toBeVisible();
    await expect(page.getByText("Reports E2E Campus")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Reports E2E Snacks")).toBeVisible({ timeout: 15000 });

    // Switch tab to Bus Boarding
    await page.getByRole("button", { name: "Bus Boarding" }).click();
    await expect(page.getByRole("heading", { name: "Bus Boarding / Pickup Points" })).toBeVisible();
    await expect(page.getByText("Reports E2E Campus")).toBeVisible();

    // Switch tab to Collectibles
    await page.getByRole("button", { name: "Collectibles" }).click();
    await expect(page.getByRole("heading", { name: "Collectibles & Items Distribution" })).toBeVisible();
    await expect(page.getByText("Reports E2E Snacks")).toBeVisible();
  });

  test("Reports nav item is visible for admin and links to /admin/reports", async ({ page }) => {
    test.setTimeout(60000);
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await page.locator("nav, aside").getByRole("link", { name: "Reports", exact: true }).first().click();
    await expect(page).toHaveURL(/\/admin\/reports/);
  });
});
