import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

/**
 * Check-in and check-out are unified into one "QR Scan" page per area —
 * the old routes must redirect (not 404) so existing bookmarks/links keep
 * working. See next.config.ts's redirects().
 */
test.describe("QR Scan route consolidation — old check-in/check-out URLs redirect", () => {
  test("admin check-in/check-out redirect to /admin/qr-scan", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");

    await page.goto("/admin/check-in");
    await expect(page).toHaveURL(/\/admin\/qr-scan$/);

    await page.goto("/admin/check-out");
    await expect(page).toHaveURL(/\/admin\/qr-scan$/);
  });
});
