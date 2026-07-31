import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

test.describe("Camp ID Card in template preview", () => {
  test("toggling Camp Invitation on the ID Card page shows the card in the template live preview", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");

    // 1. Enable the master switch and opt Camp Invitation into the ID card.
    await page.goto("/admin/communication/id-card");
    await expect(page.locator("h1")).toContainText("Camp ID Card");

    const masterCheckbox = page.getByRole("checkbox").first();
    await expect(masterCheckbox).toBeVisible({ timeout: 10000 });
    if (!(await masterCheckbox.isChecked())) {
      await masterCheckbox.click();
      await expect(masterCheckbox).toBeChecked({ timeout: 10000 });
    }

    const campInvitationCheckbox = page.locator('label:has-text("Camp Invitation") input[type="checkbox"]');
    await expect(campInvitationCheckbox).toBeVisible({ timeout: 10000 });
    if (!(await campInvitationCheckbox.isChecked())) {
      await campInvitationCheckbox.click();
      await expect(campInvitationCheckbox).toBeChecked({ timeout: 10000 });
    }

    // 2. Open the Camp Invitation template and wait for the live preview to render.
    await page.goto("/admin/communication/templates");
    await expect(page.locator("h1")).toContainText("Email Templates");

    const campInvitationBtn = page.getByRole("button", { name: "Camp Invitation" });
    await expect(campInvitationBtn).toBeVisible({ timeout: 10000 });
    await campInvitationBtn.click();

    const iframe = page.frameLocator('iframe[title="Live email render preview"]');
    const idCardPage = iframe.locator(".camply-id-card-page");
    await expect(idCardPage).toBeVisible({ timeout: 15000 });

    const idCardImg = idCardPage.locator('img[alt="Camp ID Card"]');
    await expect(idCardImg).toBeVisible();
    await expect(idCardImg).toHaveAttribute("src", /\/api\/id-card\/sample-sheet\.png/);

    // Leave fixture state clean.
    await page.goto("/admin/communication/id-card");
    const ciCheckbox = page.locator('label:has-text("Camp Invitation") input[type="checkbox"]');
    if (await ciCheckbox.isChecked()) {
      await ciCheckbox.click();
      await expect(ciCheckbox).not.toBeChecked({ timeout: 10000 });
    }
  });
});
