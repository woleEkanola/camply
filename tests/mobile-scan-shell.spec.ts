import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

/**
 * Mobile-only scan shell chrome: bottom tab bar (History · Scan · Search),
 * the floating search sheet replacing the permanent desktop search field,
 * and the history sheet. Runs under the "Mobile Chrome" project only
 * (tests/mobile-*.spec.ts) — see playwright.config.ts.
 */
test.describe("Scan Center - mobile shell (tab bar, search sheet, history sheet)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("bottom tab bar replaces the permanent search field; Search and History open their sheets", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/check-in");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Camp Arrival" })).toBeVisible();

    // The persistent desktop search field is hidden at this viewport.
    await expect(page.locator('input[placeholder*="Enter Registration #"]')).toBeHidden();

    // Tab bar is visible with History / Scan / Search.
    await expect(page.getByRole("button", { name: "Search" })).toBeVisible();
    await expect(page.getByRole("button", { name: "History" })).toBeVisible();

    // Search tab opens the search sheet.
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("heading", { name: "Search", exact: true })).toBeVisible();
    await expect(page.getByPlaceholder(/Name, registration number, or phone/)).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("heading", { name: "Search", exact: true })).not.toBeVisible();

    // History tab opens the history sheet (empty state, no scans yet this session).
    await page.getByRole("button", { name: "History" }).click();
    await expect(page.getByRole("heading", { name: "Session Scan History" })).toBeVisible();
    await expect(page.getByText("No scans yet this session.")).toBeVisible();
  });
});
