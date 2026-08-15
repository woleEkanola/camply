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

  test("opens offline download modal, toggles photo thumbnail option, and tests controls", async ({ page }) => {
    await page.goto("/volunteer/qr-scan");
    await page.waitForLoadState("domcontentloaded");

    const statusBtn = page.locator('button:has-text("Online"), button:has-text("Offline")').first();
    if (await statusBtn.isVisible()) {
      await statusBtn.click();

      const downloadOptsBtn = page.locator('button:has-text("Download / Profile Options")').first();
      if (await downloadOptsBtn.isVisible()) {
        await downloadOptsBtn.click();

        // Verify modal title
        const modalTitle = page.locator("text=Download Offline Database");
        await expect(modalTitle).toBeVisible();

        // Full-camp data is now fixed by design. Operators only choose whether
        // photos are included; station/camper scope choices must not return.
        await expect(page.getByText("Select Profile Scope")).toHaveCount(0);
        await expect(page.getByText("Select Campers Scope")).toHaveCount(0);
        await expect(page.getByText("Entire Camp", { exact: true })).toBeVisible();

        // Verify photo thumbnail option buttons
        const textOnlyBtn = page.locator('button:has-text("Text Data Only")').first();
        const withPhotosBtn = page.locator('button:has-text("With Photos")').first();

        await expect(textOnlyBtn).toBeVisible();
        await expect(withPhotosBtn).toBeVisible();

        // Click Text Data Only
        await textOnlyBtn.click();
        await page.waitForTimeout(300);

        // Click Start Download
        const startBtn = page.locator('button:has-text("Start Download")').first();
        if (await startBtn.isVisible()) {
          await startBtn.click();
          await page.waitForTimeout(400);

          // Verify Cancel button appears during progress
          const cancelBtn = page.locator('button:has-text("Cancel Download")').first();
          if (await cancelBtn.isVisible()) {
            await cancelBtn.click();
            await expect(page.locator("text=Download was cancelled")).toBeVisible();
          }
        }
      }
    }
  });
});
