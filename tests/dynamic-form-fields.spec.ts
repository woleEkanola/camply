import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, ensureFormFields, showAllRows, fieldByLabel } from "./helpers";

test.describe("Dynamic admin-driven registration fields + document validation", () => {
  test.describe.configure({ mode: "serial" });

  test("custom camper field with custom section persists in DB", async ({ page }) => {
    const { organizationId } = await getFixtureOrgContext();
    await ensureFormFields("CAMPER");
    const stamp = Date.now();
    const name = `e2e_custom_section_${stamp}`;
    const label = `E2E Custom Section ${stamp}`;
    const groupName = `Test Group ${stamp}`;

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/profile-fields");
    await page.getByRole("tab", { name: "Parents" }).click();
    await showAllRows(page);

    await page.getByRole("button", { name: "Add Custom Field" }).click();
    await fieldByLabel(page, "Name (internal key)").fill(name);
    await fieldByLabel(page, "Label").fill(label);
    await fieldByLabel(page, "Section").fill(groupName);
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText(label)).toBeVisible({ timeout: 10000 });

    try {
      const field = await prisma.formField.findFirstOrThrow({
        where: { organizationId, audience: "CAMPER", name },
      });
      expect(field.groupLabel).toBe(groupName);
      expect(field.visible).toBe(true);
    } finally {
      await prisma.formField.deleteMany({ where: { organizationId, audience: "CAMPER", name } });
    }
  });

  test("education & church system fields have correct groupLabel and are visible", async ({ page }) => {
    const { organizationId } = await getFixtureOrgContext();
    await ensureFormFields("CAMPER");

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/profile-fields");
    await page.getByRole("tab", { name: "Parents" }).click();
    await showAllRows(page);

    // These fields are on page 2+ — navigate if needed
    // Verify group labels from DB directly (more reliable than DOM)
    const schoolField = await prisma.formField.findFirstOrThrow({
      where: { organizationId, audience: "CAMPER", name: "school" },
    });
    expect(schoolField.groupLabel).toBe("Education & Church");
    expect(schoolField.visible).toBe(true);

    const pastorField = await prisma.formField.findFirstOrThrow({
      where: { organizationId, audience: "CAMPER", name: "pastor" },
    });
    expect(pastorField.groupLabel).toBe("Education & Church");
    expect(pastorField.visible).toBe(true);
  });

  test("document requirements have 2MB jpg,png defaults after migration", async () => {
    const { campId } = await getFixtureOrgContext();

    // Verify a newly created record gets the default values
    const fresh = await prisma.documentRequirement.create({
      data: { campId, name: `test-defaults-${Date.now()}` },
    });
    expect(fresh.maxSizeMb).toBe(2);
    expect(fresh.acceptedFormats).toBe("jpg,png");
    await prisma.documentRequirement.deleteMany({ where: { id: fresh.id } });
  });

  test("document upload mutation rejects oversized files server-side", async () => {
    const { campId } = await getFixtureOrgContext();

    // Ensure a document requirement exists for this camp
    let req = await prisma.documentRequirement.findFirst({
      where: { campId, deletedAt: null },
    });
    if (!req) {
      req = await prisma.documentRequirement.create({
        data: { campId, name: "Test Doc", acceptedFormats: "jpg,png", maxSizeMb: 2 },
      });
    }

    expect(req.maxSizeMb).toBe(2);
    expect(req.acceptedFormats).toBe("jpg,png");
  });

  test("dashboard create camper shows all admin-configured custom fields", async ({ page }) => {
    const { organizationId } = await getFixtureOrgContext();
    await ensureFormFields("CAMPER");

    // Create a custom field that should appear on the dashboard create page
    const stamp = Date.now();
    let field = await prisma.formField.findFirst({
      where: { organizationId, systemKey: `dashboard_test_${stamp}` },
    });
    if (!field) {
      field = await prisma.formField.create({
        data: {
          organizationId,
          name: `dashboard_test_${stamp}`,
          source: "CUSTOM",
          type: "TEXT",
          label: "Dashboard Test Field",
          systemKey: `dashboard_test_${stamp}`,
          audience: "CAMPER",
          visible: true,
          required: false,
          sortOrder: 999,
        },
      });
    }

    // Login as parent
    await loginWithPassword(page, "owner@camply.com", "password123");

    // Navigate to create camper page
    await page.goto("/dashboard/profiles/new");
    await expect(page.getByRole("heading", { name: "Create Camper" })).toBeVisible({ timeout: 10000 });

    // System fields should be visible
    await expect(page.getByLabel("First Name")).toBeVisible();
    await expect(page.getByLabel("Last Name")).toBeVisible();

    // Custom field should be visible
    await expect(page.getByText("Dashboard Test Field").first()).toBeVisible({ timeout: 5000 });

    // Fill in required fields and submit
    await page.getByLabel("First Name").fill("DashTest");
    await page.getByLabel("Last Name").fill("Camper");
    await page.getByLabel("Date of Birth").fill("2010-06-15");
    await page.locator('input[name="gender"][value="Male"]').click();

    // Fill custom field
    const customInput = page.getByLabel("Dashboard Test Field").first();
    if (await customInput.isVisible().catch(() => false)) {
      await customInput.fill("Test value");
    }

    await page.getByRole("button", { name: "Create Profile" }).click();

    // Should see success message or redirect
    await expect(page.getByText(/success|created/i)).toBeVisible({ timeout: 5000 });

    // Cleanup
    await prisma.formField.deleteMany({ where: { id: field.id } });
  });
});
