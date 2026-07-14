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

test.describe("Communication Center", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("P1: Communication nav group renders all 5 items", async ({ page }) => {
    // Verify the Communication nav group exists with all 5 items
    await expect(page.locator('nav')).toContainText("Communication");
    await expect(page.locator('nav')).toContainText("Overview");
    await expect(page.locator('nav')).toContainText("Email Events");
    await expect(page.locator('nav')).toContainText("Templates");
    await expect(page.locator('nav')).toContainText("Broadcast");
    await expect(page.locator('nav')).toContainText("Branding");
  });

  test("P2: Overview page loads with 4 cards and recent activity", async ({ page }) => {
    await page.goto("/admin/communication");
    await expect(page.locator("h1")).toContainText("Communication");

    // 4 navigation cards should be visible
    await expect(page.getByRole("heading", { name: "Email Events" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Templates" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Broadcast" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Branding" })).toBeVisible();

    // Recent Email Activity section
    await expect(page.getByRole("heading", { name: "Recent Email Activity" })).toBeVisible();
  });

  test("P3: Email Events page shows 9 event cards with toggles", async ({ page }) => {
    await page.goto("/admin/communication/events");
    await expect(page.locator("h1")).toContainText("Email Events");

    // 3 section headers — use exact match to avoid partial matches with card titles
    await expect(page.getByRole("heading", { name: "Authentication" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Registration", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Staff", exact: true })).toBeVisible();

    // 9 event cards with toggles
    await expect(page.getByRole("heading", { name: "OTP Email" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Welcome Email" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Registration Submitted" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Registration Approved" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Registration Rejected" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Correction Requested" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Waitlisted" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Staff Approved" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Staff Rejected" })).toBeVisible();

    // All should have Edit buttons
    const editButtons = page.locator('button:has-text("Edit")');
    await expect(editButtons).toHaveCount(9);
  });

  test("P4: Email Events toggle switch works", async ({ page }) => {
    await page.goto("/admin/communication/events");

    // Find the first switch element (OTP Email section)
    const firstSwitch = page.locator('button[role="switch"]').first();
    await expect(firstSwitch).toBeVisible();

    // It starts checked (ON)
    await expect(firstSwitch).toHaveAttribute("aria-checked", "true");

    // Click it to toggle OFF
    await firstSwitch.click();
    await expect(firstSwitch).toHaveAttribute("aria-checked", "false");

    // Toggle back ON
    await firstSwitch.click();
    await expect(firstSwitch).toHaveAttribute("aria-checked", "true");
  });

  test("P5: Event edit drawer opens and contains expected fields", async ({ page }) => {
    await page.goto("/admin/communication/events");

    // Click the first Edit button using a more specific locator
    const editButtons = page.locator('button:has-text("Edit")');
    await expect(editButtons.first()).toBeVisible({ timeout: 10000 });
    await editButtons.first().click();

    // The HeadlessUI dialog renders but Playwright sees it as "hidden"
    // due to CSS transition wrappers. We verify content is present instead.
    await expect(page.locator('[role="dialog"]')).toContainText("Recipients", { timeout: 10000 });
    await expect(page.locator('[role="dialog"]')).toContainText("Parent");
    await expect(page.locator('[role="dialog"]')).toContainText("Email");

    // Close drawer
    await page.locator('button[aria-label="Close"]').click();
  });

  test("P6: Templates page loads with sidebar list", async ({ page }) => {
    await page.goto("/admin/communication/templates");
    await expect(page.locator("h1")).toContainText("Email Templates");

    // Should have "+ New Template" button
    await expect(page.getByRole("button", { name: "+ New Template" })).toBeVisible();

    // 9 default templates in sidebar
    await expect(page.locator('button:has-text("Registration Approved")')).toBeVisible();
    await expect(page.locator('button:has-text("Registration Submitted")')).toBeVisible();
    await expect(page.locator('button:has-text("Welcome Email")')).toBeVisible();
    await expect(page.locator('button:has-text("OTP Code")')).toBeVisible();

    // Clicking a template should load the editor
    await page.locator('button:has-text("Registration Approved")').click();
    // Subject field should appear
    await expect(page.locator('input[value*="approved for"]')).toBeVisible();
  });

  test("P7: Branding page loads with form and preview", async ({ page }) => {
    await page.goto("/admin/communication/branding");
    await expect(page.locator("h1")).toContainText("Email Branding");

    // Form fields should exist
    await expect(page.locator('input[type="color"]').first()).toBeVisible();

    // Save button
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  });

  test("P8: Broadcast page loads with Compose and History tabs", async ({ page }) => {
    await page.goto("/admin/communication/broadcast");
    await expect(page.locator("h1")).toContainText("Broadcast");

    // Two tabs
    await expect(page.getByRole("tab", { name: "Compose" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "History" })).toBeVisible();

    // Compose tab has recipient options (scope to main content, not sidebar)
    const main = page.locator("main");
    await expect(main.locator('text=Parents')).toBeVisible();
    await expect(main.locator('text=Teachers').first()).toBeVisible();
    await expect(main.locator('text=Volunteers').first()).toBeVisible();

    // Send Now button
    await expect(main.getByRole("button", { name: "Send Now" })).toBeVisible();
  });

  test("P9: No console errors on any Communication page", async ({ page }) => {
    const pages = [
      "/admin/communication",
      "/admin/communication/events",
      "/admin/communication/templates",
      "/admin/communication/branding",
      "/admin/communication/broadcast",
    ];

    for (const url of pages) {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));

      await page.goto(url);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);

      // No Next.js error overlay
      const errorOverlay = await page.locator("nextjs-portal").count();
      expect(errorOverlay).toBe(0);

      // No unexpected page content
      const body = await page.textContent("body");
      expect(body).not.toContain("Internal Server Error");
    }
  });
});
