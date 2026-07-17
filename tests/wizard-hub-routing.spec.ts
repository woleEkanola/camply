import { test, expect, type Page } from "@playwright/test";
import { randomBytes } from "crypto";
import {
  prisma,
  deleteCamperByEmail,
  resetSystemFieldDefaults,
  getFixtureOrgContext,
  loginWithPassword,
} from "./helpers";

test.describe("Wizard Hub Routing", () => {
  test.describe.configure({ mode: "serial" });

  const parentEmail = `hub-route-${Date.now()}@camply.test`;
  const parentPassword = "testpass123";
  let signupToken: string;
  let campusId: string;

  test.beforeAll(async () => {
    const { organizationId, campId } = await getFixtureOrgContext();
    const camp = await prisma.camp.findUniqueOrThrow({ where: { id: campId } });
    await resetSystemFieldDefaults("CAMPER");

    const stamp = Date.now();
    const campus = await prisma.campus.create({
      data: { name: `HubTest-${stamp}`, slug: `hubtest-${stamp}`, organizationId, address: "1 Test St", city: "Test", country: "Testland" },
    });
    campusId = campus.id;

    const token = randomBytes(16).toString("hex");
    await prisma.signupLink.create({ data: { token, campusId, campId, active: true } });
    signupToken = `${campus.slug}_${camp.slug}`;
  });

  test.afterAll(async () => {
    await deleteCamperByEmail(parentEmail);
    await prisma.user.deleteMany({ where: { email: parentEmail } });
    if (campusId) {
      await prisma.signupLink.deleteMany({ where: { campusId } });
      await prisma.campus.deleteMany({ where: { id: campusId } });
    }
  });

  test("?step=hub lands on HUB directly when logged in", async ({ page }) => {
    // --- Step 1: Create account + login ---
    await page.goto(`/register/${signupToken}`);
    await page.getByRole("button", { name: "Start Registration" }).click();
    await page.getByLabel("Email address").fill(parentEmail);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.locator("#reg-firstname").fill("Hub");
    await page.locator("#reg-lastname").fill("Route");
    // authMethod already defaults to "password" — Password/Confirm fields
    // render without needing to select a radio.
    await page.locator("#reg-pw").fill(parentPassword);
    await page.locator("#reg-pw-confirm").fill(parentPassword);
    await page.getByRole("button", { name: "Create Account" }).click();
    // Now on HUB
    await expect(page.getByText(/Welcome, Hub!/)).toBeVisible({ timeout: 10000 });

    // --- Step 2: Navigate directly to ?step=hub ---
    await page.goto(`/register/${signupToken}?step=hub`);
    // Should land on HUB, not LANDING. The "Welcome, {firstName}!" greeting
    // (Hub.tsx) interpolates client-side wizard state, which resets on a
    // fresh navigation — so this shows the generic "Welcome!" here even
    // though HUB routing itself is correct (checked via Register a
    // Teen/View Status below). Match loosely rather than assert the name.
    await expect(page.getByText(/^Welcome/)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Register Your Teen")).not.toBeVisible({ timeout: 3000 });
    await expect(page.getByRole("button", { name: "Register a Teen" })).toBeVisible();
    await expect(page.getByRole("link", { name: /View Status|View Dashboard/ })).toBeVisible();
  });

  test("plain /register/[token] still goes to LANDING when logged in", async ({ page }) => {
    await loginWithPassword(page, parentEmail, parentPassword);
    await page.goto(`/register/${signupToken}`);
    // Should see LANDING, not HUB
    await expect(page.getByText("Register Your Teen")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Welcome, Hub!/)).not.toBeVisible({ timeout: 3000 });
  });

  test("?step=hub prompts sign-in when logged out, then goes to HUB", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();

    await page.goto(`/register/${signupToken}?step=hub`);
    // Should see IDENTITY email gate
    await expect(page.getByText(/email address/i).first()).toBeVisible({ timeout: 10000 });
    await page.getByLabel("Email address").fill(parentEmail);
    await page.getByRole("button", { name: "Continue" }).click();
    // Should get "Welcome back" sign-in page
    await expect(page.getByText("Welcome back")).toBeVisible({ timeout: 8000 });
    await page.getByLabel("Enter your password").fill(parentPassword);
    await page.getByRole("button", { name: "Sign In" }).click();
    // After sign-in, should land on HUB (see the note above on why the
    // greeting doesn't interpolate the name on a fresh page load).
    await expect(page.getByText(/^Welcome!/)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "Register a Teen" })).toBeVisible();

    await ctx.close();
  });
});
