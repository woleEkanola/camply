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
 * Covers the reported bug: a phone field (e.g. Emergency Contact Phone)
 * accepted a single digit "0" as a complete value with no validation error.
 * Phone fields now render with an immutable "+234" prefix beside an
 * 11-digit local-number box (src/components/ui/PhoneInput.tsx, wired in via
 * src/components/forms/DynamicFieldRenderer.tsx's TEXT case), and Details.tsx
 * blocks Next until any non-empty phone field is a complete 11-digit number
 * — stored normalized as "+234XXXXXXXXXX" (src/lib/phone.ts).
 */
test.describe("Wizard: Nigerian phone field validation", () => {
  test.describe.configure({ mode: "serial" });

  const parentEmail = `e2e-phone-validation-${Date.now()}@camply.test`;
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
        name: `E2E Phone Campus ${stamp}`,
        slug: `e2e-phone-campus-${stamp}`,
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
      await prisma.signupLink.deleteMany({ where: { campusId } });
      await prisma.campus.deleteMany({ where: { id: campusId } });
    }
  });

  test("an incomplete phone number blocks Next with an inline error; a complete one saves normalized to +234 form", async ({ page }) => {
    test.setTimeout(60000);

    await page.goto(`/register/${signupToken}`);
    await page.getByRole("button", { name: "Start Registration" }).click();
    await expect(page.getByText("What's your email address?")).toBeVisible({ timeout: 10000 });
    await page.locator('input[type="email"]:visible').fill(parentEmail);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Welcome!")).toBeVisible({ timeout: 5000 });
    await page.locator("#reg-firstname").fill("Phone");
    await page.locator("#reg-lastname").fill("Parent");
    await page.locator("#reg-pw").fill(parentPassword);
    await page.locator("#reg-pw-confirm").fill(parentPassword);
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page.getByText(/^Welcome/)).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Register a Teen" }).click();
    await expect(page.getByText("Who's coming to camp?")).toBeVisible({ timeout: 10000 });
    await page.locator("#teen-fn").fill("Phone");
    await page.locator("#teen-ln").fill("Teen");
    await page.getByRole("button", { name: /Select date/i }).click();
    await page.waitForTimeout(300);
    const dobSelects = page.locator("select:visible");
    await dobSelects.nth(0).selectOption("06");
    await dobSelects.nth(1).selectOption("15");
    await dobSelects.nth(2).selectOption(String(midAgeYear));
    await page.getByRole("button", { name: "Apply" }).click();
    await page.waitForTimeout(300);
    await page.locator('input[name="teen-gender"][value="Male"]').click();
    await page.getByRole("button", { name: "Add Teen" }).click();
    await expect(page.getByText("Phone Teen")).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Continue to Registration" }).click();
    await expect(page.getByRole("heading", { name: "Phone Teen" })).toBeVisible({ timeout: 10000 });

    // The immutable country-code prefix is visible beside the phone field.
    // (Other phone fields — Parent/Guardian Phone, Teen Phone Number — are
    // also visible by default and each render their own "+234" chip, so
    // scope to this specific input's sibling rather than a page-wide text
    // search, which would hit a strict-mode multiple-match violation.)
    const phoneInput = page.getByLabel("Emergency Contact Phone", { exact: true });
    await expect(phoneInput).toBeVisible({ timeout: 10000 });
    await expect(phoneInput.locator("xpath=preceding-sibling::span[1]")).toHaveText("+234");

    // Exactly the reported bug: a single digit must NOT pass as complete.
    await phoneInput.fill("0");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByText("Emergency Contact Phone must be a complete 11-digit Nigerian number")).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("heading", { name: "Documents" })).not.toBeVisible();

    // A complete 11-digit local number clears the error and advances.
    await phoneInput.fill("08020996939");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout: 10000 });

    const camper = await prisma.camper.findFirstOrThrow({ where: { firstName: "Phone", lastName: "Teen" } });
    expect(camper.emergencyContactPhone).toBe("+2348020996939");
  });
});
