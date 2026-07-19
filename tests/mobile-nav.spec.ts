import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

/**
 * BottomNav (src/components/layout/BottomNav.tsx) + AppShell's off-canvas
 * drawer. Bottom tab bar is mobile-only (`md:hidden`), tabs navigate, and
 * the trailing "More" tab opens the same drawer the desktop hamburger uses.
 */
test.describe("Bottom tab nav — mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("renders, navigates, and More opens the drawer", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav).toBeVisible();

    // Curated 4 destinations + trailing "More" (getBottomNavItems("admin")).
    await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Registrations" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Check-in" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Campers" })).toBeVisible();
    const moreButton = nav.getByRole("button", { name: "More" });
    await expect(moreButton).toBeVisible();

    // Tapping a tab navigates and marks it active.
    await nav.getByRole("link", { name: "Registrations" }).click();
    await page.waitForURL(/\/admin\/registrations/);
    await expect(nav.getByRole("link", { name: "Registrations" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current", "page");

    // "More" opens the same off-canvas drawer the desktop hamburger uses.
    await moreButton.click();
    await expect(page.getByRole("button", { name: "Close menu" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Teachers" })).toBeVisible();
    await page.getByRole("button", { name: "Close menu" }).click();
    await expect(page.getByRole("button", { name: "Close menu" })).not.toBeVisible();
  });
});

test.describe("Bottom tab nav — desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("bottom nav is hidden, sidebar hamburger is absent", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await expect(page.getByRole("navigation", { name: "Primary" })).not.toBeVisible();
    // The mobile-only "Open menu" hamburger (`md:hidden`) shouldn't render at desktop width.
    await expect(page.getByRole("button", { name: "Open menu" })).not.toBeVisible();
    // Desktop keeps its own always-visible sidebar collapse control instead.
    await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
  });
});
