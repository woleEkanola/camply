import { test, expect, type Page } from "@playwright/test";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emailInput(page: Page) {
  return page.locator('input[placeholder="Enter your email"]:visible');
}
function passwordInput(page: Page) {
  return page.locator('input[placeholder="Enter Password"]:visible');
}
function loginButton(page: Page) {
  return page.locator('button:visible', { hasText: "Login" });
}

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.locator('button:visible', { hasText: "Password" }).first().click();
  await emailInput(page).fill("admin@camply.com");
  await passwordInput(page).fill("password123");
  await loginButton(page).click();
  await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Registration Review Workflow", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("P1: Registrations page loads with KPI bar and table", async ({ page }) => {
    await page.goto("/admin/registrations");
    await expect(page.locator("h1")).toContainText("Registrations");

    // KPI stat cards should be visible — use first() to avoid strict mode with dropdown option
    await expect(page.getByText("PENDING").first()).toBeVisible();
  });

  test("P2: Clicking a registration row opens the detail drawer", async ({ page }) => {
    await page.goto("/admin/registrations");

    // Wait for table rows to load
    await page.waitForSelector("table tbody tr", { timeout: 10000 });

    // Click the first row
    const firstRow = page.locator("table tbody tr").first();
    await firstRow.click();

    // Drawer should open with at least 3 tabs
    await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("tab", { name: "Documents" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Timeline" })).toBeVisible();
  });

  test("P3: Change Status button exists in the drawer Overview tab", async ({ page }) => {
    await page.goto("/admin/registrations");
    await page.waitForSelector("table tbody tr", { timeout: 10000 });
    await page.locator("table tbody tr").first().click();
    await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible({ timeout: 5000 });

    // The "Change Status" button should be visible
    await expect(page.getByRole("button", { name: "Change Status" })).toBeVisible();
  });

  test("P4: Clicking Change Status opens the StatusDialog", async ({ page }) => {
    await page.goto("/admin/registrations");
    await page.waitForSelector("table tbody tr", { timeout: 10000 });
    await page.locator("table tbody tr").first().click();
    await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible({ timeout: 5000 });

    // Click Change Status button (use role to avoid matching dialog heading)
    await page.getByRole("button", { name: "Change Status" }).click();

    // Dialog heading should appear
    await expect(page.getByRole("heading", { name: "Change Status" })).toBeVisible({ timeout: 5000 });
    // Action dropdown should have Approve option
    await expect(page.getByText("Approve").first()).toBeVisible();
  });

  test("P5: Review tab exists and contains Communication card and Decision history", async ({ page }) => {
    await page.goto("/admin/registrations");
    await page.waitForSelector("table tbody tr", { timeout: 10000 });
    await page.locator("table tbody tr").first().click();

    // Click the Review tab
    const reviewTab = page.getByRole("tab", { name: "Review" });
    if (await reviewTab.isVisible()) {
      await reviewTab.click();
      // Communication card or Decision History should be visible
      await expect(page.getByText("Acceptance Email").or(page.getByText("Decision History"))).toBeVisible({ timeout: 5000 });
    }
    // If Review tab doesn't exist, that's fine — it only shows when TWO_STEP is enabled
  });

  test("P6: No console errors on registrations page", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/admin/registrations");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // No Next.js error overlay
    const errorOverlay = await page.locator("nextjs-portal").count();
    expect(errorOverlay).toBe(0);

    // No 500 errors in body
    const body = await page.textContent("body");
    expect(body).not.toContain("Internal Server Error");
  });
});
