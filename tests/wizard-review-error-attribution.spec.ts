import { test, expect, type Page } from "@playwright/test";
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
 * Covers the reported bug: when a parent registers two teens together and
 * one fails at submit, the Review step's error banner showed only the raw
 * server message with no indication of which child it referred to (see
 * src/app/register/[token]/steps/Review.tsx's handleSubmit — it discarded
 * the Promise.allSettled index before building the error list).
 *
 * The failure here is engineered via an illegal status transition (forcing
 * one teen's registration to WAITLISTED before submit, which
 * assertTransition rejects) rather than an age-bracket failure — it's
 * self-contained to this spec's own fixture registration, doesn't require
 * mutating the shared fixture camp's age settings (which other specs run
 * against concurrently), and produces the exact same generic, name-less
 * server message shape ("Cannot transition registration from X to
 * SUBMITTED") that the original bug report showed.
 */
test.describe("Review step attributes submit errors to the correct teen", () => {
  test.describe.configure({ mode: "serial" });

  const parentEmail = `e2e-error-attr-${Date.now()}@camply.test`;
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
        name: `E2E Error Attr Campus ${Date.now()}`,
        slug: `e2e-error-attr-campus-${Date.now()}`,
        address: "1 Error St",
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
    // StepTeens shows the entry form directly for the first teen, but a list
    // view ("Your Teens") with an "Add Another Teen" button for subsequent
    // ones — click through it when present.
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
    // ADD_TEEN sets activeTeenId to the teen just added, so Details opens on
    // this one directly.
    await expect(page.getByRole("heading", { name: `${firstName} ${lastName}` })).toBeVisible({ timeout: 10000 });
  }

  async function seedDocsForActiveTeen(page: Page) {
    // Persistence lives in localStorage (survives a mobile tab discard,
    // unlike sessionStorage), keyed per-token, wrapped with a savedAt
    // timestamp — see RegistrationWizard.tsx's storageKey()/persist().
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

  test("submitting two teens where one is illegally-transitioned shows the failure prefixed with that teen's name", async ({ page }) => {
    test.setTimeout(90000);

    // ── Sign up + add first teen ──
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
    await fillTeenForm(page, "Alice", "Passer", "06", "15", "2010", "Female");

    // Details → Documents for Alice, seed her required docs, remount to pick them up.
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout: 5000 });
    await seedDocsForActiveTeen(page);
    await page.getByRole("button", { name: "← Back" }).click();
    await expect(page.getByRole("heading", { name: "Alice Passer" })).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout: 5000 });

    // ── Back to Hub (without submitting) to add a second teen ──
    await page.getByRole("button", { name: "← Back" }).click();
    await expect(page.getByRole("heading", { name: "Alice Passer" })).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "← Back" }).click();
    await expect(page.getByText("Welcome, Parent!")).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: "Register a Teen" }).click();
    await expect(page.getByText("Who's coming to camp?")).toBeVisible({ timeout: 10000 });
    await fillTeenForm(page, "Bob", "Failer", "03", "20", "2011", "Male"); // in range for the fixture camp's 6-17 age policy

    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout: 5000 });
    await seedDocsForActiveTeen(page);
    await page.getByRole("button", { name: "← Back" }).click();
    await expect(page.getByRole("heading", { name: "Bob Failer" })).toBeVisible({ timeout: 5000 });
    // Two teens are now in wizard state (Alice + Bob) — the removed
    // TeenSwitcher used to render a tab bar exactly under this condition.
    await expect(page.getByRole("tab")).toHaveCount(0);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("tab")).toHaveCount(0);

    // Force Bob's registration into an illegal pre-submit state — DRAFT is the
    // only status assertTransition allows into SUBMITTED, so this deterministically
    // fails his submit while Alice's succeeds normally.
    const bobCamper = await prisma.camper.findFirstOrThrow({ where: { firstName: "Bob", lastName: "Failer" } });
    const bobRegistration = await prisma.registration.findFirstOrThrow({ where: { camperId: bobCamper.id } });
    await prisma.registration.update({ where: { id: bobRegistration.id }, data: { status: "WAITLISTED" } });

    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeEnabled({ timeout: 10000 });
    await page.getByRole("button", { name: "Next", exact: true }).click();

    // ── Review: both teens present, submit both together ──
    await expect(page.getByRole("heading", { name: "Review Your Registration" })).toBeVisible({ timeout: 5000 });
    const checkboxes = page.locator('input[type="checkbox"]');
    const cbCount = await checkboxes.count();
    for (let i = 0; i < cbCount; i++) {
      await checkboxes.nth(i).check();
    }
    await page.getByRole("button", { name: "Submit Registration" }).click();

    // The error is attributed to Bob by name and does NOT implicate Alice.
    const errorBox = page.locator(".bg-danger-50").filter({ hasText: /Bob Failer/ });
    await expect(errorBox).toBeVisible({ timeout: 10000 });
    await expect(errorBox).toContainText("Cannot transition registration");
    await expect(errorBox).not.toContainText("Alice Passer");

    // Alice's registration succeeded and is PENDING; Bob's is untouched (still WAITLISTED).
    const aliceCamper = await prisma.camper.findFirstOrThrow({ where: { firstName: "Alice", lastName: "Passer" } });
    const aliceRegistration = await prisma.registration.findFirstOrThrow({ where: { camperId: aliceCamper.id } });
    expect(aliceRegistration.status).toBe("PENDING");
    const bobReloaded = await prisma.registration.findUniqueOrThrow({ where: { id: bobRegistration.id } });
    expect(bobReloaded.status).toBe("WAITLISTED");
  });
});
