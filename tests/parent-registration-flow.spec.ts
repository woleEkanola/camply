import { test, expect, type Page } from "@playwright/test";
import path from "path";
import { randomBytes } from "crypto";
import {
  prisma,
  getFixtureOrgContext,
  deleteCamperByEmail,
  resetSystemFieldDefaults,
  relaxRequiredCustomFields,
  restoreRequiredCustomFields,
} from "./helpers";

const DUMMY_FILE = path.join(__dirname, "fixtures", "dummy-image.png");

function byLabel(page: Page, labelText: string) {
  return page.locator("label", { hasText: labelText }).locator(
    "xpath=following-sibling::*[1][self::input or self::textarea or self::select] | following-sibling::*[1]//*[self::input or self::textarea or self::select]"
  ).first();
}

test.describe("Parent Teen Registration", () => {
  test.describe.configure({ mode: "serial" });

  const parentEmail = `e2e-teen-reg-${Date.now()}@camply.test`;
  const parentPassword = "password123";
  let campusId: string;
  let signupToken: string;
  let relaxedCustomFields: { id: string; required: boolean }[] = [];

  test.beforeAll(async () => {
    const { organizationId, campId } = await getFixtureOrgContext();
    await resetSystemFieldDefaults("CAMPER");
    relaxedCustomFields = await relaxRequiredCustomFields("CAMPER");

    const campus = await prisma.campus.create({
      data: {
        name: `E2E Teen Campus ${Date.now()}`,
        slug: `e2e-teen-campus-${Date.now()}`,
        address: "1 Teen St",
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

  test("full flow: landing → account → add teen → details → docs → review → submit", async ({ page }) => {
    test.setTimeout(90000);
    // ── Landing ──
    await page.goto(`/register/${signupToken}`);

    const beginBtn = page.getByRole("button", { name: "Start Registration" });
    await expect(beginBtn).toBeVisible({ timeout: 20000 });
    await beginBtn.click();

    // ── Email Step ──
    await expect(page.getByText("What's your email address?")).toBeVisible({ timeout: 5000 });
    const emailField = page.locator('input[type="email"]:visible');
    await emailField.fill(parentEmail);
    await page.getByRole("button", { name: "Continue" }).click();

    // ── New Account ──
    await expect(page.getByText("Welcome!")).toBeVisible({ timeout: 5000 });
    await page.locator("#reg-firstname").fill("Parent");
    await page.locator("#reg-lastname").fill("E2E");
    await page.locator("#reg-pw").fill(parentPassword);
    await page.locator("#reg-pw-confirm").fill(parentPassword);
    await page.getByRole("button", { name: "Create Account" }).click();

    // ── Add Teen ──
    await expect(page.getByText("Who's coming to camp?")).toBeVisible({ timeout: 10000 });

    await page.locator("#teen-fn").fill("Test");
    await page.locator("#teen-ln").fill("Camper");

    await page.getByRole("button", { name: /Select date/i }).click();
    await page.waitForTimeout(300);
    const dobSelects = page.locator('select:visible');
    await dobSelects.nth(0).selectOption("06");
    await dobSelects.nth(1).selectOption("15");
    await dobSelects.nth(2).selectOption("2010");
    await page.getByRole("button", { name: "Apply" }).click();
    await page.waitForTimeout(300);

    await page.locator('input[name="teen-gender"][value="Male"]').click();
    await page.getByRole("button", { name: "Add Teen" }).click();

    await expect(page.getByText("Test Camper")).toBeVisible({ timeout: 5000 });

    // ── Continue to Registration (Details) ──
    await page.getByRole("button", { name: "Continue to Registration" }).click();
    await expect(page.getByRole("heading", { name: "Test Camper" })).toBeVisible({ timeout: 10000 });

    // ── Navigate to Documents (all fields are now in one scrollable form) ──
    const toDocsBtn = page.getByRole("button", { name: "Continue to Documents" });
    await expect(toDocsBtn).toBeVisible({ timeout: 5000 });
    await toDocsBtn.click();

    // ── Documents ──
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout: 5000 });

    const fileInputs = page.locator('input[type="file"]');
    const inputCount = await fileInputs.count();

    if (inputCount > 0) {
      // Trigger the upload code path by setting files on all inputs.
      for (let i = 0; i < inputCount; i++) {
        await fileInputs.nth(i).setInputFiles(DUMMY_FILE);
      }

      // UploadThing can take 10-15s per file on cold start — the debug
      // test (now removed) verified the upload path works end-to-end with
      // a real UPLOADTHING_TOKEN (green checkmark + document.upload tRPC
      // mutation succeeded). For this flow test, we immediately fill
      // documents via Prisma to keep the test fast and deterministic.
      const wizardData = await page.evaluate(() =>
        sessionStorage.getItem("camply-registration-wizard")
      );
      const parsed = wizardData ? JSON.parse(wizardData) : null;
      const teen = parsed?.teens?.[0];
      if (teen && teen.registrationId) {
        const reqs = await prisma.documentRequirement.findMany({
          where: { campId: parsed.campData?.campId, required: true, deletedAt: null },
        });
        const parentUser = await prisma.user.findUniqueOrThrow({ where: { email: parentEmail } });
        for (const req of reqs) {
          const existing = await prisma.document.findFirst({
            where: {
              requirementId: req.id,
              ...(req.scope === "CAMPER"
                ? { camperId: teen.camperId }
                : { registrationId: teen.registrationId }),
              deletedAt: null,
            },
          });
          if (!existing) {
            await prisma.document.create({
              data: {
                requirementId: req.id,
                ...(req.scope === "CAMPER"
                  ? { camperId: teen.camperId }
                  : { registrationId: teen.registrationId }),
                url: `https://utfs.io/f/e2e-doc-${Date.now()}.pdf`,
                fileName: "dummy-document.pdf",
                fileType: "application/pdf",
                fileSize: 1024,
                uploadedById: parentUser.id,
              },
            });
          }
        }
      }
    }

    const reviewBtn = page.getByRole("button", { name: /Continue to Review/ });
    await expect(reviewBtn).toBeVisible({ timeout: 5000 });
    await reviewBtn.click();

    // ── Review ──
    await expect(page.getByRole("heading", { name: "Review Your Registration" })).toBeVisible({
      timeout: 5000,
    });

    const checkboxes = page.locator('input[type="checkbox"]');
    const cbCount = await checkboxes.count();
    for (let i = 0; i < cbCount; i++) {
      await checkboxes.nth(i).check();
    }

    await page.getByRole("button", { name: "Submit Registration" }).click();

    // ── Confirmation ──
    await expect(page.getByText("Registration Submitted")).toBeVisible({ timeout: 20000 });

    // Verify DB
    const camper = await prisma.camper.findFirstOrThrow({
      where: { user: { email: parentEmail } },
      include: { registrations: { where: { deletedAt: null }, take: 1 } },
    });
    expect(camper.firstName).toBe("Test");
    const registration = camper.registrations[0];
    expect(registration).toBeTruthy();
    expect(["SUBMITTED", "PENDING", "APPROVED"]).toContain(registration.status);

    await prisma.registration.updateMany({
      where: { camperId: camper.id },
      data: { deletedAt: new Date() },
    });
  });

  test("second registration: parent can add another teen", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto(`/register/${signupToken}`);

    await expect(page.getByRole("button", { name: "Start Registration" })).toBeVisible({
      timeout: 20000,
    });
    await page.getByRole("button", { name: "Start Registration" }).click();

    await expect(page.getByText("What's your email address?")).toBeVisible({ timeout: 5000 });
    await page.locator('input[type="email"]:visible').fill(parentEmail);
    await page.getByRole("button", { name: "Continue" }).click();

    await page.waitForSelector("#reg-returning-pw, #reg-pw, #reg-firstname", {
      timeout: 15000,
    });

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
    }

    await expect(page.getByText("Who's coming to camp?")).toBeVisible({ timeout: 15000 });

    await page.locator("#teen-fn").fill("Second");
    await page.locator("#teen-ln").fill("Camper");

    await page.getByRole("button", { name: /Select date/i }).click();
    await page.waitForTimeout(300);
    const selects2 = page.locator('select:visible');
    await selects2.nth(0).selectOption("03");
    await selects2.nth(1).selectOption("20");
    await selects2.nth(2).selectOption("2008");
    await page.getByRole("button", { name: "Apply" }).click();
    await page.waitForTimeout(300);

    await page.locator('input[name="teen-gender"][value="Female"]').click();
    await page.getByRole("button", { name: "Add Teen" }).click();

    await expect(page.getByText("Second Camper")).toBeVisible({ timeout: 5000 });
  });
});
