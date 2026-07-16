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
 * Covers the reported bug: uploading a photo (or any mid-wizard page reload
 * — e.g. a mobile photo picker evicting the tab) sent the parent back to the
 * wizard hub with their in-progress teen gone. Root cause was
 * RegistrationWizard.tsx only restoring `step` from sessionStorage on
 * remount, never `teens`/`activeTeenId`, plus a persist-before-restore
 * ordering bug that clobbered storage with the empty initial state before
 * the (partial) restore could even read it. See RegistrationWizard.tsx's
 * RESTORE action / hydratedRef gate and wizardReducer.ts.
 */
test.describe("Wizard survives a mid-flow page reload", () => {
  test.describe.configure({ mode: "serial" });

  const parentEmail = `e2e-reload-restore-${Date.now()}@camply.test`;
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
        name: `E2E Reload Campus ${Date.now()}`,
        slug: `e2e-reload-campus-${Date.now()}`,
        address: "1 Reload St",
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

  test("reloading on Details, then Documents, keeps the active teen and step instead of falling back to Hub/Landing", async ({ page }) => {
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
    await page.locator("#teen-fn").fill("Reload");
    await page.locator("#teen-ln").fill("Teen");
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
    await expect(page.getByText("Reload Teen")).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Continue to Registration" }).click();
    await expect(page.getByRole("heading", { name: "Reload Teen" })).toBeVisible({ timeout: 10000 });

    // ── Reload on Details: must NOT show "No teen selected" or bounce to Hub/Landing ──
    await page.reload();
    await expect(page.getByRole("heading", { name: "Reload Teen" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("No teen selected")).not.toBeVisible();
    await expect(page.getByText("Register Your Teen")).not.toBeVisible();

    // ── Advance to Documents, seed required docs, reload again ──
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout: 5000 });

    await page.reload();
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Welcome, Parent!")).not.toBeVisible();

    const wizardData = await page.evaluate(() => sessionStorage.getItem("camply-registration-wizard"));
    const parsed = wizardData ? JSON.parse(wizardData) : null;
    const teen = parsed?.teens?.[0];
    expect(teen).toBeTruthy();
    expect(teen.firstName).toBe("Reload");

    const reqs = await prisma.documentRequirement.findMany({ where: { campId, required: true, deletedAt: null } });
    const parentUser = await prisma.user.findUniqueOrThrow({ where: { email: parentEmail } });
    for (const req of reqs) {
      await prisma.document.create({
        data: {
          requirementId: req.id,
          ...(req.scope === "CAMPER" ? { camperId: teen.camperId } : { registrationId: teen.registrationId }),
          url: `https://utfs.io/f/e2e-doc-${Date.now()}-${req.id}.pdf`,
          fileName: "dummy-document.pdf",
          fileType: "application/pdf",
          fileSize: 1024,
          uploadedById: parentUser.id,
        },
      });
    }

    // Remount to pick up the seeded docs (same technique as the other wizard specs).
    await page.getByRole("button", { name: "← Back" }).click();
    await expect(page.getByRole("heading", { name: "Reload Teen" })).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout: 5000 });

    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeEnabled({ timeout: 10000 });
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Review Your Registration" })).toBeVisible({ timeout: 5000 });
    const checkboxes = page.locator('input[type="checkbox"]');
    const cbCount = await checkboxes.count();
    for (let i = 0; i < cbCount; i++) {
      await checkboxes.nth(i).check();
    }
    await page.getByRole("button", { name: "Submit Registration" }).click();
    await expect(page.getByText("Registration Submitted")).toBeVisible({ timeout: 20000 });

    const camper = await prisma.camper.findFirstOrThrow({ where: { firstName: "Reload", lastName: "Teen" } });
    const registration = await prisma.registration.findFirstOrThrow({ where: { camperId: camper.id } });
    expect(["SUBMITTED", "PENDING", "APPROVED"]).toContain(registration.status);
  });
});
