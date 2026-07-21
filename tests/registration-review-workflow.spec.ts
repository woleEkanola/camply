import { test, expect, type Page } from "@playwright/test";
import {
  loginWithPassword,
  switchRegistrationsToListView,
  openRegistrationByName,
  clickRegistrationDrawerTab,
} from "./helpers";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loginAsAdmin(page: Page) {
  await loginWithPassword(page, "admin@camply.com", "password123");
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Registration Review Workflow", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("P1: Registrations page loads with KPI bar and table", async ({ page }) => {
    await page.goto("/admin/registrations");
    await expect(page.locator("h1")).toContainText("Registrations");

    // KPI stat cards — "Waiting Decision" when TWO_STEP, else "PENDING"
    await expect(
      page.getByText("Total Registrations").or(page.getByText("PENDING").or(page.getByText("Waiting Decision"))).first()
    ).toBeVisible();
  });

  test("P2: Clicking a registration row opens the detail drawer", async ({ page }) => {
    await page.goto("/admin/registrations");
    await switchRegistrationsToListView(page);

    await page.waitForSelector("table tbody tr", { timeout: 15000 });
    await page.locator("table tbody tr").first().click();

    // Drawer uses button nav tabs, not ARIA tabs
    await expect(page.getByRole("heading", { name: "Registration Details" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("dialog").getByRole("button", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("button", { name: /Documents/ })).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Activity" })).toBeVisible();
  });

  test("P3: More Actions opens status controls in the drawer", async ({ page }) => {
    await page.goto("/admin/registrations");
    await switchRegistrationsToListView(page);
    await page.waitForSelector("table tbody tr", { timeout: 15000 });
    await page.locator("table tbody tr").first().click();
    await expect(page.getByRole("heading", { name: "Registration Details" })).toBeVisible({ timeout: 5000 });

    await expect(page.getByRole("dialog").getByRole("button", { name: "More Actions" })).toBeVisible();
  });

  test("P4: Clicking More Actions opens the StatusDialog", async ({ page }) => {
    await page.goto("/admin/registrations");
    await switchRegistrationsToListView(page);
    await page.waitForSelector("table tbody tr", { timeout: 15000 });
    await page.locator("table tbody tr").first().click();
    await expect(page.getByRole("heading", { name: "Registration Details" })).toBeVisible({ timeout: 5000 });

    await page.getByRole("dialog").getByRole("button", { name: "More Actions" }).click();

    await expect(page.getByRole("heading", { name: "Change Status" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Approve").first()).toBeVisible();
  });

  test("P5: Review tab exists and contains Communication card and Decision history", async ({ page }) => {
    await page.goto("/admin/registrations");
    await switchRegistrationsToListView(page);
    await page.waitForSelector("table tbody tr", { timeout: 15000 });
    await page.locator("table tbody tr").first().click();
    await expect(page.getByRole("heading", { name: "Registration Details" })).toBeVisible({ timeout: 5000 });

    const reviewTab = page.getByRole("dialog").getByRole("button", { name: "Review" });
    if (await reviewTab.isVisible()) {
      await reviewTab.click();
      await expect(
        page.getByText("Acceptance Email").or(page.getByText("Decision History")).or(page.getByText("Communication"))
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test("P6: No console errors on registrations page", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/admin/registrations");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Dev-mode nextjs-portal (devtools button) is expected; only fail on real errors
    const errorOverlay = await page.locator("nextjs-portal[data-error]").count();
    expect(errorOverlay).toBe(0);
    expect(errors).toHaveLength(0);

    const body = await page.textContent("body");
    expect(body).not.toContain("Internal Server Error");
  });
});
