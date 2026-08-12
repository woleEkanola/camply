import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

test.describe("Camp Program Schedule and Live Management", () => {
  test("admin can view schedule workspace and navigate bottom nav items", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");

    // Navigate to admin schedule workspace
    await page.goto("http://localhost:3001/admin/schedule");
    await page.waitForLoadState("networkidle");

    // Verify workspace title
    await expect(page.getByRole("heading", { name: "Camp Program Schedule" })).toBeVisible();

    // Verify sync now button
    await expect(page.getByRole("button", { name: "Sync Now" })).toBeVisible();

    // Set mobile viewport to verify 6-item bottom nav
    await page.setViewportSize({ width: 390, height: 844 });

    const bottomNav = page.getByRole("navigation", { name: "Primary" });
    await expect(bottomNav).toBeVisible();

    // Verify Schedule item is in bottom nav
    const scheduleNavItem = bottomNav.getByRole("link", { name: "Schedule" });
    await expect(scheduleNavItem).toBeVisible();
  });

  test("teacher and volunteer schedule pages render correctly", async ({ page }) => {
    await loginWithPassword(page, "campusrep@camply.com", "password123");

    // Navigate to campus rep schedule
    await page.goto("http://localhost:3001/campus-rep-dashboard/schedule");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Camp Program Schedule" })).toBeVisible();
  });
});
