import { test, expect } from "@playwright/test";
import { randomBytes } from "crypto";
import {
  prisma,
  getFixtureOrgContext,
  deleteCamperByEmail,
  resetSystemFieldDefaults,
  loginWithPassword,
} from "./helpers";

/**
 * Covers two related reported bugs in the parent wizard:
 *  1. Pressing "← Back" from the Hub sent a signed-in parent to the
 *     "What's your email address?" screen (EmailGate), which reads as being
 *     logged out even though the session cookie is untouched. Fixed by
 *     routing HUB's back-target to LANDING instead of IDENTITY
 *     (wizardReducer.ts backMap).
 *  2. Adding a teen whose age falls outside the camp's minAge/maxAge used to
 *     be accepted at the Add Teen step and only rejected much later, at
 *     final submission — wasting the parent's time filling out the rest of
 *     the wizard for an ineligible teen. Fixed by an inline client-side
 *     check in TeenEntryForm.tsx that blocks Add Teen outright.
 */
test.describe("Wizard: Back-from-Hub and Add Teen age gate", () => {
  test.describe.configure({ mode: "serial" });

  const parentEmail = `e2e-wizard-back-age-${Date.now()}@camply.test`;
  const parentPassword = "password123";
  let signupToken: string;
  let campusId: string;
  let minAge: number;
  let maxAge: number;

  test.beforeAll(async () => {
    const { organizationId, campId } = await getFixtureOrgContext();
    await resetSystemFieldDefaults("CAMPER");

    const camp = await prisma.camp.findUniqueOrThrow({ where: { id: campId } });
    minAge = camp.minAge ?? 6;
    maxAge = camp.maxAge ?? 17;

    const stamp = Date.now();
    const campus = await prisma.campus.create({
      data: {
        name: `E2E Back/Age Campus ${stamp}`,
        slug: `e2e-back-age-campus-${stamp}`,
        address: "1 Test St",
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
    signupToken = `${campus.slug}_${camp.slug}`;
  });

  test.afterAll(async () => {
    await deleteCamperByEmail(parentEmail);
    if (campusId) {
      await prisma.registration.deleteMany({ where: { campusId } });
      await prisma.signupLink.deleteMany({ where: { campusId } });
      await prisma.campus.deleteMany({ where: { id: campusId } });
    }
  });

  test("creates the account, then Back from the Hub lands on LANDING — not the email-entry screen", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto(`/register/${signupToken}`);
    await page.getByRole("button", { name: "Start Registration" }).click();

    await expect(page.getByText("What's your email address?")).toBeVisible({ timeout: 5000 });
    await page.locator('input[type="email"]:visible').fill(parentEmail);
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText("Welcome!")).toBeVisible({ timeout: 5000 });
    await page.locator("#reg-firstname").fill("BackAge");
    await page.locator("#reg-lastname").fill("Parent");
    await page.locator("#reg-pw").fill(parentPassword);
    await page.locator("#reg-pw-confirm").fill(parentPassword);
    await page.getByRole("button", { name: "Create Account" }).click();

    // Now on HUB, signed in.
    await expect(page.getByText(/^Welcome/)).toBeVisible({ timeout: 10000 });

    await page.locator("button:visible", { hasText: "← Back" }).click();

    // Must land on LANDING (camp intro + Start Registration), never the
    // email-entry EmailGate screen — the session is still intact.
    await expect(page.getByText("Register Your Teen")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("What's your email address?")).not.toBeVisible();
  });

  test("Add Teen rejects a date of birth outside the camp's age policy without creating a camper or draft", async ({ page }) => {
    test.setTimeout(60000);
    // Log in directly and jump to HUB via ?step=hub (see wizard-hub-routing.spec.ts) —
    // driving the wizard's own EmailGate → ReturningUserForm here is a
    // separate concern already covered by wizard-returning-otp.spec.ts.
    await loginWithPassword(page, parentEmail, parentPassword);
    await page.goto(`/register/${signupToken}?step=hub`);
    await page.getByRole("button", { name: "Register a Teen" }).click();
    await expect(page.getByText("Who's coming to camp?")).toBeVisible({ timeout: 10000 });

    await page.locator("#teen-fn").fill("TooOld");
    await page.locator("#teen-ln").fill("Teen");
    await page.getByRole("button", { name: /Select date/i }).click();
    await page.waitForTimeout(300);
    const dobSelects = page.locator("select:visible");
    await dobSelects.nth(0).selectOption("01");
    await dobSelects.nth(1).selectOption("01");
    await dobSelects.nth(2).selectOption("1990"); // far outside any camp's age range
    await page.getByRole("button", { name: "Apply" }).click();
    await page.waitForTimeout(300);
    await page.locator('input[name="teen-gender"][value="Male"]').click();
    await page.getByRole("button", { name: "Add Teen" }).click();

    // Blocked inline — no teen card renders, form stays on this step.
    await expect(page.getByText(`This camp is for ages ${minAge}`)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("TooOld Teen")).not.toBeVisible();

    const camper = await prisma.camper.findFirst({ where: { firstName: "TooOld", lastName: "Teen" } });
    expect(camper).toBeNull();
  });

  test("Add Teen with an in-range date of birth succeeds normally", async ({ page }) => {
    test.setTimeout(60000);
    await loginWithPassword(page, parentEmail, parentPassword);
    await page.goto(`/register/${signupToken}?step=hub`);
    await page.getByRole("button", { name: "Register a Teen" }).click();
    await expect(page.getByText("Who's coming to camp?")).toBeVisible({ timeout: 10000 });

    await page.locator("#teen-fn").fill("InRange");
    await page.locator("#teen-ln").fill("Teen");
    await page.getByRole("button", { name: /Select date/i }).click();
    await page.waitForTimeout(300);
    const dobSelects = page.locator("select:visible");
    const midAgeYear = new Date().getFullYear() - Math.round((minAge + maxAge) / 2);
    await dobSelects.nth(0).selectOption("06");
    await dobSelects.nth(1).selectOption("15");
    await dobSelects.nth(2).selectOption(String(midAgeYear));
    await page.getByRole("button", { name: "Apply" }).click();
    await page.waitForTimeout(300);
    await page.locator('input[name="teen-gender"][value="Female"]').click();
    await page.getByRole("button", { name: "Add Teen" }).click();

    await expect(page.getByText("InRange Teen")).toBeVisible({ timeout: 5000 });

    const camper = await prisma.camper.findFirstOrThrow({ where: { firstName: "InRange", lastName: "Teen" } });
    expect(camper).toBeTruthy();
  });
});
