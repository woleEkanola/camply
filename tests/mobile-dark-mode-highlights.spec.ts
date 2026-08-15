import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

function rgbChannels(color: string) {
  return color.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [255, 255, 255];
}

test.describe("Dark-mode selected highlights", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("camply-theme", "dark"));
    await loginWithPassword(page, "owner@camply.com", "password123");
  });

  test("registration and approval selections retain dark, readable surfaces", async ({ page }) => {
    await page.goto("/admin/registrations");
    const allCard = page.getByRole("button").filter({ hasText: /^\s*\d+\s*All\s*$/ }).first();
    await expect(allCard).toBeVisible();
    const registrationBg = await allCard.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(Math.max(...rgbChannels(registrationBg))).toBeLessThan(120);

    await page.goto("/admin/settings");
    const selectedWorkflow = page.locator('label:has(input[name="approvalWorkflow"]:checked)').first();
    await expect(selectedWorkflow).toBeVisible();
    const workflowBg = await selectedWorkflow.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(Math.max(...rgbChannels(workflowBg))).toBeLessThan(120);
    await expect(selectedWorkflow.getByText(/Single-step|Two-step/).first()).toHaveCSS("color", /rgb\(/);
  });
});
