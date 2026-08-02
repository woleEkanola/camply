import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { loginWithPassword, getFixtureOrgContext } from "./helpers";

const prisma = new PrismaClient();

test.describe("Camper Tribe Allocation & Staff Photo-Only Edit E2E Test", () => {
  let createdCamperIds: string[] = [];
  let tribeId: string;
  let tribeName: string;

  test.afterAll(async () => {
    if (createdCamperIds.length > 0) {
      await prisma.registration.deleteMany({ where: { camperId: { in: createdCamperIds } } });
      await prisma.camper.deleteMany({ where: { id: { in: createdCamperIds } } });
    }
    if (tribeId) {
      await prisma.tribe.delete({ where: { id: tribeId } });
    }
    await prisma.$disconnect();
  });

  test("1. Admin can reassign Tribe in EditCamperModal under Camp Allocation tab", async ({ page }) => {
    const suffix = `${Date.now()}`;
    const camperName = `Allocation Camper ${suffix}`;
    tribeName = `Tribe ${suffix.slice(-4)}`;
    const email = `alloc-camper-${suffix}@camply.test`;

    const ctx = await getFixtureOrgContext();

    const tribe = await prisma.tribe.create({
      data: { name: tribeName, campId: ctx.campId, color: "#4f46e5" },
    });
    tribeId = tribe.id;

    const parent = await prisma.user.create({
      data: { email, password: "password123", role: "PARENT", organizationId: ctx.organizationId },
    });

    const camper = await prisma.camper.create({
      data: {
        name: camperName,
        firstName: "Alloc",
        lastName: `Camper ${suffix}`,
        gender: "Male",
        dateOfBirth: new Date(2013, 2, 10),
        userId: parent.id,
        organizationId: ctx.organizationId,
        homeCampusId: ctx.campusId,
      },
    });
    createdCamperIds.push(camper.id);

    await prisma.registration.create({
      data: {
        status: "APPROVED",
        camperId: camper.id,
        campId: ctx.campId,
        campusId: ctx.campusId,
        registrationNumber: `ALLOC-REG-${suffix.slice(-5)}`,
      },
    });

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campers");

    await page.waitForSelector("text=Campers", { timeout: 15000 });

    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill(camperName);
    await page.waitForTimeout(500);

    const camperCard = page.locator("div.group", { hasText: camperName });
    await expect(camperCard).toBeVisible({ timeout: 10000 });
    await camperCard.locator("button", { hasText: /^Edit$/i }).click();

    const dialogPanel = page.locator('[data-testid="dialog-panel"]');
    await expect(dialogPanel).toBeVisible({ timeout: 10000 });

    const allocTab = dialogPanel.locator("button", { hasText: "Camp Allocation" });
    await expect(allocTab).toBeVisible();
    await allocTab.click();

    const tribeSelect = dialogPanel.locator("select").filter({ has: page.locator("option", { hasText: tribeName }) });
    await expect(tribeSelect).toBeVisible();
    await tribeSelect.selectOption(tribeId);

    await dialogPanel.locator('button[type="submit"]', { hasText: "Save Changes" }).click();
    await expect(dialogPanel).not.toBeVisible({ timeout: 10000 });

    const regInDb = await prisma.registration.findFirst({ where: { camperId: camper.id } });
    expect(regInDb?.tribeId).toBe(tribeId);
  });

  test("2. Teacher campers page displays Edit Photo button opening Photo-Only mode modal", async ({ page }) => {
    const suffix = `${Date.now()}`;
    const camperName = `Photo Camper ${suffix}`;
    const email = `photo-camper-${suffix}@camply.test`;

    const ctx = await getFixtureOrgContext();

    const parent = await prisma.user.create({
      data: { email, password: "password123", role: "PARENT", organizationId: ctx.organizationId },
    });

    const camper = await prisma.camper.create({
      data: {
        name: camperName,
        firstName: "Photo",
        lastName: `Camper ${suffix}`,
        gender: "Female",
        dateOfBirth: new Date(2014, 5, 15),
        userId: parent.id,
        organizationId: ctx.organizationId,
        homeCampusId: ctx.campusId,
      },
    });
    createdCamperIds.push(camper.id);

    await prisma.registration.create({
      data: {
        status: "APPROVED",
        camperId: camper.id,
        campId: ctx.campId,
        campusId: ctx.campusId,
        registrationNumber: `PHOTO-REG-${suffix.slice(-5)}`,
      },
    });

    await loginWithPassword(page, "teacher@camply.com", "password123");
    await page.goto("/teacher/campers");

    await page.waitForSelector("div.group, table", { timeout: 15000 });

    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill(camperName);
    await page.waitForTimeout(500);

    const camperCard = page.locator("div.group", { hasText: camperName });
    await expect(camperCard).toBeVisible({ timeout: 10000 });

    const editPhotoBtn = camperCard.locator("button", { hasText: /Edit Photo/i });
    await expect(editPhotoBtn).toBeVisible({ timeout: 10000 });

    await editPhotoBtn.click();

    const dialogPanel = page.locator('[data-testid="dialog-panel"]');
    await expect(dialogPanel).toBeVisible({ timeout: 10000 });

    await expect(dialogPanel).toContainText("Update Camper Photo");
    await expect(dialogPanel.locator("button", { hasText: /Upload \/ Take Photo|Change Photo/i })).toBeVisible();

    await expect(dialogPanel.locator("button", { hasText: "Personal Info" })).toHaveCount(0);
    await expect(dialogPanel.locator("button", { hasText: "Medical & Health" })).toHaveCount(0);
  });
});
