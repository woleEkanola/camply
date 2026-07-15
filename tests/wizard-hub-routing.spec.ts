import { test, expect, type Page } from "@playwright/test";
import { randomBytes } from "crypto";
import {
  prisma,
  deleteCamperByEmail,
  resetSystemFieldDefaults,
  relaxRequiredCustomFields,
  restoreRequiredCustomFields,
  loginWithPassword,
} from "./helpers";

test.describe("Wizard Hub Routing", () => {
  test.describe.configure({ mode: "serial" });

  const parentEmail = `hub-route-${Date.now()}@camply.test`;
  const parentPassword = "testpass123";
  let signupToken: string;
  let campusId: string;

  test.beforeAll(async () => {
    const testUser = await prisma.user.findFirstOrThrow({ where: { role: { in: ["OWNER", "ADMIN"] } } });
    const org = await prisma.organization.findFirstOrThrow({ where: { id: testUser.organizationId! } });
    const camp = await prisma.camp.findFirstOrThrow({ where: { organizationId: org.id } });
    const { organizationId, campId } = { organizationId: org.id, campId: camp.id };
    await resetSystemFieldDefaults("CAMPER");

    const campus = await (prisma as any).campus.create({
      data: { name: `HubTest-${Date.now()}`, organizationId, city: "Test" },
    });
    campusId = campus.id;

    const token = randomBytes(16).toString("hex");
    await prisma.signupLink.create({ data: { token, campusId, campId: camp.id, active: true } });
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
    await page.getByLabel("Email address").fill(parentEmail);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("First Name").fill("Hub");
    await page.getByLabel("Last Name").fill("Route");
    await page.locator('input[value="password"]').click();
    await page.getByLabel("Password").fill(parentPassword);
    await page.getByLabel("Confirm Password").fill(parentPassword);
    await page.getByRole("button", { name: "Create Account" }).click();
    // Now on HUB
    await expect(page.getByText(/Welcome, Parent!/)).toBeVisible({ timeout: 10000 });

    // --- Step 2: Navigate directly to ?step=hub ---
    await page.goto(`/register/${signupToken}?step=hub`);
    // Should land on HUB, not LANDING
    await expect(page.getByText(/Welcome, Parent!/)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Register Your Teen")).not.toBeVisible({ timeout: 3000 });
    await expect(page.getByRole("button", { name: "Register a Teen" })).toBeVisible();
    await expect(page.getByRole("link", { name: /View Status|View Dashboard/ })).toBeVisible();
  });

  test("plain /register/[token] still goes to LANDING when logged in", async ({ page }) => {
    await loginWithPassword(page, parentEmail, parentPassword);
    await page.goto(`/register/${signupToken}`);
    // Should see LANDING, not HUB
    await expect(page.getByText("Register Your Teen")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Welcome, Parent!/)).not.toBeVisible({ timeout: 3000 });
  });

  test("?step=hub prompts sign-in when logged out, then goes to HUB", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();

    await page.goto(`/register/${signupToken}?step=hub`);
    // Should see IDENTITY email gate
    await expect(page.getByText(/email address/i)).toBeVisible({ timeout: 10000 });
    await page.getByLabel("Email address").fill(parentEmail);
    await page.getByRole("button", { name: "Continue" }).click();
    // Should get "Welcome back" sign-in page
    await expect(page.getByText("Welcome back")).toBeVisible({ timeout: 8000 });
    await page.getByLabel("Enter your password").fill(parentPassword);
    await page.getByRole("button", { name: "Sign In" }).click();
    // After sign-in, should land on HUB
    await expect(page.getByText(/Welcome, Parent!/)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "Register a Teen" })).toBeVisible();

    await ctx.close();
  });
});
