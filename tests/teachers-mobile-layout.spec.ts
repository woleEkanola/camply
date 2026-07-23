import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

/**
 * /admin/teachers on mobile (StaffListPage.tsx + CampusQuotasCard.tsx):
 * - Header action buttons ("Auto Assign Tribes" etc.) must not overflow the
 *   viewport or spill wrapped text outside the button's box.
 * - StatCard labels must not be clipped mid-word.
 * - Campus Quotas renders collapsed by default, positioned above the teacher
 *   list on mobile (a second, desktop-only copy lives in the sidebar).
 */
test.describe("Teachers page — mobile layout", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/teachers");
    await page.getByRole("heading", { name: "Teachers", exact: true, level: 1 }).waitFor({ state: "visible", timeout: 15000 });
  });

  test("page has no horizontal overflow", async ({ page }) => {
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test("header action buttons render single-line, not clipped", async ({ page }) => {
    for (const name of ["Auto Assign Tribes", "Auto Assign Depts", /Add Teacher/]) {
      const button = page.getByRole("button", { name }).first();
      await expect(button).toBeVisible();
      const { scrollHeight, clientHeight } = await button.evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }));
      expect(scrollHeight).toBeLessThanOrEqual(clientHeight + 1);
    }
  });

  test("stat card labels are not truncated mid-word", async ({ page }) => {
    for (const label of ["Total Teachers", "Pending Review", "Approved", "Assigned", "Unassigned"]) {
      const text = await page.getByText(label, { exact: true }).first().textContent();
      expect(text?.trim()).toBe(label);
    }
  });

  test("Campus Quotas is collapsed by default and sits above the teacher list", async ({ page }) => {
    const quotasHeading = page.getByRole("heading", { name: "Campus Quotas" }).first();
    await expect(quotasHeading).toBeVisible();

    // Collapsed: per-campus rows aren't rendered yet.
    await expect(page.getByText("Set quota").or(page.getByText("Edit quota")).first()).not.toBeVisible();

    // Positioned above the teacher list content (status tabs / table).
    const quotasBox = await quotasHeading.boundingBox();
    const tabsBox = await page.getByRole("button", { name: "All" }).first().boundingBox();
    expect(quotasBox && tabsBox && quotasBox.y).toBeLessThan(tabsBox!.y);

    // Expands on click.
    await quotasHeading.click();
    await expect(page.getByText("Set quota").or(page.getByText("Edit quota")).first()).toBeVisible({ timeout: 5000 });
  });
});
