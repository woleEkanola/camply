import { test, expect } from "@playwright/test";
import { ensureStaffSignupLink, waitForOtp, fieldByLabel, prisma, deleteStaffByEmail } from "./helpers";

test.describe("Staff self-registration", () => {
  test("teacher can self-register through the full wizard and lands in Pending review", async ({ page }) => {
    const email = `e2e-teacher-${Date.now()}@camply.test`;
    try {
      const token = await ensureStaffSignupLink("TEACHER");
      await page.goto(`/register/teachers/${token}`);
      await expect(page.getByRole("heading", { name: "Teacher Registration" })).toBeVisible();

      // Email step — creates the User row and an OTP, but the confirmation
      // email never actually sends locally (no RESEND_API_KEY), so read the
      // code straight from the DB rather than an inbox.
      await fieldByLabel(page, "Email Address").fill(email);
      await page.getByRole("button", { name: "Send Code" }).click();

      await expect(fieldByLabel(page, "Verification Code")).toBeVisible({ timeout: 10000 });
      const code = await waitForOtp(email);
      await fieldByLabel(page, "Verification Code").fill(code);
      await page.getByRole("button", { name: "Verify" }).click();

      // Personal — first/last name + phone are required to advance.
      await expect(page.getByText("Personal Information")).toBeVisible({ timeout: 10000 });
      await fieldByLabel(page, "First Name").fill("E2E");
      await fieldByLabel(page, "Last Name").fill("Teacher");
      await fieldByLabel(page, "Phone Number").fill("+1-555-0100");
      await page.getByRole("button", { name: "Continue" }).click();

      // Church — everything optional, just advance.
      await expect(page.getByText("Church Information")).toBeVisible();
      await page.getByRole("button", { name: "Continue" }).click();

      // Camp Information (teacher-only copy) — optional fields.
      await expect(page.getByText("Camp Information")).toBeVisible();
      await page.getByRole("button", { name: "Continue" }).click();

      // Skills & Availability — pick a skill chip to prove multi-select persists.
      await expect(page.getByText("Skills & Availability")).toBeVisible();
      await page.getByRole("button", { name: "Teaching", exact: true }).click();
      await page.getByRole("button", { name: "Continue" }).click();

      // Emergency & Medical — optional.
      await expect(page.getByText("Emergency & Medical")).toBeVisible();
      await page.getByRole("button", { name: "Continue" }).click();

      // Custom org-defined questions only render if the org configured any.
      if (await page.getByText("A Few More Questions").isVisible().catch(() => false)) {
        await page.getByRole("button", { name: "Continue" }).click();
      }

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

  test("volunteer must pick a department to proceed past Volunteer Details", async ({ page }) => {
    const email = `e2e-volunteer-${Date.now()}@camply.test`;
    try {
      const token = await ensureStaffSignupLink("VOLUNTEER");
      await page.goto(`/register/volunteers/${token}`);
      await expect(page.getByRole("heading", { name: "Volunteer Registration" })).toBeVisible();

      await fieldByLabel(page, "Email Address").fill(email);
      await page.getByRole("button", { name: "Send Code" }).click();

      await expect(fieldByLabel(page, "Verification Code")).toBeVisible({ timeout: 10000 });
      const code = await waitForOtp(email);
      await fieldByLabel(page, "Verification Code").fill(code);
      await page.getByRole("button", { name: "Verify" }).click();

      await expect(page.getByText("Personal Information")).toBeVisible({ timeout: 10000 });
      await fieldByLabel(page, "First Name").fill("E2E");
      await fieldByLabel(page, "Last Name").fill("Volunteer");
      await fieldByLabel(page, "Phone Number").fill("+1-555-0200");
      await page.getByRole("button", { name: "Continue" }).click();

      await expect(page.getByText("Church Information")).toBeVisible();
      await page.getByRole("button", { name: "Continue" }).click();

      await expect(page.getByText("Volunteer Details")).toBeVisible();
      await fieldByLabel(page, "Volunteer Category").selectOption("Kitchen");
      await page.getByRole("button", { name: "Continue" }).click();

      await expect(page.getByText("Skills & Availability")).toBeVisible();
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(page.getByText("Emergency & Medical")).toBeVisible();
      await page.getByRole("button", { name: "Continue" }).click();
      if (await page.getByText("A Few More Questions").isVisible().catch(() => false)) {
        await page.getByRole("button", { name: "Continue" }).click();
      }

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
