import { test, expect, type Page } from "@playwright/test";

// The login page renders separate mobile and desktop markup simultaneously
// (toggled with CSS `hidden`/`md:hidden`, not conditional rendering), so every
// placeholder/role query below matches two DOM nodes. Scope to the one CSS
// considers visible at the current viewport rather than picking an index,
// so this stays correct regardless of viewport size.
function emailInput(page: Page) {
  return page.locator('input[placeholder="Enter your email"]:visible');
}
function nextButton(page: Page) {
  return page.locator('button:visible', { hasText: "Next" });
}
function passwordInput(page: Page) {
  return page.locator('input[placeholder="Enter Password"]:visible');
}
function loginButton(page: Page) {
  return page.locator('button:visible', { hasText: "Login" });
}

test.describe("Authentication", () => {
  test("login page renders the email step", async ({ page }) => {
    await page.goto("/login");
    await expect(emailInput(page)).toBeVisible();
    await expect(nextButton(page)).toBeVisible();
  });

  test("admin can log in with seeded credentials and reach /admin", async ({ page }) => {
    await page.goto("/login");
    await page.locator('button:visible', { hasText: "Password" }).first().click();
    await emailInput(page).fill("admin@camply.com");
    await passwordInput(page).fill("password123");
    await loginButton(page).click();

    await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });
  });

  test("wrong password is rejected with an error message", async ({ page }) => {
    await page.goto("/login");
    await page.locator('button:visible', { hasText: "Password" }).first().click();
    await emailInput(page).fill("admin@camply.com");
    await passwordInput(page).fill("wrong-password");
    await loginButton(page).click();

    await expect(
      page.locator("div.bg-red-100:visible", { hasText: /invalid|incorrect|failed/i })
    ).toBeVisible({ timeout: 10000 });
    await expect(page).not.toHaveURL(/\/admin/);
  });
});
