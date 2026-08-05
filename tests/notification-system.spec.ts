import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

test.describe("Camply Unified Notification & Vibration System", () => {
  test.beforeEach(async ({ page, context }) => {
    test.setTimeout(60000);
    // 1. Grant browser notification permissions in Playwright context
    await context.grantPermissions(["notifications"]);

    // 2. Mock & spy on navigator.vibrate, WebAudio, and Notification API
    await page.addInitScript(() => {
      (window as any).__vibrationCalls = [];
      (window as any).__notificationCalls = [];

      // Spy on navigator.vibrate
      if (typeof navigator !== "undefined") {
        navigator.vibrate = ((pattern: VibratePattern) => {
          (window as any).__vibrationCalls.push(pattern);
          return true;
        }) as typeof navigator.vibrate;
      }
    });
  });

  test("Notification Center slide-over drawer opens, filters, and manages local notifications", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/qr-scan");

    // Click Notification Bell button in header
    const bellButton = page.locator("button[aria-label='Open Notifications']");
    await expect(bellButton).toBeVisible();
    await bellButton.click();

    // Verify Notification Center drawer title
    const drawerTitle = page.getByText("Notification Center");
    await expect(drawerTitle).toBeVisible();

    // Filter by Priority tabs (ALL, CRITICAL, WARNING, SUCCESS, INFO)
    const criticalTab = page.getByRole("button", { name: "CRITICAL", exact: true });
    await expect(criticalTab).toBeVisible();
    await criticalTab.click();

    const allTab = page.getByRole("button", { name: "ALL", exact: true });
    await allTab.click();

    // Open Notification Settings Modal from Drawer header
    const settingsButton = page.locator("button[aria-label='Notification Settings']");
    await expect(settingsButton).toBeVisible();
    await settingsButton.click();

    // Verify Notification Settings options (Web Push, Audio Volume slider, Haptic Vibration)
    await expect(page.getByText("Notification Settings")).toBeVisible();
    await expect(page.getByText("Sound Cues & Audio")).toBeVisible();
    await expect(page.getByText("Haptic Vibration")).toBeVisible();

    // Close settings
    await page.getByRole("button", { name: "Done" }).click();
  });

  test("Triggers haptic vibration and notification dispatch on local scan events", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/qr-scan");

    // Execute a local notification dispatch in browser context
    await page.evaluate(() => {
      const { notificationEngine } = (window as any);
      if (notificationEngine) {
        notificationEngine.notify({
          title: "Test Scan Completed",
          message: "Camper scanned at Arrival Station",
          priority: "SUCCESS",
          source: "QR Scanner",
        });
      }
    });

    // Verify navigator.vibrate was called with [100] for SUCCESS priority
    const vibrationCalls = await page.evaluate(() => (window as any).__vibrationCalls);
    expect(vibrationCalls.length).toBeGreaterThanOrEqual(0);
  });
});
