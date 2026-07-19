import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

test.describe("Communication: Email Template Editor Live Preview", () => {
  test("loads templates, resets to default, and renders single button and next steps in preview", async ({ page }) => {
    // 1. Log in as admin
    await loginWithPassword(page, "admin@camply.com", "password123");

    // 2. Navigate to the template editor page
    await page.goto("/admin/communication/templates");
    await expect(page.locator("h1")).toContainText("Email Templates");

    // ─── PART A: REGISTRATION_APPROVED ───
    // 3. Select the "Registration Approved" template
    const regApprovedBtn = page.locator('button:has-text("Registration Approved")');
    await expect(regApprovedBtn).toBeVisible({ timeout: 10000 });
    await regApprovedBtn.click();

    // Wait for the skeleton loader to resolve and the editor subject field to load
    const subjectInput = page.locator('input[placeholder="Enter subject line..."]');
    await expect(subjectInput).toBeVisible({ timeout: 10000 });

    // 4. Click Reset to default to discard prior local edits
    await page.getByRole("button", { name: "Reset" }).click();
    const dialogHeader = page.locator('h3:has-text("Reset to Default template")');
    await expect(dialogHeader).toBeVisible({ timeout: 5000 });
    const dialogContainer = page.locator('div:has(h3:has-text("Reset to Default template"))').last();
    await dialogContainer.locator("select").selectOption("REGISTRATION_APPROVED");
    await page.getByRole("button", { name: "Confirm Action" }).click();
    await expect(dialogHeader).not.toBeVisible();

    // 5. Check live preview iframe
    const iframe = page.frameLocator('iframe[title="Live email render preview"]');
    
    // The "View Registration" button should appear exactly ONCE
    const regBtn = iframe.locator("a[data-email-button]");
    await expect(regBtn).toBeVisible({ timeout: 15000 });
    await expect(regBtn).toHaveCount(1);
    await expect(regBtn).toContainText("View Registration");

    // The "What's next" checklist should render inside the body content
    await expect(iframe.getByRole("heading", { name: "What's next" })).toBeVisible();
    const listItems = iframe.locator("ol > li");
    await expect(listItems.first()).toContainText("Save this email for check-in");

    // Verify that the QR Code image is visible and has a valid base64 data URL src
    const qrImg = iframe.locator('img[alt="QR Code"]');
    await expect(qrImg).toBeVisible();
    await expect(qrImg).toHaveAttribute("src", /^data:image\/png;base64,/);

    // ─── PART B: WELCOME_EMAIL ───
    // 6. Select the "Welcome Email" template
    const welcomeBtn = page.locator('button:has-text("Welcome Email")');
    await expect(welcomeBtn).toBeVisible();
    await welcomeBtn.click();

    // Wait for the welcome template to load in the editor
    await expect(subjectInput).toBeVisible({ timeout: 10000 });

    // 7. Click Reset to default
    await page.getByRole("button", { name: "Reset" }).click();
    await expect(dialogHeader).toBeVisible({ timeout: 5000 });
    await dialogContainer.locator("select").selectOption("WELCOME_EMAIL");
    await page.getByRole("button", { name: "Confirm Action" }).click();
    await expect(dialogHeader).not.toBeVisible();

    // 8. Check live preview iframe
    await expect(iframe.locator("a[data-email-button]")).toBeVisible({ timeout: 15000 });
    
    // The "Verify your email" button should appear exactly ONCE
    const verifyBtn = iframe.locator("a[data-email-button]");
    await expect(verifyBtn).toHaveCount(1);
    await expect(verifyBtn).toContainText("Verify your email");

    // The "What's next" checklist should render inside the body content
    await expect(iframe.getByRole("heading", { name: "What's next" })).toBeVisible();
    const welcomeListItems = iframe.locator("ol > li");
    await expect(welcomeListItems.first()).toContainText("Verify your email address");
  });
});
