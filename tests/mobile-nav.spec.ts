import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

test.describe("Bottom tab nav — mobile", () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  test("admin sees the five requested destinations without More", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Contact" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "QR Scan" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Campers" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Leaderboard" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "More" })).toHaveCount(0);

    await nav.getByRole("link", { name: "Contact" }).click();
    await page.waitForURL(/\/admin\/camp-structure/);
    await expect(nav.getByRole("link", { name: "Contact" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "Camp Contact" })).toBeVisible();
  });

  test("teacher sees the five requested destinations without More", async ({ page }) => {
    await loginWithPassword(page, "teacher@camply.com", "password123");
    await page.waitForURL(/\/teacher/, { timeout: 15000 });

    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Contact" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "QR Scan" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Campers" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Attendance" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "More" })).toHaveCount(0);

    await nav.getByRole("link", { name: "Contact" }).click();
    await page.waitForURL(/\/teacher\/camp-contact/);
    await expect(page.getByRole("heading", { name: "Camp Contact" })).toBeVisible();
    await expect(page.getByRole("button", { name: /department options/i })).toHaveCount(0);

    await page.getByRole("tab", { name: "Organogram" }).click();
    await expect(page.getByTestId("camp-organogram")).toBeVisible();
    await expect(page.locator("[data-organogram-drag-handle]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add top-level role" })).toHaveCount(0);

    await page.getByRole("button", { name: "Chart", exact: true }).click();
    await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Zoom out" })).toBeVisible();
  });
});

test.describe("Bottom tab nav — desktop", () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 1280, height: 800 } });

  test("bottom nav is hidden, sidebar hamburger is absent", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await expect(page.getByRole("navigation", { name: "Primary" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Open menu" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
  });
});
