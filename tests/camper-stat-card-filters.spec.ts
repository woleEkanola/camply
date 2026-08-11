import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { loginWithPassword, getFixtureOrgContext } from "./helpers";

const prisma = new PrismaClient();

test.describe("Camper Stat Card Filtering E2E Test", () => {
  let maleCamperId: string;
  let femaleCamperId: string;

  test.beforeAll(async () => {
    const suffix = `${Date.now()}`;
    const ctx = await getFixtureOrgContext();

    const parent = await prisma.user.create({
      data: {
        email: `stat-parent-${suffix}@camply.test`,
        password: "password123",
        role: "PARENT",
        organizationId: ctx.organizationId,
      },
    });

    // Create Male Camper
    const maleCamper = await prisma.camper.create({
      data: {
        name: `Stat Male Camper ${suffix}`,
        gender: "Male",
        dateOfBirth: new Date(2012, 1, 1),
        userId: parent.id,
        organizationId: ctx.organizationId,
        homeCampusId: ctx.campusId,
      },
    });
    maleCamperId = maleCamper.id;

    await prisma.registration.create({
      data: {
        status: "APPROVED",
        camperId: maleCamper.id,
        campId: ctx.campId,
        campusId: ctx.campusId,
        registrationNumber: `REG-MALE-${suffix.slice(-4)}`,
      },
    });

    // Create Female Camper
    const femaleCamper = await prisma.camper.create({
      data: {
        name: `Stat Female Camper ${suffix}`,
        gender: "Female",
        dateOfBirth: new Date(2013, 3, 3),
        userId: parent.id,
        organizationId: ctx.organizationId,
        homeCampusId: ctx.campusId,
      },
    });
    femaleCamperId = femaleCamper.id;

    await prisma.registration.create({
      data: {
        status: "APPROVED",
        camperId: femaleCamper.id,
        campId: ctx.campId,
        campusId: ctx.campusId,
        registrationNumber: `REG-FEMALE-${suffix.slice(-4)}`,
      },
    });
  });

  test.afterAll(async () => {
    const ids = [maleCamperId, femaleCamperId].filter(Boolean);
    if (ids.length > 0) {
      await prisma.registration.deleteMany({ where: { camperId: { in: ids } } });
      await prisma.camper.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.$disconnect();
  });

  test("1. Admin clicking StatCard filters list and unhighlights previously selected card", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campers");

    await page.waitForSelector("text=Campers", { timeout: 15000 });

    const maleStatCard = page.locator('[data-testid="camper-stat-male"]');
    const femaleStatCard = page.locator('[data-testid="camper-stat-female"]');
    const genderSelect = page.locator('select[aria-label="Filter by Gender"]');

    // Click Male StatCard
    await maleStatCard.click();
    await page.waitForTimeout(300);
    await expect(genderSelect).toHaveValue("Male");
    await expect(maleStatCard).toHaveClass(/border-accent-500/);

    // Click Female StatCard -> Male StatCard MUST be unhighlighted/deselected
    await femaleStatCard.click();
    await page.waitForTimeout(300);
    await expect(genderSelect).toHaveValue("Female");
    await expect(femaleStatCard).toHaveClass(/border-accent-500/);
    await expect(maleStatCard).not.toHaveClass(/border-accent-500/);

    // Click Female StatCard again to clear
    await femaleStatCard.click();
    await page.waitForTimeout(300);
    await expect(genderSelect).toHaveValue("");
    await expect(femaleStatCard).not.toHaveClass(/border-accent-500/);
  });

  test("2. Teacher clicking StatCard filters campers list", async ({ page }) => {
    await loginWithPassword(page, "teacher@camply.com", "password123");
    await page.goto("/teacher/campers");

    await page.waitForSelector("div.group, table", { timeout: 15000 });

    const approvedStatCard = page.locator('[data-testid="camper-stat-approved"]');
    await expect(approvedStatCard).toBeVisible();

    // Click Approved StatCard
    await approvedStatCard.click();
    await page.waitForTimeout(300);

    const statusSelect = page.locator("select").filter({ has: page.locator('option[value="APPROVED"]') });
    await expect(statusSelect).toHaveValue("APPROVED");
    await expect(approvedStatCard).toHaveClass(/border-accent-500/);
  });
});
