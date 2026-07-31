import { test, expect, type Page } from "@playwright/test";
import { randomBytes } from "crypto";
import {
  prisma,
  getFixtureOrgContext,
  deleteCamperByEmail,
  resetSystemFieldDefaults,
  relaxRequiredCustomFields,
  restoreRequiredCustomFields,
  acceptAllDeclarations,
} from "./helpers";

/**
 * Covers the reported bug: when a parent registers two teens together and
 * one fails at submit, retrying blindly re-submitted BOTH teens again —
 * including the one that already succeeded. src/server/registration/engine.ts's
 * submitRegistration is idempotent for a still-SUBMITTED/PENDING
 * registration (this fixture camp's approvalMode is MANUAL, so a normal
 * successful submit only reaches PENDING), but a camp with approvalMode
 * "AUTO" moves a successful submit straight to APPROVED — and re-submitting
 * an APPROVED registration hits an illegal state transition
 * (assertTransition rejects APPROVED -> SUBMITTED), which would have
 * permanently stuck the family on Review with no way to finish. This spec
 * simulates that AUTO-approval outcome directly on the successful teen's
 * row (rather than mutating the shared fixture camp's approvalMode, which
 * other specs run against concurrently) and proves the fix in
 * Review.tsx's handleSubmit (succeededIds tracking) never touches an
 * already-succeeded teen on retry.
 */
