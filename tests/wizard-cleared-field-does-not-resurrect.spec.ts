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
 * Covers the reported bug: src/app/register/[token]/steps/Details.tsx
 * omitted empty field values from the save payload instead of sending them
 * explicitly, so a parent who cleared a wrong entry (e.g. an allergy) saw
 * it blank in the UI while the old value stayed live in the DB — and
 * reappeared on the next load, since the "load" effect reads straight from
 * the server. Fixed by always sending every visible field's current value,
 * including empty ones.
 */
test.describe("Clearing a Details field persists as cleared, not the old value", () => {
  test.describe.configure({ mode: "serial" });

  const parentEmail = `e2e-clearfield-${Date.now()}@camply.test`;
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
        name: `E2E Clear Field Campus ${Date.now()}`,
        slug: `e2e-clear-field-campus-${Date.now()}`,
        address: "1 Clear St",
        city: "Testville",
        country: "Testland",
        organizationId,
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

  async function fillTeenForm(page: Page, firstName: string, lastName: string) {
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
    await page.locator('input[name="teen-gender"][value="Female"]').click();
    await page.getByRole("button", { name: "Add Teen" }).click();
    await expect(page.getByText(`${firstName} ${lastName}`)).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Continue to Registration" }).click();
    await expect(page.getByRole("heading", { name: `${firstName} ${lastName}` })).toBeVisible({ timeout: 10000 });
  }

  test("an allergy entered, saved, then cleared and reloaded stays cleared", async ({ page }) => {
    test.setTimeout(60000);

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
    await fillTeenForm(page, "Ellie", "Peanut");

    // On Details now. Fill in Allergies, save (debounced autosave), confirm
    // it landed server-side.
    const allergyField = page.getByLabel("Allergies");
    await expect(allergyField).toBeVisible({ timeout: 10000 });
    await allergyField.fill("Peanuts");
    await page.waitForTimeout(2500); // clears the 1200ms debounce + mutation round-trip

    const camper = await prisma.camper.findFirstOrThrow({ where: { firstName: "Ellie", lastName: "Peanut" } });
    await expect
      .poll(async () => {
        const fv = await prisma.profileFieldValue.findFirst({
          where: { camperId: camper.id, field: { systemKey: "allergies" } },
        });
        return fv?.value ?? null;
      }, { timeout: 10000 })
      .toBe("Peanuts");

    // Clear it and let the autosave persist the empty value.
    await allergyField.fill("");
    await page.waitForTimeout(2500);

    // Reload the page entirely — the load effect re-fetches from the
    // server fresh, exactly the scenario the bug report described (a
    // parent navigates away and back).
    await page.reload();
    await expect(page.getByRole("heading", { name: "Ellie Peanut" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel("Allergies")).toHaveValue("", { timeout: 10000 });

    const fvAfterReload = await prisma.profileFieldValue.findFirst({
      where: { camperId: camper.id, field: { systemKey: "allergies" } },
    });
    expect(fvAfterReload?.value ?? "").toBe("");
  });
});
