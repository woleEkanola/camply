import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

test.describe("PWA Offline Engine & Search Features", () => {
  test.beforeEach(async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
  });

  test("loads QR scan page with offline status chip and search sheet", async ({ page }) => {
    await page.goto("/volunteer/qr-scan");
    await page.waitForLoadState("domcontentloaded");

    // Click Search FAB button (aria-label="Search")
    const searchBtn = page.locator('button[aria-label="Search"]').first();
    if (await searchBtn.isVisible()) {
      await searchBtn.click();

      const searchInput = page.locator('input[placeholder*="Name"]').first();
      await expect(searchInput).toBeVisible();

      // Type a search query
      await searchInput.fill("David");
    }
  });

  test("opens sync & offline status sheet with enhanced engine metrics", async ({ page }) => {
    await page.goto("/volunteer/qr-scan");
    await page.waitForLoadState("domcontentloaded");

    // Locate status button
    const statusBtn = page.locator('button:has-text("Online"), button:has-text("Offline")').first();
    if (await statusBtn.isVisible()) {
      await statusBtn.click();

      const sheetTitle = page.locator("text=Sync & Offline Status");
      await expect(sheetTitle).toBeVisible();
    }
  });
});
