import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { loginWithPassword, getFixtureOrgContext } from "./helpers";

const prisma = new PrismaClient();

test.describe("Camper Card View Default & Multi-Tab Profile Editor E2E Test", () => {
  let camperName: string;
  let camperId: string;

  test.beforeAll(async () => {
    const suffix = `${Date.now()}`;
    camperName = `PW Camper ${suffix}`;
    const email = `pw-camper-${suffix}@camply.test`;

    const ctx = await getFixtureOrgContext();

    const parent = await prisma.user.create({
      data: {
        email,
        password: "password123",
        role: "PARENT",
        organizationId: ctx.organizationId,
      },
    });

    const camper = await prisma.camper.create({
      data: {
        name: camperName,
        firstName: "PW",
        lastName: `Camper ${suffix}`,
        gender: "Male",
        dateOfBirth: new Date(2012, 4, 15),
        photoUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120",
        userId: parent.id,
        organizationId: ctx.organizationId,
        homeCampusId: ctx.campusId,
        allergies: "Seafood",
        medicalConditions: "Mild Asthma",
        parentPhone: "+15551234567",
        school: "Oakwood High",
        church: "Grace Church",
      },
    });
    camperId = camper.id;

    await prisma.registration.create({
      data: {
        status: "APPROVED",
        camperId: camper.id,
        campId: ctx.campId,
        campusId: ctx.campusId,
        registrationNumber: `PW-REG-${suffix.slice(-5)}`,
      },
    });
  });

  test.afterAll(async () => {
    if (camperId) {
      await prisma.registration.deleteMany({ where: { camperId } });
      await prisma.camper.delete({ where: { id: camperId } });
    }
    await prisma.$disconnect();
  });

  test("1. Admin campers page defaults to Card View with correct toggle order & no card Delete button", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campers");

    // Wait for page loading to settle
    await page.waitForSelector("text=Campers", { timeout: 15000 });

    // Verify Card View is selected by default
    const cardToggleBtn = page.locator("button", { hasText: /^Card$/i });
    await expect(cardToggleBtn).toBeVisible();
    await expect(cardToggleBtn).toHaveClass(/bg-surface/);

    // Verify toggle order: Card View, Thumbnail, List View
    const toggleButtons = page.locator("div.flex.items-center.rounded-lg.bg-surface-raised button");
    await expect(toggleButtons.nth(0)).toHaveText("Card");
    await expect(toggleButtons.nth(1)).toHaveText("Thumbnail");
    await expect(toggleButtons.nth(2)).toHaveText("List");

    // Search for our test camper
    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill(camperName);
    await page.waitForTimeout(500);

    // Verify camper card is displayed
    const camperCard = page.locator("div.group", { hasText: camperName });
    await expect(camperCard).toBeVisible();

    // Verify Edit button is visible on card, but NO standalone Delete button on card
    const editBtn = camperCard.locator("button", { hasText: /^Edit$/i });
    await expect(editBtn).toBeVisible();

    const deleteBtn = camperCard.locator("button", { hasText: /^Delete$/i });
    await expect(deleteBtn).toHaveCount(0);
  });

  test("2. Teacher campers page defaults to Card View", async ({ page }) => {
    await loginWithPassword(page, "teacher@camply.com", "password123");
    await page.goto("/teacher/campers");

    await page.waitForSelector("text=Campers", { timeout: 15000 });

    // Verify Card View is selected by default
    const cardToggleBtn = page.locator("button", { hasText: /^Card$/i });
    await expect(cardToggleBtn).toBeVisible();
    await expect(cardToggleBtn).toHaveClass(/bg-surface/);
  });

  test("3. EditCamperModal multi-tab profile editor updates personal, photo upload, contact, medical & school details", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campers");

    await page.waitForSelector("text=Campers", { timeout: 15000 });

    // Search for test camper
    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill(camperName);
    await page.waitForTimeout(500);

    // Click Edit button on card
    const camperCard = page.locator("div.group", { hasText: camperName });
    await camperCard.locator("button", { hasText: /^Edit$/i }).click();

    // Verify EditCamperModal dialog panel opens
    const dialogPanel = page.locator('[data-testid="dialog-panel"]');
    await expect(dialogPanel).toBeVisible({ timeout: 10000 });

    // Verify Upload Photo button is present and text input for Photo URL is NOT present
    const uploadPhotoBtn = dialogPanel.locator("button", { hasText: "Upload Photo" });
    await expect(uploadPhotoBtn).toBeVisible();

    const photoUrlInput = dialogPanel.locator('input[label="Photo URL"]');
    await expect(photoUrlInput).toHaveCount(0);

    // Check tabs are visible: Personal Info, Contact & Address, Medical & Health, School & Church, Danger Zone
    await expect(dialogPanel.locator("button", { hasText: "Personal Info" })).toBeVisible();
    await expect(dialogPanel.locator("button", { hasText: "Contact & Address" })).toBeVisible();
    await expect(dialogPanel.locator("button", { hasText: "Medical & Health" })).toBeVisible();
    await expect(dialogPanel.locator("button", { hasText: "School & Church" })).toBeVisible();
    await expect(dialogPanel.locator("button", { hasText: "Danger Zone" })).toBeVisible();

    // Switch to Contact & Address tab
    await dialogPanel.locator("button", { hasText: "Contact & Address" }).click();
    const parentPhoneInput = dialogPanel.locator('input[placeholder="+1 (555) 000-0000"]');
    await expect(parentPhoneInput).toBeVisible();
    await parentPhoneInput.fill("+19876543210");

    // Switch to Medical & Health tab
    await dialogPanel.locator("button", { hasText: "Medical & Health" }).click();
    const allergiesInput = dialogPanel.locator('textarea[placeholder*="allergies"]');
    await expect(allergiesInput).toBeVisible();
    await allergiesInput.fill("Seafood, Peanuts, Dairy");

    // Switch to School & Church tab
    await dialogPanel.locator("button", { hasText: "School & Church" }).click();
    const schoolInput = dialogPanel.locator('input[placeholder="Camper\'s School"]');
    await expect(schoolInput).toBeVisible();
    await schoolInput.fill("St. Jude Academy");

    // Save changes
    await dialogPanel.locator('button[type="submit"]', { hasText: "Save Changes" }).click();

    // Modal should close
    await expect(dialogPanel).not.toBeVisible({ timeout: 10000 });

    // Verify updated values in Prisma DB
    const updatedCamper = await prisma.camper.findUnique({ where: { id: camperId } });
    expect(updatedCamper).not.toBeNull();
    expect(updatedCamper?.parentPhone).toBe("+19876543210");
    expect(updatedCamper?.allergies).toBe("Seafood, Peanuts, Dairy");
    expect(updatedCamper?.school).toBe("St. Jude Academy");
  });
});
