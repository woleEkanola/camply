import { test, expect } from "@playwright/test";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma, getFixtureOrgContext, deleteCamperByEmail } from "./helpers";

/**
 * Covers the reported gap: the wizard's returning-user "Send me a
 * verification code" button (and its "Resend" link) never actually POSTed
 * to /api/base-user/send-otp — it only revealed the code-entry UI, so a
 * returning parent had no way to actually receive a code. See
 * src/app/register/[token]/components/ReturningUserForm.tsx's handleSendOtp.
 *
 * Both assertions live in one test (rather than two) to stay well under
 * send-otp's per-email rate limit (3 sends / 15 min) — this flow uses 2.
 */
test.describe("Wizard returning-user OTP sign-in", () => {
  test.describe.configure({ mode: "serial" });

  const parentEmail = `e2e-returning-otp-${Date.now()}@camply.test`;
  let campusId: string;
  let signupToken: string;
  let campId: string;
  let organizationId: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;

    // Pre-create the PARENT user directly so Identity's check-email routes
    // to the RETURNING_USER branch instead of NEW_ACCOUNT.
    const passwordHash = await bcrypt.hash("unused-password-not-tested-here", 10);
    await prisma.user.create({
      data: { email: parentEmail, password: passwordHash, role: "PARENT", organizationId, firstName: "Returning", lastName: "Parent" },
    });

    const campus = await prisma.campus.create({
      data: {
        name: `E2E Returning OTP Campus ${Date.now()}`,
        slug: `e2e-returning-otp-campus-${Date.now()}`,
        address: "1 OTP St",
        city: "Testville",
        country: "Testland",
        organizationId,
        active: true,
        signupOpen: true,
      },
    });
    campusId = campus.id;

    const token = randomBytes(16).toString("hex");
    await prisma.signupLink.create({ data: { token, campusId, campId, active: true } });
    const campSlug = (await prisma.camp.findUniqueOrThrow({ where: { id: campId } })).slug;
    signupToken = `${campus.slug}_${campSlug}`;
  });

  test.afterAll(async () => {
    await deleteCamperByEmail(parentEmail);
    if (campusId) {
      await prisma.signupLink.deleteMany({ where: { campusId } });
      await prisma.campus.deleteMany({ where: { id: campusId } });
    }
  });

  test("'Send me a verification code' issues a real OTP, Resend rotates it, and the OTP signs the user in", async ({ page }) => {
    test.setTimeout(60000);

    await page.goto(`/register/${signupToken}`);
    await page.getByRole("button", { name: "Start Registration" }).click();
    await expect(page.getByText("What's your email address?")).toBeVisible({ timeout: 5000 });
    await page.locator('input[type="email"]:visible').fill(parentEmail);
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText("Welcome back")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Send me a verification code" }).click();

    // Core regression assertion: this used to time out because nothing ever
    // POSTed to send-otp — the button only flipped the UI to the code view.
    const firstCode = await waitForOtpWithRetryHint(parentEmail);
    await expect(page.getByText("Check your email")).toBeVisible({ timeout: 10000 });

    // Resend must also actually hit send-otp and rotate the code.
    await page.getByRole("button", { name: "Resend" }).click();
    await expect
      .poll(async () => (await prisma.oTP.findUnique({ where: { email: parentEmail } }))?.code, { timeout: 10000 })
      .not.toBe(firstCode);
    const secondCode = (await prisma.oTP.findUniqueOrThrow({ where: { email: parentEmail } })).code;

    for (let i = 0; i < 6; i++) {
      await page.getByLabel(`Digit ${i + 1} of 6`).fill(secondCode[i]);
    }

    // The returning-user OTP path never populates wizard state's firstName
    // (only NewAccountForm's SET_NAMES does), so the Hub greeting is the
    // generic "Welcome!" rather than "Welcome, Returning!" — a pre-existing,
    // out-of-scope cosmetic gap (see wizard-hub-routing.spec.ts for the same
    // finding). What matters here is landing on Hub at all, confirmed by its
    // distinguishing actions.
    await expect(page.getByRole("button", { name: "Register a Teen" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("link", { name: /View Status|View Dashboard/ })).toBeVisible();
  });
});

async function waitForOtpWithRetryHint(email: string): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < 15000) {
    const otp = await prisma.oTP.findUnique({ where: { email } });
    if (otp) return otp.code;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `No OTP row appeared for ${email} within 15s — 'Send me a verification code' likely did not POST /api/base-user/send-otp`
  );
}