test.describe("Review step retry never re-submits an already-succeeded teen", () => {
  test.describe.configure({ mode: "serial" });

  const parentEmail = `e2e-retry-${Date.now()}@camply.test`;
  const parentPassword = "password123";
  let campusId: string;
  let signupToken: string;
  let campId: string;
  let organizationId: string;
  let relaxedCustomFields: { id: string; required: boolean }[] = [];

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;
    await resetSystemFieldDefaults("CAMPER");
    relaxedCustomFields = await relaxRequiredCustomFields("CAMPER");

    const campus = await prisma.campus.create({
      data: {
        name: `E2E Retry Campus ${Date.now()}`,
        slug: `e2e-retry-campus-${Date.now()}`,
        address: "1 Retry St",
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
    await restoreRequiredCustomFields(relaxedCustomFields);
    await deleteCamperByEmail(parentEmail);
    if (campusId) {
      await prisma.signupLink.deleteMany({ where: { campusId } });
      await prisma.campus.deleteMany({ where: { id: campusId } });
    }
  });

  async function fillTeenForm(page: Page, firstName: string, lastName: string, month: string, day: string, year: string, gender: "Male" | "Female") {
    const addAnother = page.getByRole("button", { name: "Add Another Teen" });
    if (await addAnother.isVisible().catch(() => false)) {
      await addAnother.click();
    }
    await page.locator("#teen-fn").fill(firstName);
    await page.locator("#teen-ln").fill(lastName);
    await page.getByRole("button", { name: /Select date/i }).click();
    await page.waitForTimeout(300);
    const dobSelects = page.locator("select:visible");
    await dobSelects.nth(0).selectOption(month);
    await dobSelects.nth(1).selectOption(day);
    await dobSelects.nth(2).selectOption(year);
    await page.getByRole("button", { name: "Apply" }).click();
    await page.waitForTimeout(300);
    await page.locator(`input[name="teen-gender"][value="${gender}"]`).click();
    await page.getByRole("button", { name: "Add Teen" }).click();
    await expect(page.getByText(`${firstName} ${lastName}`)).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Continue to Registration" }).click();
    await expect(page.getByRole("heading", { name: `${firstName} ${lastName}` })).toBeVisible({ timeout: 10000 });
  }

  async function seedDocsForActiveTeen(page: Page) {
    const wizardData = await page.evaluate(
      (key) => localStorage.getItem(key),
      `camply-registration-wizard:${signupToken}`
    );
    const snapshot = wizardData ? JSON.parse(wizardData) : null;
    const parsed = snapshot?.state ?? null;
    const activeTeen = parsed?.teens?.find((t: any) => t.camperId === parsed.activeTeenId) ?? parsed?.teens?.at(-1);
    if (!activeTeen) throw new Error("No active teen found in wizard localStorage");

    const reqs = await prisma.documentRequirement.findMany({ where: { campId, required: true, deletedAt: null } });
    const parentUser = await prisma.user.findUniqueOrThrow({ where: { email: parentEmail } });
    for (const req of reqs) {
      const existing = await prisma.document.findFirst({
        where: {
          requirementId: req.id,
          ...(req.scope === "CAMPER" ? { camperId: activeTeen.camperId } : { registrationId: activeTeen.registrationId }),
          deletedAt: null,
        },
      });
      if (!existing) {
        await prisma.document.create({
          data: {
            requirementId: req.id,
            ...(req.scope === "CAMPER" ? { camperId: activeTeen.camperId } : { registrationId: activeTeen.registrationId }),
            url: `https://utfs.io/f/e2e-doc-${Date.now()}-${req.id}.pdf`,
            fileName: "dummy-document.pdf",
            fileType: "application/pdf",
            fileSize: 1024,
            uploadedById: parentUser.id,
          },
        });
      }
    }
    return activeTeen as { camperId: string; registrationId: string };
  }

  test("retrying after a partial failure skips the teen that already succeeded, even if it's now APPROVED", async ({ page }) => {
    test.setTimeout(90000);

    await page.goto(`/register/${signupToken}`);
    await page.getByRole("button", { name: "Start Registration" }).click();
    await expect(page.getByText("What's your email address?")).toBeVisible({ timeout: 5000 });
    await page.locator('input[type="email"]:visible').fill(parentEmail);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Welcome!")).toBeVisible({ timeout: 5000 });
    await page.locator("#reg-firstname").fill("Parent");
    await page.locator("#reg-lastname").fill("E2E");
    await page.locator("#reg-pw").fill(parentPassword);
    await page.locator("#reg-pw-confirm").fill(parentPassword);
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page.getByText("Welcome, Parent!")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Register a Teen" }).click();
    await expect(page.getByText("Who's coming to camp?")).toBeVisible({ timeout: 10000 });
    await fillTeenForm(page, "Cara", "Succeeder", "06", "15", "2010", "Female");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout: 5000 });
    await seedDocsForActiveTeen(page);
    await page.getByRole("button", { name: "← Back" }).click();
    await expect(page.getByRole("heading", { name: "Cara Succeeder" })).toBeVisible({ timeout: 5000 });
    // Re-visiting Details -> Documents (mirroring wizard-review-error-attribution.spec.ts)
    // is what actually sets SET_TEEN_COMPLETE's fieldsComplete for this
    // teen — skipping it leaves the teen "Incomplete" on Review and the
    // declarations section never renders.
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "← Back" }).click();
    await expect(page.getByRole("heading", { name: "Cara Succeeder" })).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "← Back" }).click();
    await expect(page.getByText("Welcome, Parent!")).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: "Register a Teen" }).click();
    await expect(page.getByText("Who's coming to camp?")).toBeVisible({ timeout: 10000 });
    await fillTeenForm(page, "Drew", "Failer", "03", "20", "2011", "Male");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout: 5000 });
    await seedDocsForActiveTeen(page);
    await page.getByRole("button", { name: "← Back" }).click();
    await expect(page.getByRole("heading", { name: "Drew Failer" })).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout: 5000 });

    // Force Drew's registration into an illegal pre-submit state so his
    // first-attempt submit fails while Cara's succeeds.
    const drewCamper = await prisma.camper.findFirstOrThrow({ where: { firstName: "Drew", lastName: "Failer" } });
    const drewRegistration = await prisma.registration.findFirstOrThrow({ where: { camperId: drewCamper.id } });
    await prisma.registration.update({ where: { id: drewRegistration.id }, data: { status: "WAITLISTED" } });

    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeEnabled({ timeout: 10000 });
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Review Your Registration" })).toBeVisible({ timeout: 5000 });
    await acceptAllDeclarations(page);
    await page.getByRole("button", { name: "Submit Registration" }).click();

    const errorBox = page.locator(".bg-danger-50").filter({ hasText: /Drew Failer/ });
    await expect(errorBox).toBeVisible({ timeout: 10000 });
    await expect(errorBox).not.toContainText("Cara Succeeder");

    // Cara's first submit succeeded (MANUAL approvalMode -> PENDING). Force
    // her into APPROVED to simulate what an AUTO-approval camp would have
    // done on that same successful submit — this is the state that makes a
    // blind resubmit illegal.
    const caraCamper = await prisma.camper.findFirstOrThrow({ where: { firstName: "Cara", lastName: "Succeeder" } });
    const caraRegistration = await prisma.registration.findFirstOrThrow({ where: { camperId: caraCamper.id } });
    expect(caraRegistration.status).toBe("PENDING");
    await prisma.registration.update({ where: { id: caraRegistration.id }, data: { status: "APPROVED", approvedAt: new Date() } });

    // Fix Drew's registration back to DRAFT (whatever the real-world cause
    // of his failure was, this represents it being resolved) and retry.
    await prisma.registration.update({ where: { id: drewRegistration.id }, data: { status: "DRAFT" } });
    await page.getByRole("button", { name: "Submit Registration" }).click();

    // The fix: retry only touches Drew. If Cara's already-APPROVED
    // registration were resubmitted (the pre-fix behavior), this would
    // throw "Cannot transition registration from APPROVED to SUBMITTED"
    // and the family would be stuck on Review permanently.
    await expect(page.getByRole("heading", { name: "Confirmation" }).or(page.getByText(/submitted|success/i)).first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".bg-danger-50")).toHaveCount(0);

    const caraReloaded = await prisma.registration.findUniqueOrThrow({ where: { id: caraRegistration.id } });
    expect(caraReloaded.status).toBe("APPROVED"); // untouched by the retry
    const drewReloaded = await prisma.registration.findUniqueOrThrow({ where: { id: drewRegistration.id } });
    expect(["SUBMITTED", "PENDING", "APPROVED"]).toContain(drewReloaded.status); // now actually submitted
  });
});
