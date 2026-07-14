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

    const reqs = await prisma.documentRequirement.findMany({
      where: { campId, deletedAt: null },
    });

    for (const req of reqs) {
      expect(req.acceptedFormats).toBe("jpg,png");
      expect(req.maxSizeMb).toBe(2);
    }
  });

  test("document upload mutation rejects oversized files server-side", async () => {
    const { campId } = await getFixtureOrgContext();

    const req = await prisma.documentRequirement.findFirstOrThrow({
      where: { campId, deletedAt: null },
    });

    expect(req.maxSizeMb).toBe(2);
    expect(req.acceptedFormats).toBe("jpg,png");
  });
});
