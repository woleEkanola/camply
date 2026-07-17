import { test, expect } from "@playwright/test";
import { randomBytes } from "crypto";
import { prisma, getFixtureOrgContext, deleteCamperByEmail, resetSystemFieldDefaults, loginWithPassword } from "./helpers";

/**
 * Regression coverage for a reported bug: a teen added through Campus B's
 * signup link showed up on the parent dashboard under Campus A instead.
 *
 * Root cause was two-fold:
 *  1. Write: api/auth/signup/route.ts seeded a new Camper's homeCampusId from
 *     the PARENT's own (sticky, set-once) homeCampusId instead of the signup
 *     link actually being used — so a parent's second teen, added via a
 *     different campus's link, inherited the first teen's campus.
 *  2. Read: the dashboard camper card displayed camper.homeCampus.name
 *     instead of the active registration's own campus.
 *
 * This test drives one parent through two different campuses' signup links
 * in the same session and asserts both the DB write and the dashboard read
 * attribute each teen to the correct campus.
 */
test.describe("Camper campus attribution across multiple signup links", () => {
  test.describe.configure({ mode: "serial" });

  const parentEmail = `e2e-campus-attr-${Date.now()}@camply.test`;
  const parentPassword = "password123";
  let signupTokenA: string;
  let signupTokenB: string;
  let campusAId: string;
  let campusBId: string;
  let midAgeYear: number;
  const stamp = Date.now();

  test.beforeAll(async () => {
    const { organizationId, campId } = await getFixtureOrgContext();
    await resetSystemFieldDefaults("CAMPER");
    const camp = await prisma.camp.findUniqueOrThrow({ where: { id: campId } });
    const minAge = camp.minAge ?? 6;
    const maxAge = camp.maxAge ?? 17;
    midAgeYear = new Date().getFullYear() - Math.round((minAge + maxAge) / 2);

    const campusA = await prisma.campus.create({
      data: {
        name: `E2E Attr Campus A ${stamp}`,
        slug: `e2e-attr-campus-a-${stamp}`,
        address: "1 A St",
        city: "Testville",
        country: "Testland",
        organizationId,
        active: true,
        signupOpen: true,
      },
    });
    campusAId = campusA.id;
    const campusB = await prisma.campus.create({
      data: {
        name: `E2E Attr Campus B ${stamp}`,
        slug: `e2e-attr-campus-b-${stamp}`,
        address: "1 B St",
        city: "Testville",
        country: "Testland",
        organizationId,
        active: true,
        signupOpen: true,
      },
    });
    campusBId = campusB.id;

    const tokenA = randomBytes(16).toString("hex");
    await prisma.signupLink.create({ data: { token: tokenA, campusId: campusAId, campId, active: true } });
    signupTokenA = `${campusA.slug}_${camp.slug}`;

    const tokenB = randomBytes(16).toString("hex");
    await prisma.signupLink.create({ data: { token: tokenB, campusId: campusBId, campId, active: true } });
    signupTokenB = `${campusB.slug}_${camp.slug}`;
  });

  test.afterAll(async () => {
    await deleteCamperByEmail(parentEmail);
    await prisma.signupLink.deleteMany({ where: { campusId: { in: [campusAId, campusBId] } } });
    await prisma.campus.deleteMany({ where: { id: { in: [campusAId, campusBId] } } });
  });

  test("a teen added via Campus B's link is attributed to Campus B, not the parent's earlier Campus A", async ({ page }) => {
    test.setTimeout(60000);

    // --- Create the account through Campus A's link (sets parent.homeCampusId = A) ---
    await page.goto(`/register/${signupTokenA}`);
    await page.getByRole("button", { name: "Start Registration" }).click();
    await expect(page.getByText("What's your email address?")).toBeVisible({ timeout: 5000 });
    await page.locator('input[type="email"]:visible').fill(parentEmail);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Welcome!")).toBeVisible({ timeout: 5000 });
    await page.locator("#reg-firstname").fill("Attr");
    await page.locator("#reg-lastname").fill("Parent");
    await page.locator("#reg-pw").fill(parentPassword);
    await page.locator("#reg-pw-confirm").fill(parentPassword);
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page.getByText(/^Welcome/)).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Register a Teen" }).click();
    await expect(page.getByText("Who's coming to camp?")).toBeVisible({ timeout: 10000 });
    await page.locator("#teen-fn").fill("CampusA");
    await page.locator("#teen-ln").fill("Teen");
    await page.getByRole("button", { name: /Select date/i }).click();
    await page.waitForTimeout(300);
    let dobSelects = page.locator("select:visible");
    await dobSelects.nth(0).selectOption("06");
    await dobSelects.nth(1).selectOption("15");
    await dobSelects.nth(2).selectOption(String(midAgeYear));
    await page.getByRole("button", { name: "Apply" }).click();
    await page.waitForTimeout(300);
    await page.locator('input[name="teen-gender"][value="Male"]').click();
    await page.getByRole("button", { name: "Add Teen" }).click();
    await expect(page.getByText("CampusA Teen")).toBeVisible({ timeout: 5000 });

    const camperA = await prisma.camper.findFirstOrThrow({ where: { firstName: "CampusA", lastName: "Teen" } });
    expect(camperA.homeCampusId).toBe(campusAId);

    // --- Same logged-in parent, now via Campus B's link, adds a second teen ---
    await loginWithPassword(page, parentEmail, parentPassword);
    await page.goto(`/register/${signupTokenB}?step=hub`);
    await page.getByRole("button", { name: "Register a Teen" }).click();
    await expect(page.getByText("Who's coming to camp?")).toBeVisible({ timeout: 10000 });
    await page.locator("#teen-fn").fill("CampusB");
    await page.locator("#teen-ln").fill("Teen");
    await page.getByRole("button", { name: /Select date/i }).click();
    await page.waitForTimeout(300);
    dobSelects = page.locator("select:visible");
    await dobSelects.nth(0).selectOption("06");
    await dobSelects.nth(1).selectOption("15");
    await dobSelects.nth(2).selectOption(String(midAgeYear));
    await page.getByRole("button", { name: "Apply" }).click();
    await page.waitForTimeout(300);
    await page.locator('input[name="teen-gender"][value="Female"]').click();
    await page.getByRole("button", { name: "Add Teen" }).click();
    await expect(page.getByText("CampusB Teen")).toBeVisible({ timeout: 5000 });

    // This is the regression this test guards: before the fix, homeCampusId
    // was seeded from the parent's already-set campus (A), not the link (B).
    const camperB = await prisma.camper.findFirstOrThrow({ where: { firstName: "CampusB", lastName: "Teen" } });
    expect(camperB.homeCampusId).toBe(campusBId);

    // --- Dashboard read side: each card must show ITS OWN teen's campus ---
    await page.goto("/dashboard");
    const cardA = page.locator("h3", { hasText: "CampusA Teen" }).locator("xpath=ancestor::div[contains(@class,'sm:justify-between')]");
    await expect(cardA).toBeVisible({ timeout: 10000 });
    await expect(cardA.getByText(`E2E Attr Campus A ${stamp}`)).toBeVisible();
    await expect(cardA.getByText(`E2E Attr Campus B ${stamp}`)).not.toBeVisible();

    const cardB = page.locator("h3", { hasText: "CampusB Teen" }).locator("xpath=ancestor::div[contains(@class,'sm:justify-between')]");
    await expect(cardB).toBeVisible();
    await expect(cardB.getByText(`E2E Attr Campus B ${stamp}`)).toBeVisible();
    await expect(cardB.getByText(`E2E Attr Campus A ${stamp}`)).not.toBeVisible();
  });
});
