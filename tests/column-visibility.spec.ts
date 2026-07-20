import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

test.describe("Campuses column visibility", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("toggles column visibility and persists state across page reloads", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campuses");
    await expect(page.getByRole("heading", { name: "Campuses", exact: true })).toBeVisible();

    // Verify initial table headers are visible
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Address" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Code" })).toBeVisible();

    // Click Columns button to open dropdown
    const columnsBtn = page.locator("#column-visibility-menu-button");
    await expect(columnsBtn).toBeVisible();
    await columnsBtn.click();

    // Dropdown should be open
    const dropdown = page.locator("text=Visible Columns").first();
    await expect(dropdown).toBeVisible();

    // Toggle off Address and Code
    const addressCheckbox = page.getByLabel("Address");
    const codeCheckbox = page.getByLabel("Code");

    await addressCheckbox.uncheck();
    await codeCheckbox.uncheck();

    // Close dropdown by clicking the backdrop overlay
    await page.locator(".fixed.inset-0").click();

    // Address and Code headers should be hidden
    await expect(table.getByRole("columnheader", { name: "Address" })).not.toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Code" })).not.toBeVisible();

    // Reload page to test localStorage persistence
    await page.reload();
    await expect(page.getByRole("heading", { name: "Campuses", exact: true })).toBeVisible();

    // Headers should still be hidden after reload
    await expect(page.getByRole("table")).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Address" })).not.toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Code" })).not.toBeVisible();

    // Re-enable Address and Code columns
    await columnsBtn.click();
    await page.getByLabel("Address").check();
    await page.getByLabel("Code").check();
    await page.locator(".fixed.inset-0").click();

    // Headers should be visible again
    await expect(table.getByRole("columnheader", { name: "Address" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Code" })).toBeVisible();
  });
});
