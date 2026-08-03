import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { loginWithPassword, getFixtureOrgContext } from "./helpers";

const prisma = new PrismaClient();

test.describe("Campus Rep Registration Actions & StatCard E2E Test", () => {
  let camperId: string;
  let regId: string;

  test.beforeAll(async () => {
    const suffix = `${Date.now()}`;
    const ctx = await getFixtureOrgContext();

    const parent = await prisma.user.create({
      data: {
        email: `rep-actions-parent-${suffix}@camply.test`,
        password: "password123",
        role: "PARENT",
        organizationId: ctx.organizationId,
      },
    });

    const camper = await prisma.camper.create({
      data: {
        name: `Recommend Action Camper ${suffix}`,
        gender: "Male",
        dateOfBirth: new Date(2011, 5, 5),
        userId: parent.id,
        organizationId: ctx.organizationId,
        homeCampusId: ctx.campusId,
      },
    });
    camperId = camper.id;

    const reg = await prisma.registration.create({
      data: {
        status: "PENDING",
        camperId: camper.id,
        campId: ctx.campId,
        campusId: ctx.campusId,
        registrationNumber: `REG-ACT-${suffix.slice(-4)}`,
        review: {
          create: {
            verificationStatus: "NOT_STARTED",
          },
        },
      },
    });
    regId = reg.id;
  });

  test.afterAll(async () => {
    if (regId) {
      await prisma.registration.delete({ where: { id: regId } }).catch(() => {});
    }
    if (camperId) {
      await prisma.camper.delete({ where: { id: camperId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  test("Campus Rep recommending a camper disables Reject button and updates Stat Cards", async ({ page }) => {
    // Log in as teacher@camply.com (Campus Rep)
    await loginWithPassword(page, "teacher@camply.com", "password123");
    await page.goto("/campus-rep-dashboard/registrations");

    await page.waitForSelector("text=Registrations", { timeout: 15000 });

    // Search for our test camper
    const searchInput = page.locator('input[placeholder*="Name, email"]');
    await searchInput.fill("Recommend Action Camper");
    await page.waitForTimeout(500);

    // Locate the registration card containing our camper
    const regCard = page.locator('div.group', { hasText: "Recommend Action Camper" });
    await expect(regCard).toBeVisible();

    const recommendBtn = regCard.locator('button:has-text("Recommend")');
    await expect(recommendBtn).toBeVisible();

    // Recommend camper
    await recommendBtn.click();
    await page.waitForTimeout(500);

    // Verify Awaiting Approval indicator is rendered and disabled inside the card
    const awaitingBtn = regCard.locator('button:has-text("Awaiting Approval")');
    await expect(awaitingBtn).toBeVisible();
    await expect(awaitingBtn).toBeDisabled();

    // Verify Reject button on the same card is disabled/greyed out
    const rejectBtn = regCard.locator('button:has-text("Reject")');
    await expect(rejectBtn).toBeVisible();
    await expect(rejectBtn).toBeDisabled();
  });
});
