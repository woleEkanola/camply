import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

test.describe("Campus Rep Registrations Page", () => {
  test.describe.configure({ mode: "serial" });

  test("renders registrations page with stats cards", async ({ page }) => {
    await loginWithPassword(page, "campusrep@camply.com", "password123");
    await expect(page).toHaveURL(/\/campus-rep-dashboard$/);

    await page.goto("/campus-rep-dashboard/registrations");
    await expect(page).toHaveURL(/\/campus-rep-dashboard\/registrations$/);

    await page.waitForTimeout(2000);

    await expect(page.getByRole("heading", { name: "Registrations" })).toBeVisible();

    await expect(page.getByText("Total Registrations")).toBeVisible();
  });

  test("card and list view toggle works", async ({ page }) => {
    await loginWithPassword(page, "campusrep@camply.com", "password123");
    await page.goto("/campus-rep-dashboard/registrations");
    await page.waitForTimeout(2000);

    const cardBtn = page.getByText("Card View");
    const listBtn = page.getByText("List View");

    await expect(cardBtn).toBeVisible();
    await expect(listBtn).toBeVisible();

    await page.getByText("List View").click();
    await page.waitForTimeout(500);
    await expect(page.locator("table")).toBeVisible();

    await page.getByText("Card View").click();
    await page.waitForTimeout(500);
    await expect(page.locator("table")).not.toBeVisible();
  });

  test("search filters registrations", async ({ page }) => {
    await loginWithPassword(page, "campusrep@camply.com", "password123");
    await page.goto("/campus-rep-dashboard/registrations");
    await page.waitForTimeout(2000);

    const searchInput = page.locator("input[placeholder*='Name, email']");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("zzzznonexistent");
    await page.waitForTimeout(1500);

    await expect(page.getByText("No registrations match your filters")).toBeVisible();
  });

  test("mobile viewport has no horizontal overflow", async ({ page }) => {
    await loginWithPassword(page, "campusrep@camply.com", "password123");
    await page.goto("/campus-rep-dashboard/registrations");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForLoadState("networkidle");

    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth
    );
    expect(scrollWidth).toBeLessThanOrEqual(390);
  });
});
