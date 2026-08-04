import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

test.describe("Multi-Tenant Branding System - Headed Verification", () => {
  test("Organization Admin branding page renders Brand Logo and optional override cards", async ({ page }) => {
    await loginWithPassword(page, "admin@test.com", "admin123");

    // Navigate to Organization Branding
    await page.goto("/admin/communication/branding");
    await page.waitForSelector("h1:has-text('Organization Branding')");

    // Verify sections
    await expect(page.locator("h2:has-text('Brand Identity')")).toBeVisible();
    await expect(page.locator("h2:has-text('Optional Overrides')")).toBeVisible();
    await expect(page.locator("h3:has-text('Real-Time Branding Preview')")).toBeVisible();

    // Verify preset badges
    await expect(page.locator("text=Wide Preset")).toBeVisible();
    await expect(page.locator("text=Banner Preset")).toBeVisible();
    await expect(page.locator("text=Square Preset")).toBeVisible();
  });

  test("Super Admin platform branding page renders platform controls", async ({ page }) => {
    await loginWithPassword(page, "superadmin@test.com", "admin123");

    // Navigate to Super Admin Platform Branding
    await page.goto("/super-admin/branding");
    await page.waitForSelector("h1:has-text('Platform Branding')");

    // Verify platform controls
    await expect(page.locator("text=Camply Platform Logo")).toBeVisible();
    await expect(page.locator("text=Browser Favicon & PWA App Icons")).toBeVisible();
    await expect(page.locator("text=Default Email Header Logo")).toBeVisible();
  });
});
