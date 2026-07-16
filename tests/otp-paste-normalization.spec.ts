import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, waitForOtp, emailInput, nextButton } from "./helpers";

/**
 * Covers the reported bug: pasting an OTP code with surrounding whitespace
 * (common when copying from an email/SMS) was rejected. Two independent
 * fixes are exercised here:
 *  1. Server-side: src/server/otp.ts's normalizeOtp() strips non-digits from
 *     the submitted code before the constant-time comparison, at all three
 *     verify sites (verify-otp, authOptions credentials provider,
 *     reset-password).
 *  2. Client-side: the shared 6-box OtpInput grid (src/components/ui/OtpInput.tsx)
 *     already strips non-digit paste noise and distributes exactly 6 digits
 *     across its boxes, now rolled out to every OTP entry point (login,
 *     reg-login, staff wizard) instead of a single free-text field.
 */
test.describe("OTP paste normalization (trailing/leading whitespace)", () => {
  test.describe.configure({ mode: "serial" });

  const parentEmail = `e2e-otp-paste-${Date.now()}@camply.test`;
  let organizationId: string;
  let userId: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    const user = await prisma.user.create({
      data: {
        email: parentEmail,
        password: "x",
        role: "PARENT",
        organizationId,
        active: true,
        firstName: "E2E",
        lastName: "OtpPaste",
      },
    });
    userId = user.id;
  });

  test.afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.oTP.deleteMany({ where: { email: parentEmail } });
  });

  test("verify-otp accepts a submitted code padded with whitespace", async ({ page }) => {
    await page.request.post("/api/base-user/send-otp", { data: { email: parentEmail } });
    const code = await waitForOtp(parentEmail);

    const res = await page.request.post("/api/base-user/verify-otp", {
      data: { email: parentEmail, otp: ` ${code} ` },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.authenticated).toBe(true);
  });

  test("the login page's 6-box grid strips paste noise and fills exactly the boxes, then logs in", async ({ page }) => {
    await page.goto("/login");
    await page.locator('button:visible', { hasText: "Email OTP" }).first().click();
    await emailInput(page).fill(parentEmail);
    await nextButton(page).click();
    await expect(page.locator('[aria-label="Digit 1 of 6"]:visible')).toBeVisible({ timeout: 10000 });

    // The "Next" click above (handleEmailSubmit) is what actually triggers
    // send-otp — read the code the UI itself generated, not a separately
    // pre-fetched one, or a second send-otp call here would invalidate it.
    const code = await waitForOtp(parentEmail);

    // Focus the first (visible) box, then simulate a real clipboard paste
    // containing whitespace noise around the code — mirrors a code copied
    // from an email client that added a trailing space.
    await page.locator('[aria-label="Digit 1 of 6"]:visible').click();
    await page.evaluate((text) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      document.activeElement?.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })
      );
    }, ` ${code} `);

    for (let i = 0; i < code.length; i++) {
      await expect(page.locator(`[aria-label="Digit ${i + 1} of 6"]:visible`)).toHaveValue(code[i]);
    }

    await page.locator('button:visible', { hasText: "Login" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  });
});
