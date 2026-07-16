import { test, expect, type Page } from "@playwright/test";
import { randomBytes } from "crypto";
import {
  prisma,
  getFixtureOrgContext,
  deleteCamperByEmail,
  resetSystemFieldDefaults,
  relaxRequiredCustomFields,
  restoreRequiredCustomFields,
  loginWithPassword,
} from "./helpers";

/**
 * Covers the parent-wizard upload race that produced "Cannot transition
 * registration from PENDING to SUBMITTED": a document (or photo) upload
 * still in flight didn't block the Next button, so a partial multi-teen
 * submit could leave one teen PENDING while another failed validation —
 * retrying then re-submitted the already-PENDING teen and errored.
 *
 * See src/app/register/[token]/steps/Documents.tsx, Details.tsx,
 * src/components/file-upload.tsx, and src/server/registration/engine.ts
 * (submitRegistration idempotency).
 */
test.describe("Wizard upload gating and retry-safe submit", () => {
  test.describe.configure({ mode: "serial" });

  const parentEmail = `e2e-upload-gating-${Date.now()}@camply.test`;
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

    // The photoUrl SYSTEM field ships hidden by default — make it visible so
    // the Details step actually renders the "Photo Of Teen" upload field.
    await prisma.formField.updateMany({
      where: { organizationId, audience: "CAMPER", source: "SYSTEM", name: "photoUrl" },
      data: { visible: true },
    });

    const campus = await prisma.campus.create({
      data: {
        name: `E2E Upload Campus ${Date.now()}`,
        slug: `e2e-upload-campus-${Date.now()}`,
        address: "1 Upload St",
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
    await resetSystemFieldDefaults("CAMPER"); // restores photoUrl visible:false
    await deleteCamperByEmail(parentEmail);
    if (campusId) {
      await prisma.signupLink.deleteMany({ where: { campusId } });
      await prisma.campus.deleteMany({ where: { id: campusId } });
    }
  });

  async function signUpAndAddTeen(page: Page, firstName: string, lastName: string) {
    await page.goto(`/register/${signupToken}`);
    const beginBtn = page.getByRole("button", { name: "Start Registration" });
    await expect(beginBtn).toBeVisible({ timeout: 20000 });
    await beginBtn.click();

    await expect(page.getByText("What's your email address?")).toBeVisible({ timeout: 5000 });
    await page.locator('input[type="email"]:visible').fill(parentEmail);
    await page.getByRole("button", { name: "Continue" }).click();

    // First-time signup vs. returning (second teen) branch.
    await page.waitForSelector("#reg-returning-pw, #reg-pw, #reg-firstname", { timeout: 15000 });
    const returningPw = page.locator("#reg-returning-pw");
    if (await returningPw.isVisible().catch(() => false)) {
      await returningPw.fill(parentPassword);
      await page.getByRole("button", { name: "Sign In" }).click();
    } else {
      await page.locator("#reg-firstname").fill("Parent");
      await page.locator("#reg-lastname").fill("E2E");
      await page.locator("#reg-pw").fill(parentPassword);
      await page.locator("#reg-pw-confirm").fill(parentPassword);
      await page.getByRole("button", { name: "Create Account" }).click();
      await expect(page.getByText("Welcome, Parent!")).toBeVisible({ timeout: 10000 });
    }
    await page.getByRole("button", { name: "Register a Teen" }).click();

    await expect(page.getByText("Who's coming to camp?")).toBeVisible({ timeout: 15000 });
    await page.locator("#teen-fn").fill(firstName);
    await page.locator("#teen-ln").fill(lastName);

    await page.getByRole("button", { name: /Select date/i }).click();
    await page.waitForTimeout(300);
    const dobSelects = page.locator("select:visible");
    await dobSelects.nth(0).selectOption("06");
    await dobSelects.nth(1).selectOption("15");
    await dobSelects.nth(2).selectOption("2010");
    await page.getByRole("button", { name: "Apply" }).click();
    await page.waitForTimeout(300);

    await page.locator('input[name="teen-gender"][value="Male"]').click();
    await page.getByRole("button", { name: "Add Teen" }).click();
    await expect(page.getByText(`${firstName} ${lastName}`)).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: "Continue to Registration" }).click();
    await expect(page.getByRole("heading", { name: `${firstName} ${lastName}` })).toBeVisible({ timeout: 10000 });
  }

  test("Details step shows an avatar placeholder box, and an uploaded photo carries through to Review", async ({ page }) => {
    test.setTimeout(60000);
    await signUpAndAddTeen(page, "Photo", "Teen");

    // Empty-state avatar placeholder box next to the photo upload button.
    const photoLabel = page.getByText("Photo", { exact: true });
    await expect(photoLabel).toBeVisible({ timeout: 10000 });
    const uploadButton = page.getByRole("button", { name: "Upload File" });
    await expect(uploadButton).toBeVisible();
    // No <img> yet — only the placeholder icon box.
    await expect(page.locator("img[alt='Uploaded preview']")).toHaveCount(0);

    // Seed a photo directly (bypassing real UploadThing, same rationale as
    // parent-registration-flow.spec.ts's document seeding). A hard page
    // reload would lose the wizard's in-memory state (RegistrationWizard.tsx
    // only restores `step` from sessionStorage on mount, not `teens`/
    // `activeTeenId` — a separate, pre-existing gap, out of scope here), so
    // instead force a remount of StepDetails via in-app Next→Back
    // navigation, which triggers a fresh camper.getById fetch.
    const camper = await prisma.camper.findFirstOrThrow({ where: { user: { email: parentEmail } } });
    const photoUrl = `https://utfs.io/f/e2e-photo-${Date.now()}.png`;
    await prisma.camper.update({ where: { id: camper.id }, data: { photoUrl } });
    const photoField = await prisma.formField.findFirstOrThrow({
      where: { organizationId, audience: "CAMPER", source: "SYSTEM", name: "photoUrl" },
    });
    await prisma.profileFieldValue.create({
      data: { camperId: camper.id, fieldId: photoField.id, value: photoUrl },
    });

    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "← Back" }).click();
    await expect(page.getByRole("heading", { name: "Photo Teen" })).toBeVisible({ timeout: 5000 });

    await expect(page.locator("img[alt='Uploaded preview']")).toHaveAttribute("src", photoUrl, { timeout: 10000 });

    // Advance to Documents, then Review — the same photo should render there.
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout: 5000 });

    // Next is blocked until every required document is uploaded — this is
    // the exact gap that let a parent reach Review with a still-missing doc
    // and hit "Cannot transition registration from PENDING to SUBMITTED" on
    // a retried submit.
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
    await expect(page.getByText("Upload all required documents to continue.")).toBeVisible();

    const reqs = await prisma.documentRequirement.findMany({ where: { campId, required: true, deletedAt: null } });
    const registration = await prisma.registration.findFirstOrThrow({ where: { camperId: camper.id } });
    const parentUser = await prisma.user.findUniqueOrThrow({ where: { email: parentEmail } });
    for (const req of reqs) {
      await prisma.document.create({
        data: {
          requirementId: req.id,
          ...(req.scope === "CAMPER" ? { camperId: camper.id } : { registrationId: registration.id }),
          url: `https://utfs.io/f/e2e-doc-${Date.now()}-${req.id}.pdf`,
          fileName: "dummy-document.pdf",
          fileType: "application/pdf",
          fileSize: 1024,
          uploadedById: parentUser.id,
        },
      });
    }

    // Remount StepDocuments (Back to Details, Next back to Documents) so the
    // existingDocs query refetches and picks up the seeded rows.
    await page.getByRole("button", { name: "← Back" }).click();
    await expect(page.getByRole("heading", { name: "Photo Teen" })).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout: 5000 });

    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeEnabled({ timeout: 10000 });
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Review Your Registration" })).toBeVisible({ timeout: 5000 });
    await expect(page.locator(`img[src="${photoUrl}"]`)).toBeVisible({ timeout: 10000 });
  });

  test("retrying registration.submit for an already-PENDING registration succeeds without the illegal-transition error", async ({ page }) => {
    // Reproduces the reported bug at the router/engine layer: a partial
    // multi-teen submit (one teen passes validation and becomes PENDING,
    // another fails because a required doc wasn't uploaded yet) followed by
    // a retry that re-submits everyone — including the already-PENDING teen.
    const camper = await prisma.camper.findFirstOrThrow({ where: { user: { email: parentEmail } } });
    const registration = await prisma.registration.findFirstOrThrow({ where: { camperId: camper.id } });
    // The previous test already advanced this registration to PENDING with
    // all required docs — this alone reproduces "already PENDING, retried".
    await loginWithPassword(page, parentEmail, parentPassword);

    const res = await page.request.post("/api/trpc/registration.submit?batch=1", {
      data: { "0": { json: { registrationId: registration.id } } },
      headers: { "Content-Type": "application/json" },
    });

    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body[0]?.error).toBeUndefined();

    const reloaded = await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } });
    expect(reloaded.status).toBe("PENDING");

    const submittedEvents = await prisma.auditLog.findMany({
      where: { registrationId: registration.id, action: "REGISTRATION_SUBMITTED" },
    });
    expect(submittedEvents).toHaveLength(1);
  });
});
