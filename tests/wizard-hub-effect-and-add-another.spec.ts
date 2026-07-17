import { test, expect } from "@playwright/test";
import { randomBytes } from "crypto";
import {
  prisma,
  getFixtureOrgContext,
  deleteCamperByEmail,
  resetSystemFieldDefaults,
  relaxRequiredCustomFields,
  restoreRequiredCustomFields,
} from "./helpers";

/**
 * Covers two related reported bugs, both rooted in the wizard's `?step=hub`
 * handling effect (RegistrationWizard.tsx) never being one-shot and the
 * `step=hub` param never being stripped from the URL:
 *
 *  1. Uploading a photo on the Details step (or any action that backgrounds
 *     the tab on mobile — camera, file picker) triggers next-auth's default
 *     refetchOnWindowFocus, producing a new `session` object. The old effect
 *     re-ran on every session change and unconditionally dispatched
 *     GO_TO HUB, clobbering an in-progress DETAILS step. Fixed with a
 *     one-shot ref guard plus a "restore wins" check.
 *  2. "Add Another Camper" on the Confirmation screen was a <Link> back to
 *     the same `?step=hub` URL — a no-op whenever that param was already
 *     present (the common case: the dashboard's "register" link always
 *     appends `?step=hub`), since an unchanged searchParam never re-triggers
 *     the effect. Fixed by dispatching a new START_ANOTHER action directly
 *     instead of round-tripping through the URL.
 *
 * Both scenarios are driven within a single test (rather than split across
 * `serial`-mode tests) because each `test()` gets its own fresh page/browser
 * context — a signed-in session and in-progress wizard state from one test
 * never carry over to the next even under `mode: "serial"`.
 */
