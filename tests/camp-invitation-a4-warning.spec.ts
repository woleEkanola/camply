import { test, expect } from "@playwright/test";
import { loginWithPassword, prisma } from "./helpers";

// Shares the seeded org's Camp Invitation template and edits its body copy.
test.describe.configure({ mode: "serial" });

/**
 * The Camp Invitation is a printable A4 certificate whose own chrome leaves
 * only ~70px of slack. Admin body copy eats that quickly — and character count
 * is a poor proxy, since paragraph margins cost far more height than long
 * sentences. The editor therefore measures the real render at A4 width and
 * warns when it won't fit one page.
 */
test.describe("Camp Invitation — A4 one-page warning", () => {
  test("reports the fit, and warns once body copy pushes past one page", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/communication/templates");
    await expect(page.locator("h1")).toContainText("Email Templates");

    await page.locator('button:has-text("Camp Invitation")').first().click();

    const previewFrame = page.locator('iframe[title="Live email render preview"]');
    await expect
      .poll(async () => ((await previewFrame.getAttribute("srcdoc")) ?? "").includes("/api/email-icon/"), {
        timeout: 20000,
      })
      .toBe(true);

    // A verdict is always shown for this template — either the warning or the
    // "fits, with N px to spare" line.
    const fits = page.getByText(/Fits one A4 page/i);
    const warning = page.getByText(/Won't fit on one A4 page/i);
    await expect
      .poll(async () => (await fits.isVisible().catch(() => false)) || (await warning.isVisible().catch(() => false)), {
        timeout: 20000,
      })
      .toBe(true);

    // Now make the body copy long enough that it cannot possibly fit, and the
    // warning must appear. Nothing is saved — the editor has no autosave and
    // this never clicks Save — so the shared template is left untouched and
    // there is no fixture state to clean up.
    const editor = page.locator(".ProseMirror").first();
    await editor.click();
    await page.keyboard.press("Control+A");
    for (let i = 0; i < 12; i++) {
      await page.keyboard.type(`Paragraph ${i} of deliberately long body copy for the A4 overflow check.`);
      await page.keyboard.press("Enter");
    }

    await expect(warning).toBeVisible({ timeout: 25000 });
    await expect(page.getByText(/taller than a single A4 page allows/i)).toBeVisible();
  });
});
