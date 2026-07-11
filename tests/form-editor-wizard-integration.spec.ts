import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, ensureStaffSignupLink, ensureCamperSignupLink, waitForOtp, deleteStaffByEmail, deleteCamperByEmail, ensureFormFields } from "./helpers";

test.describe("Form Editor changes are reflected live in the wizards", () => {
  test.describe.configure({ mode: "serial" });

  test("hiding a system field removes it from the staff wizard", async ({ page }) => {
    const { organizationId } = await getFixtureOrgContext();
    await ensureFormFields("TEACHER");
    const churchField = await prisma.formField.findFirstOrThrow({
      where: { organizationId, audience: "TEACHER", name: "church" },
    });

    await prisma.formField.update({ where: { id: churchField.id }, data: { visible: false } });
    const email = `e2e-hide-${Date.now()}@camply.test`;
    try {
      const token = await ensureStaffSignupLink("TEACHER");
      await page.goto(`/register/teachers/${token}`);
      await page.getByLabel("Email Address").fill(email);
      await page.getByRole("button", { name: "Send Code" }).click();
      await expect(page.getByLabel("Verification Code")).toBeVisible({ timeout: 10000 });
      const code = await waitForOtp(email);
      await page.getByLabel("Verification Code").fill(code);
      await page.getByRole("button", { name: "Verify" }).click();

      await expect(page.getByText("Personal Information")).toBeVisible({ timeout: 10000 });
      await expect(page.getByText("Church", { exact: true })).not.toBeVisible();
    } finally {
      await prisma.formField.update({ where: { id: churchField.id }, data: { visible: true } });
      await deleteStaffByEmail(email);
    }
  });

  test("a new custom SELECT field renders as a real dropdown with the configured options", async ({ page }) => {
    const { organizationId } = await getFixtureOrgContext();
    const name = `e2e_dropdown_${Date.now()}`;
    const custom = await prisma.formField.create({
      data: {
        organizationId, audience: "TEACHER", source: "CUSTOM", name,
        label: "E2E Dropdown Field", type: "SELECT", required: false, visible: true,
        options: JSON.stringify(["Alpha", "Beta"]), groupLabel: "Personal Information", sortOrder: 999,
      },
    });

    const email = `e2e-dropdown-${Date.now()}@camply.test`;
    try {
      const token = await ensureStaffSignupLink("TEACHER");
      await page.goto(`/register/teachers/${token}`);
      await page.getByLabel("Email Address").fill(email);
      await page.getByRole("button", { name: "Send Code" }).click();
      await expect(page.getByLabel("Verification Code")).toBeVisible({ timeout: 10000 });
      const code = await waitForOtp(email);
      await page.getByLabel("Verification Code").fill(code);
      await page.getByRole("button", { name: "Verify" }).click();

      // Not "Personal Information" text — the custom field's high sortOrder
      // places it in its own trailing section (contiguous-run grouping,
      // see DynamicFieldGroup), so that label would be ambiguous here.
      await expect(page.getByLabel("First Name")).toBeVisible({ timeout: 10000 });
      const select = page.getByLabel("E2E Dropdown Field");
      await expect(select).toBeVisible();
      await expect(select).toHaveJSProperty("tagName", "SELECT");
      await expect(select.locator("option")).toHaveText(["Select…", "Alpha", "Beta"]);
    } finally {
      await prisma.formField.delete({ where: { id: custom.id } });
      await deleteStaffByEmail(email);
    }
  });

  test("a required custom field blocks client-side Continue and is rejected server-side if bypassed", async ({ page }) => {
    const { organizationId } = await getFixtureOrgContext();
    const name = `e2e_required_${Date.now()}`;
    const custom = await prisma.formField.create({
      data: {
        organizationId, audience: "TEACHER", source: "CUSTOM", name,
        label: "E2E Required Field", type: "TEXT", required: true, visible: true,
        groupLabel: "Personal Information", sortOrder: 998,
      },
    });

    const token = await ensureStaffSignupLink("TEACHER");
    const email = `e2e-required-${Date.now()}@camply.test`;

    try {
      await page.goto(`/register/teachers/${token}`);
      await page.getByLabel("Email Address").fill(email);
      await page.getByRole("button", { name: "Send Code" }).click();
      await expect(page.getByLabel("Verification Code")).toBeVisible({ timeout: 10000 });
      const code = await waitForOtp(email);
      await page.getByLabel("Verification Code").fill(code);
      await page.getByRole("button", { name: "Verify" }).click();

      await expect(page.getByLabel("First Name")).toBeVisible({ timeout: 10000 });
      await page.getByLabel("First Name").fill("E2E");
      await page.getByLabel("Last Name").fill("Required");
      await page.getByLabel("Phone Number").fill("+1-555-0700");
      // The new required custom field is left blank — Continue must stay disabled.
      await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();

      // Bypass the UI and hit the API directly to confirm server-side enforcement too.
      const res = await page.request.post("/api/staff/register", {
        data: { token, email, firstName: "E2E", lastName: "Required", phone: "+1-555-0700", fieldValues: [] },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.message).toContain("E2E Required Field");
    } finally {
      await prisma.formField.delete({ where: { id: custom.id } });
      await deleteStaffByEmail(email);
    }
  });

  test("hiding a system field removes it from the camper signup wizard", async ({ page }) => {
    const { organizationId } = await getFixtureOrgContext();
    await ensureFormFields("CAMPER");
    const genderField = await prisma.formField.findFirstOrThrow({
      where: { organizationId, audience: "CAMPER", name: "gender" },
    });

    await prisma.formField.update({ where: { id: genderField.id }, data: { visible: false } });
    const token = await ensureCamperSignupLink();
    const email = `e2e-camper-hide-${Date.now()}@camply.test`;

    try {
      // The signup page renders separate mobile and desktop markup
      // simultaneously (one hidden via CSS per breakpoint), so a plain
      // placeholder locator matches two elements — scope to the visible one.
      await page.goto(`/signup/${token}`);
      await page.locator('input[placeholder="Enter your email"]:visible').fill(email);
      await page.locator('button:visible', { hasText: "Next" }).click();

      await expect(page.getByPlaceholder("Enter OTP code")).toBeVisible({ timeout: 10000 });
      const code = await waitForOtp(email);
      await page.getByPlaceholder("Enter OTP code").fill(code);
      await page.getByRole("button", { name: "Verify OTP" }).click();

      await expect(page.getByText("Camper Information")).toBeVisible({ timeout: 15000 });
      await expect(page.getByText("Gender", { exact: true })).not.toBeVisible();
    } finally {
      await prisma.formField.update({ where: { id: genderField.id }, data: { visible: true } });
      await deleteCamperByEmail(email);
    }
  });
});
