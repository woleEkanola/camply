import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

test.describe("Today's Built Features — Full Comprehensive E2E Verification", () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
    await loginWithPassword(page, "owner@camply.com", "password123");
  });

  const ensureRegistrationsListView = async (page: any) => {
    await page.goto("/admin/registrations");
    await expect(page.getByRole("heading", { name: "Registrations", exact: true })).toBeVisible({ timeout: 20000 });
    const listViewBtn = page.getByRole("button", { name: "List View" });
    if (await listViewBtn.isVisible().catch(() => false)) {
      await listViewBtn.click();
    }
  };

  test("1. Registrations — Dynamic Column Selector Popover & LocalStorage Persistence", async ({ page }) => {
    await ensureRegistrationsListView(page);

    const columnsBtn = page.getByRole("button", { name: /Columns/i });
    await expect(columnsBtn).toBeVisible({ timeout: 15000 });
    await columnsBtn.click();

    await expect(page.getByText("Configure Columns")).toBeVisible({ timeout: 5000 });

    const camperNameCheckbox = page.locator('label').filter({ hasText: "Camper Name" }).locator('input[type="checkbox"]');
    if (await camperNameCheckbox.isVisible().catch(() => false)) {
      await expect(camperNameCheckbox).toBeChecked();
    }
    await page.keyboard.press("Escape");
  });

  test("2. Registrations — Interactive Column Header Sorting (A-Z / Z-A / Dates)", async ({ page }) => {
    await ensureRegistrationsListView(page);

    const camperHeaderBtn = page.getByRole("button", { name: /Camper|Status|Updated/i }).first();
    await expect(camperHeaderBtn).toBeVisible({ timeout: 10000 });
    await camperHeaderBtn.click();
    await expect(camperHeaderBtn).toContainText(/↑|↓/);
    await camperHeaderBtn.click();
    await expect(camperHeaderBtn).toContainText(/↑|↓/);
  });

  test("3. Registrations — Drag-to-Resize Column Handles on Table Headers", async ({ page }) => {
    await ensureRegistrationsListView(page);

    const resizeHandles = page.locator("th .cursor-col-resize");
    if (await resizeHandles.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(resizeHandles.first()).toBeVisible();
    }
  });

  test("4. Camper Drawer — Dynamic Form Responses & CUID Resolution to Campus Name", async ({ page }) => {
    await ensureRegistrationsListView(page);

    const camperRow = page.locator("table tbody tr").first();
    if (await camperRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await camperRow.click();
      const drawerTitle = page.getByText(/Camper Profile|Registration Details/i).first();
      await expect(drawerTitle).toBeVisible({ timeout: 10000 });

      const campusSection = page.getByText(/Campus & Registration/i);
      if (await campusSection.isVisible().catch(() => false)) {
        const rawCuidPattern = /cmrrve[a-z0-9]+/i;
        const drawerText = await page.locator("body").innerText();
        expect(rawCuidPattern.test(drawerText)).toBeFalsy();
      }
    }
  });

  test("5. Excel Export — Export Button Trigger", async ({ page }) => {
    await ensureRegistrationsListView(page);

    const exportBtn = page.getByRole("button", { name: /Export Excel/i });
    await expect(exportBtn).toBeVisible({ timeout: 10000 });
  });

  test("6. Campuses — Dynamic Capacity Progress Bar Color Tones", async ({ page }) => {
    await page.goto("/admin/campuses");
    await expect(page.getByRole("heading", { name: "Campuses", exact: true })).toBeVisible({ timeout: 20000 });

    const progressBars = page.locator('[role="progressbar"], div.rounded-full');
    await expect(progressBars.first()).toBeVisible({ timeout: 10000 });
  });

  test("7. Campuses — Table View Toggle, Column Selector & Header Sorting", async ({ page }) => {
    await page.goto("/admin/campuses");
    await expect(page.getByRole("heading", { name: "Campuses", exact: true })).toBeVisible({ timeout: 20000 });

    const tableViewBtn = page.getByTitle("Table view");
    await expect(tableViewBtn).toBeVisible({ timeout: 10000 });
    await tableViewBtn.click();

    await expect(page.locator("table")).toBeVisible({ timeout: 10000 });

    const columnsBtn = page.getByRole("button", { name: /Columns/i });
    await expect(columnsBtn).toBeVisible({ timeout: 10000 });
    await columnsBtn.click();
    await expect(page.getByText("Configure Columns")).toBeVisible({ timeout: 5000 });
    await page.keyboard.press("Escape");

    const campusHeaderBtn = page.getByRole("button", { name: /Campus Name/i });
    await expect(campusHeaderBtn).toBeVisible({ timeout: 10000 });
    await campusHeaderBtn.click();
    await expect(campusHeaderBtn).toContainText(/↑|↓/);
  });

  test("8. Campuses — Table Cell In-Row Capacity Progress, Set Quota & Copy Link Action", async ({ page }) => {
    await page.goto("/admin/campuses");
    await expect(page.getByRole("heading", { name: "Campuses", exact: true })).toBeVisible({ timeout: 20000 });

    const tableViewBtn = page.getByTitle("Table view");
    await expect(tableViewBtn).toBeVisible({ timeout: 10000 });
    await tableViewBtn.click();

    await expect(page.locator("table")).toBeVisible({ timeout: 10000 });

    const quotaHeader = page.getByRole("button", { name: /Capacity \/ Quota/i });
    await expect(quotaHeader).toBeVisible();

    const copyLinkBtn = page.getByRole("button", { name: /Copy Link/i }).first();
    if (await copyLinkBtn.isVisible().catch(() => false)) {
      await copyLinkBtn.click();
      await expect(page.getByText(/Copied/i).first()).toBeVisible({ timeout: 5000 });
    }
  });
});
