import { test, expect, type Page } from "@playwright/test";
import path from "path";
import {
  prisma,
  getFixtureOrgContext,
  waitForOtp,
  deleteCamperByEmail,
  resetSystemFieldDefaults,
  relaxRequiredCustomFields,
  restoreRequiredCustomFields,
} from "./helpers";

// Mirrors the login page's mobile/desktop dual-markup pattern — scope to the
// visible one rather than the CSS-hidden duplicate.
function emailInput(page: Page) {
  return page.locator('input[placeholder="Enter your email"]:visible');
}
function nextButton(page: Page) {
  return page.locator("button:visible", { hasText: "Next" });
}

const DUMMY_FILE = path.join(__dirname, "fixtures", "dummy-document.pdf");

/**
 * Walks the *entire* parent-facing journey a real signup link produces, all
 * the way through document upload and final submission — not just draft
 * creation (see signup-link-campus-flow.spec.ts, which stops at the draft).
 * Exercises: link -> email -> OTP -> profile (system fields) -> draft
 * registration -> required document uploads -> review/declare -> submit ->
 * final "received successfully" state, with no errors surfaced anywhere.
 */
test.describe("Full parent registration flow via a signup link", () => {
  test.describe.configure({ mode: "serial" });

  const parentEmail = `e2e-full-flow-${Date.now()}@camply.test`;
  let campusId: string;
  let signupToken: string;
  let registrationId: string | undefined;
  let relaxedCustomFields: { id: string; required: boolean }[] = [];

  test.beforeAll(async () => {
    const { organizationId, campId } = await getFixtureOrgContext();

    // Realign camper SYSTEM fields to registry defaults so accumulated Form
    // Editor drift on the shared fixture org (e.g. a hidden "Full Name" field)
    // doesn't break the profile-step assertions below.
    await resetSystemFieldDefaults("CAMPER");

    // This test submits the full registration, so any org-specific required
    // CUSTOM camper field it doesn't fill would block submission. Relax them
    // for the test window and restore in afterAll (never deletes admin data).
    relaxedCustomFields = await relaxRequiredCustomFields("CAMPER");

    const campus = await prisma.campus.create({
      data: {
        name: `E2E Full Flow Campus ${Date.now()}`,
        slug: `e2e-full-flow-campus-${Date.now()}`,
        address: "1 Full Flow St",
        city: "Testville",
        country: "Testland",
        organizationId,
        active: true,
        signupOpen: true,
      },
    });
    campusId = campus.id;

    const token = `${campus.slug}_${(await prisma.camp.findUniqueOrThrow({ where: { id: campId } })).slug}`;
    await prisma.signupLink.create({ data: { token, campusId, campId, active: true } });
    signupToken = token;
  });

  test.afterAll(async () => {
    await restoreRequiredCustomFields(relaxedCustomFields);
    if (registrationId) await prisma.registration.deleteMany({ where: { id: registrationId } });
    await deleteCamperByEmail(parentEmail);
    if (campusId) {
      await prisma.signupLink.deleteMany({ where: { campusId } });
      await prisma.campus.deleteMany({ where: { id: campusId } });
    }
  });

  test("parent signs up, uploads required documents, and submits the registration with no errors", async ({ page }) => {
    // --- Step 1: land on the signup link, create account ---
    await page.goto(`/signup/${signupToken}`);
    await expect(page.getByRole("heading", { name: "Sign Up" })).toBeVisible({ timeout: 10000 });

    await emailInput(page).fill(parentEmail);
    await nextButton(page).click();

    // --- Step 2: OTP verification ---
    await expect(page.locator('input[placeholder="Enter OTP code"]:visible')).toBeVisible({ timeout: 10000 });
    const code = await waitForOtp(parentEmail);
    await page.locator('input[placeholder="Enter OTP code"]:visible').fill(code);
    await page.locator("button:visible", { hasText: "Verify OTP" }).click();

    // --- Step 3: camper profile (system fields) ---
    await expect(page.getByText("Complete Your Profile")).toBeVisible({ timeout: 10000 });
    await page.getByLabel("Full Name").fill("E2E Full Flow Camper");
    await page.getByLabel("Date of Birth").fill("2012-06-01");
    await page.getByLabel("Gender").selectOption({ label: "Male" });
    await page.locator("button:visible", { hasText: "Complete Signup" }).click();

    // --- Step 4: lands on the registration wizard (documents step) ---
    await page.waitForURL(/\/dashboard\/register\/.+/, { timeout: 15000 });
    registrationId = page.url().split("/dashboard/register/")[1]?.split(/[/?#]/)[0];
    expect(registrationId).toBeTruthy();

    await expect(page.getByText("Upload Required Documents")).toBeVisible({ timeout: 10000 });

    // Upload every required document (fixture camp requires Birth Certificate
    // + Parent Consent Form) — "Continue to Review" stays disabled until all
    // required docs are present.
    const uploadButtons = page.locator("label", { hasText: "Upload" });
    // .count() doesn't auto-wait — the requirement rows load via their own
    // tRPC query, a tick after the "Upload Required Documents" heading above
    // it has already rendered, so wait for at least one row before counting.
    await expect(uploadButtons.first()).toBeVisible({ timeout: 10000 });
    const requiredCount = await uploadButtons.count();
    expect(requiredCount).toBeGreaterThan(0);
    for (let i = 0; i < requiredCount; i++) {
      // Re-query each iteration — a completed upload replaces the "Upload"
      // label with an "Uploaded" state, shrinking the remaining match set.
      const label = page.locator("label", { hasText: "Upload" }).first();
      await label.locator('input[type="file"]').setInputFiles(DUMMY_FILE);
      await expect(page.getByText("✓ Uploaded").nth(i)).toBeVisible({ timeout: 10000 });
    }

    const continueBtn = page.getByRole("button", { name: "Continue to Review" });
    await expect(continueBtn).toBeEnabled({ timeout: 10000 });
    await continueBtn.click();

    // --- Step 5: review & submit ---
    await expect(page.getByRole("heading", { name: "Review Your Registration" })).toBeVisible({ timeout: 10000 });
    await page.getByText("I confirm that the information provided is accurate.").click();

    const submitBtn = page.getByRole("button", { name: "Submit Registration" });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // No validation errors should surface, and the page should settle into
    // the read-only post-submit state (the wizard becomes non-editable once
    // status leaves DRAFT/REQUIRES_ACTION, showing the status banner instead
    // of the wizard steps — see STATUS_COPY in the registration page).
    await expect(page.getByText(/please fix the following/i)).not.toBeVisible();
    await expect(page.getByText(/^Registration Status:/)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/awaiting review by camp administrators/i)).toBeVisible();

    // --- Step 6: confirm final DB state matches what the UI reported ---
    const registration = await prisma.registration.findUniqueOrThrow({ where: { id: registrationId! } });
    expect(["SUBMITTED", "PENDING", "APPROVED"]).toContain(registration.status);
    expect(registration.campusId).toBe(campusId);
    expect(registration.submittedAt).not.toBeNull();

    // Document requirements can be CAMPER-scoped (stored against the camper)
    // or REGISTRATION-scoped (stored against this registration) — see
    // validation.ts's per-requirement `scope` check — so look up by either.
    const docs = await prisma.document.findMany({
      where: { OR: [{ registrationId }, { camperId: registration.camperId }] },
    });
    expect(docs.length).toBeGreaterThanOrEqual(requiredCount);
  });
});
