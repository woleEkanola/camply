import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, fieldByLabel, ensureFormFields, showAllRows } from "./helpers";

test.describe("Form Editor (admin)", () => {
  test.describe.configure({ mode: "serial" });

  test("admin can create, edit, and delete a custom field", async ({ page }) => {
    const { organizationId } = await getFixtureOrgContext();
    await ensureFormFields("VOLUNTEER");
    const stamp = Date.now();
    const name = `e2e_note_${stamp}`;
    const label = `E2E Note ${stamp}`;
    const updatedLabel = `E2E Note ${stamp} Updated`;

    try {
      await loginWithPassword(page, "owner@camply.com", "password123");
      await page.goto("/admin/profile-fields");
      await page.getByRole("tab", { name: "Volunteers" }).click();
      await showAllRows(page);

      await page.getByRole("button", { name: "Add Custom Field" }).click();
      await fieldByLabel(page, "Name (internal key)").fill(name);
      await fieldByLabel(page, "Label").fill(label);
      await page.getByRole("button", { name: "Create" }).click();

      await expect(page.getByText(label)).toBeVisible({ timeout: 10000 });

      // Edit
      await page.getByText(label).locator("xpath=ancestor::tr[1]").getByRole("button", { name: "Edit" }).click();
      await fieldByLabel(page, "Label").fill(updatedLabel);
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText(updatedLabel)).toBeVisible({ timeout: 10000 });

      // Delete
      await page.getByText(updatedLabel).locator("xpath=ancestor::tr[1]").getByRole("button", { name: "Delete" }).click();
      await expect(page.getByText(updatedLabel)).not.toBeVisible({ timeout: 10000 });

      const deleted = await prisma.formField.findFirstOrThrow({
        where: { organizationId, audience: "VOLUNTEER", name },
      });
      expect(deleted.deletedAt).not.toBeNull();
    } finally {
      await prisma.formField.deleteMany({ where: { organizationId, audience: "VOLUNTEER", name } });
    }
  });

  test("admin can reorder custom fields with the up/down buttons", async ({ page }) => {
    const { organizationId } = await getFixtureOrgContext();
    await ensureFormFields("VOLUNTEER");
    const nameA = `e2e_order_a_${Date.now()}`;
    const nameB = `e2e_order_b_${Date.now()}`;

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/profile-fields");
    await page.getByRole("tab", { name: "Volunteers" }).click();
    await showAllRows(page);

    for (const [name, label] of [[nameA, "E2E Order A"], [nameB, "E2E Order B"]]) {
      await page.getByRole("button", { name: "Add Custom Field" }).click();
      await fieldByLabel(page, "Name (internal key)").fill(name);
      await fieldByLabel(page, "Label").fill(label);
      await page.getByRole("button", { name: "Create" }).click();
      await expect(page.getByText(label)).toBeVisible({ timeout: 10000 });
    }

    try {
      const before = await prisma.formField.findMany({
        where: { organizationId, audience: "VOLUNTEER", name: { in: [nameA, nameB] } },
      });
      const a = before.find((f) => f.name === nameA)!;
      const b = before.find((f) => f.name === nameB)!;
      expect(a.sortOrder).toBeLessThan(b.sortOrder);

      // Move A down once — should swap past B.
      await page.getByText("E2E Order A").locator("xpath=ancestor::tr[1]").getByRole("button", { name: "Move down" }).click();

      await expect
        .poll(async () => {
          const after = await prisma.formField.findMany({
            where: { organizationId, audience: "VOLUNTEER", name: { in: [nameA, nameB] } },
          });
          const newA = after.find((f) => f.name === nameA)!;
          const newB = after.find((f) => f.name === nameB)!;
          return newA.sortOrder > newB.sortOrder;
        }, { timeout: 10000 })
        .toBe(true);
    } finally {
      await prisma.formField.deleteMany({ where: { organizationId, audience: "VOLUNTEER", name: { in: [nameA, nameB] } } });
    }
  });

  test("deleting a custom field with submitted answers is blocked", async ({ page }) => {
    const { organizationId, campId } = await getFixtureOrgContext();
    await ensureFormFields("VOLUNTEER");
    const name = `e2e_inuse_${Date.now()}`;
    const email = `e2e-inuse-${Date.now()}@camply.test`;

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/profile-fields");
    await page.getByRole("tab", { name: "Volunteers" }).click();
    await showAllRows(page);

    await page.getByRole("button", { name: "Add Custom Field" }).click();
    await fieldByLabel(page, "Name (internal key)").fill(name);
    await fieldByLabel(page, "Label").fill("E2E In Use");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByText("E2E In Use")).toBeVisible({ timeout: 10000 });

    const field = await prisma.formField.findFirstOrThrow({
      where: { organizationId, audience: "VOLUNTEER", name },
    });

    const user = await prisma.user.create({
      data: { email, password: "placeholder-not-used-for-login", role: "VOLUNTEER", organizationId },
    });
    const staffProfile = await prisma.staffProfile.create({
      data: { userId: user.id, organizationId, campId, type: "VOLUNTEER", status: "PENDING", firstName: "E2E", lastName: "InUse", phone: "+1-555-0900", email },
    });
    await prisma.staffFieldValue.create({ data: { fieldId: field.id, staffProfileId: staffProfile.id, value: "some answer" } });

    try {
      await page.getByText("E2E In Use").locator("xpath=ancestor::tr[1]").getByRole("button", { name: "Delete" }).click();
      await expect(page.getByText(/already has submitted answers/i)).toBeVisible({ timeout: 10000 });

      const stillExists = await prisma.formField.findUnique({ where: { id: field.id } });
      expect(stillExists).not.toBeNull();
    } finally {
      await prisma.staffFieldValue.deleteMany({ where: { fieldId: field.id } });
      await prisma.staffProfile.deleteMany({ where: { id: staffProfile.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
      await prisma.formField.deleteMany({ where: { id: field.id } });
    }
  });

  test("system fields have no Delete button, and their required flag is editable", async ({ page }) => {
    const { organizationId } = await getFixtureOrgContext();
    await ensureFormFields("VOLUNTEER");

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/profile-fields");
    await page.getByRole("tab", { name: "Volunteers" }).click();
    await showAllRows(page);

    await expect(page.getByText("Church", { exact: true })).toBeVisible({ timeout: 10000 });
    const churchRow = page.getByText("Church", { exact: true }).locator("xpath=ancestor::tr[1]");
    await expect(churchRow.getByRole("button", { name: "Delete" })).toHaveCount(0);

    const original = await prisma.formField.findFirstOrThrow({
      where: { organizationId, audience: "VOLUNTEER", name: "church" },
    });

    try {
      // Plain .click() rather than .check() — the checkbox isn't optimistically
      // updated, so its DOM state briefly lags the mutation; poll the DB below
      // for the eventually-consistent result instead of asserting DOM state.
      await churchRow.locator('input[type="checkbox"]').first().click();
      await expect
        .poll(async () => {
          const updated = await prisma.formField.findUniqueOrThrow({ where: { id: original.id } });
          return updated.required;
        }, { timeout: 10000 })
        .toBe(true);
    } finally {
      await prisma.formField.update({ where: { id: original.id }, data: { required: original.required } });
    }
  });

  test("admin can edit a system field's dropdown options", async ({ page }) => {
    const { organizationId } = await getFixtureOrgContext();
    await ensureFormFields("VOLUNTEER");

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/profile-fields");
    await page.getByRole("tab", { name: "Volunteers" }).click();
    await showAllRows(page);

    const original = await prisma.formField.findFirstOrThrow({
      where: { organizationId, audience: "VOLUNTEER", name: "volunteerCategory" },
    });

    try {
      await expect(page.getByText("Volunteer Category", { exact: true })).toBeVisible({ timeout: 10000 });
      await page.getByText("Volunteer Category", { exact: true }).locator("xpath=ancestor::tr[1]").getByRole("button", { name: "Edit" }).click();
      await fieldByLabel(page, "Options (comma separated)").fill("Registration, Medical, Kitchen, E2E New Category");
      await page.getByRole("button", { name: "Save" }).click();

      await expect
        .poll(async () => {
          const updated = await prisma.formField.findUniqueOrThrow({ where: { id: original.id } });
          return updated.options ?? "";
        }, { timeout: 10000 })
        .toContain("E2E New Category");
    } finally {
      await prisma.formField.update({ where: { id: original.id }, data: { options: original.options } });
    }
  });
});
