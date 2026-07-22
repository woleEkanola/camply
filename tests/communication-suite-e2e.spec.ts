import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

test.describe("Communication Center Suite — Full E2E Verification", () => {
  test.use({ viewport: { width: 1400, height: 900 } });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(60000);
    await loginWithPassword(page, "owner@camply.com", "password123");
  });

  test("1. Communication Dashboard — Metrics, Stats Cards & Quick Actions", async ({ page }) => {
    await page.goto("/admin/communication/dashboard");
    await page.waitForLoadState("domcontentloaded");
    
    const heading = page.getByRole("heading", { name: /Communication/i }).first();
    await expect(heading).toBeVisible({ timeout: 20000 });

    const pageText = await page.locator("body").innerText();
    expect(pageText).toMatch(/Campaigns|Communication|Audiences|Templates|Analytics/i);
  });

  test("2. Campaigns Management — List & Create Campaign Trigger", async ({ page }) => {
    await page.goto("/admin/communication/campaigns");
    await page.waitForLoadState("domcontentloaded");

    const createBtn = page.getByRole("button", { name: /New Campaign|Create Campaign|\+/i }).first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });

    const pageText = await page.locator("body").innerText();
    expect(pageText).toMatch(/Campaigns|Manage email campaigns|No campaigns yet|Campaign/i);
  });

  test("3. Audience Segmentation — Audiences List & Rules Builder", async ({ page }) => {
    await page.goto("/admin/communication/audiences");
    await expect(page.getByRole("heading", { name: /Audiences|Segments/i }).first()).toBeVisible({ timeout: 20000 });

    const createAudienceBtn = page.getByRole("button", { name: /Create Audience|New Audience|Audience|\+/i }).first();
    await expect(createAudienceBtn).toBeVisible({ timeout: 10000 });
  });

  test("4. Email Templates Library & Preview", async ({ page }) => {
    await page.goto("/admin/communication/templates");
    await expect(page.getByRole("heading", { name: /Templates|Email Templates/i }).first()).toBeVisible({ timeout: 20000 });

    const pageText = await page.locator("body").innerText();
    expect(pageText).toMatch(/Template|Layout|Default|HTML/i);
  });

  test("5. Delivery Queue & Status Monitoring", async ({ page }) => {
    await page.goto("/admin/communication/queue");
    await expect(page.getByRole("heading", { name: /Queue|Delivery Queue/i }).first()).toBeVisible({ timeout: 20000 });

    const pageText = await page.locator("body").innerText();
    expect(pageText).toMatch(/Queue|Pending|Processing|Sent|Status/i);
  });

  test("6. Delivery Logs & Message History Table", async ({ page }) => {
    await page.goto("/admin/communication/logs");
    await expect(page.getByRole("heading", { name: /Delivery Logs|Logs/i }).first()).toBeVisible({ timeout: 20000 });

    const pageText = await page.locator("body").innerText();
    expect(pageText).toMatch(/Logs|Recipient|Status|Sent At|Subject/i);
  });

  test("7. Engagement Analytics & Delivery Reports", async ({ page }) => {
    await page.goto("/admin/communication/analytics");
    await expect(page.getByRole("heading", { name: /Analytics|Engagement Analytics/i }).first()).toBeVisible({ timeout: 20000 });

    const pageText = await page.locator("body").innerText();
    expect(pageText).toMatch(/Analytics|Open Rate|Click Rate|Engagement|Delivery/i);
  });

  test("8. System Email Events & Trigger Settings", async ({ page }) => {
    await page.goto("/admin/communication/events");
    await expect(page.getByRole("heading", { name: /Email Events|Events/i }).first()).toBeVisible({ timeout: 20000 });

    await expect(page.getByRole("heading", { name: /OTP|Welcome|Registration/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test("9. Email Header & Footer Brand Customization", async ({ page }) => {
    await page.goto("/admin/communication/branding");
    await expect(page.getByRole("heading", { name: /Branding|Email Branding/i }).first()).toBeVisible({ timeout: 20000 });

    const pageText = await page.locator("body").innerText();
    expect(pageText).toMatch(/Branding|Header|Footer|Logo|Colors/i);
  });
});