test.describe("Wizard hub-effect one-shot guard + Add Another Camper", () => {
  const parentEmail = `e2e-hub-effect-${Date.now()}@camply.test`;
  const parentPassword = "password123";
  let signupToken: string;
  let campusId: string;
  let midAgeYear: number;
  let relaxedCustomFields: { id: string; required: boolean }[] = [];

  test.beforeAll(async () => {
    const { organizationId, campId } = await getFixtureOrgContext();
    await resetSystemFieldDefaults("CAMPER");
    relaxedCustomFields = await relaxRequiredCustomFields("CAMPER");
    const camp = await prisma.camp.findUniqueOrThrow({ where: { id: campId } });
    const minAge = camp.minAge ?? 6;
    const maxAge = camp.maxAge ?? 17;
    midAgeYear = new Date().getFullYear() - Math.round((minAge + maxAge) / 2);

    const stamp = Date.now();
    const campus = await prisma.campus.create({
      data: {
        name: `E2E Hub Effect Campus ${stamp}`,
        slug: `e2e-hub-effect-campus-${stamp}`,
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
    await restoreRequiredCustomFields(relaxedCustomFields);
    await deleteCamperByEmail(parentEmail);
    if (campusId) {
      await prisma.registration.deleteMany({ where: { campusId } });
      await prisma.signupLink.deleteMany({ where: { campusId } });
      await prisma.campus.deleteMany({ where: { id: campusId } });
    }
  });

  async function addTeen(page: import("@playwright/test").Page, firstName: string, lastName: string, gender: "Male" | "Female") {
    await page.getByRole("button", { name: "Register a Teen" }).click();
    await expect(page.getByText("Who's coming to camp?")).toBeVisible({ timeout: 10000 });
    await page.locator("#teen-fn").fill(firstName);
    await page.locator("#teen-ln").fill(lastName);
    await page.getByRole("button", { name: /Select date/i }).click();
    await page.waitForTimeout(300);
    const dobSelects = page.locator("select:visible");
    await dobSelects.nth(0).selectOption("06");
    await dobSelects.nth(1).selectOption("15");
    await dobSelects.nth(2).selectOption(String(midAgeYear));
    await page.getByRole("button", { name: "Apply" }).click();
    await page.waitForTimeout(300);
    await page.locator(`input[name="teen-gender"][value="${gender}"]`).click();
    await page.getByRole("button", { name: "Add Teen" }).click();
    await expect(page.getByText(`${firstName} ${lastName}`)).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Continue to Registration" }).click();
    await expect(page.getByRole("heading", { name: `${firstName} ${lastName}` })).toBeVisible({ timeout: 10000 });
  }

  test("session refetch and reload don't bounce Details to Hub; Add Another Camper resets cleanly", async ({ page }) => {
    test.setTimeout(90000);

    // Enter via the exact URL shape the dashboard's "register" link uses —
    // ?step=hub, present from the very first navigation.
    await page.goto(`/register/${signupToken}?step=hub`);
    await expect(page.getByText("What's your email address?")).toBeVisible({ timeout: 10000 });
    await page.locator('input[type="email"]:visible').fill(parentEmail);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Welcome!")).toBeVisible({ timeout: 5000 });
    await page.locator("#reg-firstname").fill("HubEffect");
    await page.locator("#reg-lastname").fill("Parent");
    await page.locator("#reg-pw").fill(parentPassword);
    await page.locator("#reg-pw-confirm").fill(parentPassword);
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page.getByText(/^Welcome/)).toBeVisible({ timeout: 10000 });

    await addTeen(page, "Session", "Refetch", "Male");

    // Simulate what happens on mobile after returning from the camera/file
    // picker: next-auth's refetchOnWindowFocus fires a session refetch.
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.waitForTimeout(1000);
    await expect(page.getByRole("heading", { name: "Session Refetch" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Register a Teen" })).not.toBeVisible();

    // The URL still carries the original ?step=hub (never stripped) — a
    // reload must restore to Details, not regress to Hub.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Session Refetch" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "Register a Teen" })).not.toBeVisible();

    // --- Drive through to Confirmation ---
    const toDocsBtn = page.getByRole("button", { name: "Next", exact: true });
    await expect(toDocsBtn).toBeVisible({ timeout: 5000 });
    await toDocsBtn.click();
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout: 5000 });

    // Seed any required documents directly (same pattern as
    // parent-registration-flow.spec.ts) rather than driving a real upload.
    const wizardData = await page.evaluate((key) => localStorage.getItem(key), `camply-registration-wizard:${signupToken}`);
    const parsed = wizardData ? JSON.parse(wizardData).state : null;
    const teen = parsed?.teens?.find((t: any) => t.firstName === "Session");
    if (teen?.registrationId) {
      const reqs = await prisma.documentRequirement.findMany({ where: { campId: parsed.campData?.campId, required: true, deletedAt: null } });
      const parentUser = await prisma.user.findUniqueOrThrow({ where: { email: parentEmail } });
      for (const req of reqs) {
        const existing = await prisma.document.findFirst({
          where: { requirementId: req.id, ...(req.scope === "CAMPER" ? { camperId: teen.camperId } : { registrationId: teen.registrationId }), deletedAt: null },
        });
        if (!existing) {
          await prisma.document.create({
            data: {
              requirementId: req.id,
              ...(req.scope === "CAMPER" ? { camperId: teen.camperId } : { registrationId: teen.registrationId }),
              url: `https://utfs.io/f/e2e-doc-${Date.now()}.pdf`,
              fileName: "dummy-document.pdf",
              fileType: "application/pdf",
              fileSize: 1024,
              uploadedById: parentUser.id,
            },
          });
        }
      }
      await page.getByRole("button", { name: "← Back" }).click();
      await expect(page.getByRole("heading", { name: "Session Refetch" })).toBeVisible({ timeout: 5000 });
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout: 5000 });
    }

    const reviewBtn = page.getByRole("button", { name: "Next", exact: true });
    await expect(reviewBtn).toBeEnabled({ timeout: 10000 });
    await reviewBtn.click();
    await expect(page.getByRole("heading", { name: "Review Your Registration" })).toBeVisible({ timeout: 5000 });
    const checkboxes = page.locator('input[type="checkbox"]');
    const cbCount = await checkboxes.count();
    for (let i = 0; i < cbCount; i++) await checkboxes.nth(i).check();
    await page.getByRole("button", { name: "Submit Registration" }).click();
    await expect(page.getByText("Registration Submitted")).toBeVisible({ timeout: 20000 });

    // URL still carries the original ?step=hub from the very first goto —
    // this is the exact "no-op click" bug: the old code was a <Link> back to
    // this same URL, and an unchanged searchParam never re-triggers a
    // useEffect, so the button silently did nothing.
    expect(page.url()).toContain("?step=hub");
    await page.getByRole("button", { name: "Add Another Camper" }).click();

    await expect(page.getByRole("button", { name: "Register a Teen" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Session Refetch")).not.toBeVisible();

    // The submitted teen must not resurface — resubmitting it would error
    // since it's no longer in a submittable state.
    await addTeen(page, "SecondCamper", "AfterReset", "Female");
    await expect(page.getByText("Session Refetch")).not.toBeVisible();
  });
});
