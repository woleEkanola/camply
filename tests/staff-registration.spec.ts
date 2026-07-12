import { test, expect } from "@playwright/test";
import { ensureStaffSignupLink, waitForOtp, prisma, deleteStaffByEmail, resetSystemFieldDefaults } from "./helpers";

test.describe("Staff self-registration", () => {
  // Realign the shared fixture org's SYSTEM fields to registry defaults so
  // accumulated Form Editor drift (e.g. photoUrl left visible) doesn't split
  // section headers and break these data-driven wizard assertions.
  test.beforeAll(async () => {
    await resetSystemFieldDefaults("TEACHER");
    await resetSystemFieldDefaults("VOLUNTEER");
  });

  test("teacher can self-register through the data-driven wizard and lands in Pending review", async ({ page }) => {
    const email = `e2e-teacher-${Date.now()}@camply.test`;
    try {
      const token = await ensureStaffSignupLink("TEACHER");
      await page.goto(`/register/teachers/${token}`);
      await expect(page.getByRole("heading", { name: "Teacher Registration" })).toBeVisible();

      // Email step — the confirmation email never actually sends locally
      // (no RESEND_API_KEY), so read the code straight from the DB.
      await page.getByLabel("Email Address").fill(email);
      await page.getByRole("button", { name: "Send Code" }).click();

      await expect(page.getByLabel("Verification Code")).toBeVisible({ timeout: 10000 });
      const code = await waitForOtp(email);
      await page.getByLabel("Verification Code").fill(code);
      await page.getByRole("button", { name: "Verify" }).click();

      // Single data-driven "fields" step — system + custom fields interleaved
      // by admin-configured order, grouped under section headers.
      await expect(page.getByText("Personal Information")).toBeVisible({ timeout: 10000 });
      await page.getByLabel("First Name").fill("E2E");
      await page.getByLabel("Last Name").fill("Teacher");
      await page.getByLabel("Phone Number").fill("+1-555-0100");
      await page.getByRole("button", { name: "Teaching", exact: true }).click();
      await page.getByRole("button", { name: "Continue" }).click();

      await expect(page.getByText("Review & Submit")).toBeVisible();
      await page.getByRole("button", { name: "Submit Registration" }).click();

      await expect(page.getByText("Registration submitted")).toBeVisible({ timeout: 10000 });

      const profile = await prisma.staffProfile.findFirst({ where: { email } });
      expect(profile?.status).toBe("PENDING");
      expect(profile?.firstName).toBe("E2E");
      expect(profile?.type).toBe("TEACHER");
      expect(profile?.skills).toContain("Teaching");
    } finally {
      await deleteStaffByEmail(email);
    }
  });

  test("volunteer must pick a category before submitting", async ({ page }) => {
    const email = `e2e-volunteer-${Date.now()}@camply.test`;
    try {
      const token = await ensureStaffSignupLink("VOLUNTEER");
      await page.goto(`/register/volunteers/${token}`);
      await expect(page.getByRole("heading", { name: "Volunteer Registration" })).toBeVisible();

      await page.getByLabel("Email Address").fill(email);
      await page.getByRole("button", { name: "Send Code" }).click();

      await expect(page.getByLabel("Verification Code")).toBeVisible({ timeout: 10000 });
      const code = await waitForOtp(email);
      await page.getByLabel("Verification Code").fill(code);
      await page.getByRole("button", { name: "Verify" }).click();

      await expect(page.getByText("Personal Information")).toBeVisible({ timeout: 10000 });
      await page.getByLabel("First Name").fill("E2E");
      await page.getByLabel("Last Name").fill("Volunteer");
      await page.getByLabel("Phone Number").fill("+1-555-0200");
      await page.getByLabel("Volunteer Category").selectOption("Kitchen");
      await page.getByRole("button", { name: "Continue" }).click();

      await expect(page.getByText("Review & Submit")).toBeVisible();
      await expect(page.getByText("Department:")).toBeVisible();
      await expect(page.getByText("Kitchen")).toBeVisible();
      await page.getByRole("button", { name: "Submit Registration" }).click();

      await expect(page.getByText("Registration submitted")).toBeVisible({ timeout: 10000 });

      const profile = await prisma.staffProfile.findFirst({ where: { email } });
      expect(profile?.status).toBe("PENDING");
      expect(profile?.type).toBe("VOLUNTEER");
      expect(profile?.volunteerCategory).toBe("Kitchen");
    } finally {
      await deleteStaffByEmail(email);
    }
  });
});
