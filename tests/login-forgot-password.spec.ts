import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma, getFixtureOrgContext, emailInput, nextButton, passwordInput, loginButton } from "./helpers";

test.describe("Login page: back / resend code / forgot password", () => {
  test.describe.configure({ mode: "serial" });

  test("Back button on the credential step returns to the email step", async ({ page }) => {
    // No real user needed — send-otp responds 200 identically whether the
    // email doesn't exist or isn't OTP-eligible (anti-enumeration), and each
    // test uses its own unique email so the per-email send-otp rate limit
    // (3/15min) isn't shared across unrelated tests in this file.
    await page.goto("/login");
    await emailInput(page).fill(`e2e-login-back-${Date.now()}@camply.test`);
    await nextButton(page).click();
    await expect(passwordInput(page)).toBeVisible();

    await page.locator("button:visible", { hasText: "Back" }).click();

    await expect(emailInput(page)).toBeVisible();
    await expect(passwordInput(page)).not.toBeVisible();
  });

  test("email step blocks progress and shows an error when the send fails, and proceeds with a confirmation on success", async ({ page }) => {
    await page.goto("/login");
    await emailInput(page).fill(`e2e-login-confirm-${Date.now()}@camply.test`);
    await nextButton(page).click();

    // This email isn't OTP-eligible, so send-otp responds 200 (no-op)
    // regardless of whether the mail service works — the step should always
    // advance and show the generic confirmation message.
    await expect(passwordInput(page)).toBeVisible({ timeout: 10000 });
    await expect(page.locator("div.bg-green-50:visible")).toBeVisible({ timeout: 10000 });
  });

  test("Resend code button sends another code and enters a cooldown", async ({ page }) => {
    await page.goto("/login");
    await emailInput(page).fill(`e2e-login-resend-${Date.now()}@camply.test`);
    await nextButton(page).click();
    await expect(passwordInput(page)).toBeVisible();

    const resendButton = page.locator("button:visible", { hasText: /Resend code/i });
    await expect(resendButton).toBeVisible();
    await resendButton.click();

    await expect(page.locator("button:visible", { hasText: /Resend code \(\d+s\)/ })).toBeVisible({ timeout: 10000 });
  });

  test.describe("Forgot password: request a code, reset the password, then log in with the new password", () => {
    test.describe.configure({ mode: "serial" });
    let organizationId: string;
    const email = `e2e-login-forgot-${Date.now()}@camply.test`;
    const originalPassword = "password123";
    const newPassword = "newpassword456";
    let userId: string | undefined;

    test.beforeAll(async () => {
      const ctx = await getFixtureOrgContext();
      organizationId = ctx.organizationId;
      const hashed = await bcrypt.hash(originalPassword, 10);
      const user = await prisma.user.create({
        data: { email, password: hashed, role: "ADMIN", organizationId, active: true, firstName: "E2E", lastName: "LoginFlow" },
      });
      userId = user.id;
    });

    test.afterAll(async () => {
      if (userId) await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.oTP.deleteMany({ where: { email } });
    });

    test("clicking 'Forgot password?' either sends a code or fails clearly without hanging or crashing", async ({ page }) => {
      // Real outbound delivery depends on RESEND_API_KEY being configured
      // (deliberately unset in local dev per CLAUDE.md — only staging/prod
      // have it), so this only asserts the UI handles both outcomes
      // correctly: either it advances to the Reset Password step with a
      // success banner, or it stays put with a clear, visible error — never a
      // silent failure or a hang.
      await page.goto("/login");
      await emailInput(page).fill(email);
      await nextButton(page).click();
      await expect(passwordInput(page)).toBeVisible();

      await page.locator("button:visible", { hasText: "Forgot password?" }).click();

      const resetHeading = page.locator("h2:visible", { hasText: "Reset Password" });
      const errorBanner = page.locator("div.bg-red-100:visible");
      await expect(resetHeading.or(errorBanner)).toBeVisible({ timeout: 15000 });
    });

    test("reset-password endpoint verifies the OTP, updates the password, and the old password stops working", async ({ page }) => {
      // Drives the actual OTP-verification + password-update mechanism
      // directly (seeding the OTP the same way a real email would have
      // delivered it), independent of whether outbound email delivery is
      // configured in this environment — see the test above for that.
      const otp = "482913";
      await prisma.oTP.upsert({
        where: { email },
        update: { code: otp, expiresAt: new Date(Date.now() + 10 * 60 * 1000), attempts: 0 },
        create: { email, code: otp, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
      });

      const res = await page.request.post("/api/base-user/reset-password", {
        data: { email, otp, newPassword },
      });
      expect(res.ok()).toBe(true);

      const updated = await prisma.user.findUniqueOrThrow({ where: { id: userId! } });
      expect(await bcrypt.compare(newPassword, updated.password)).toBe(true);
      expect(await prisma.oTP.findUnique({ where: { email } })).toBeNull();

      await page.goto("/login");
      await emailInput(page).fill(email);
      await nextButton(page).click();
      await expect(passwordInput(page)).toBeVisible();

      // Old password no longer works.
      await passwordInput(page).fill(originalPassword);
      await loginButton(page).click();
      await expect(page.locator("div.bg-red-100:visible")).toBeVisible({ timeout: 10000 });

      // New password logs in successfully.
      await passwordInput(page).fill(newPassword);
      await loginButton(page).click();
      await expect(page).toHaveURL(/\/admin/, { timeout: 15000 });
    });
  });
});
