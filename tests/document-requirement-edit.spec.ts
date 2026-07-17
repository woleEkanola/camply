import { test, expect, type Locator } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

// DocumentRequirementsEditor's <Input label="..."/> usages pass neither `id`
// nor `name`, so the rendered <label> has no `for`/`id` link to its <input>
// — the repo's own `fieldByLabel` helper (tests/helpers.ts) exists for
// exactly this shape, but it always searches from the page root, which is
// ambiguous here: the always-mounted "Add new requirement" form below shares
// the same field labels as this dialog. Same xpath, scoped to the dialog.
function fieldInDialog(dialog: Locator, labelText: string) {
  return dialog
    .locator("label", { hasText: labelText })
    .locator("xpath=following-sibling::*[1][self::input or self::textarea or self::select] | following-sibling::*[1]//*[self::input or self::textarea or self::select]")
    .first();
}

/**
 * Covers two related reported bugs around required documents:
 *  1. A document upload rejected with "File exceeds maximum upload size of
 *     3MB" even though the admin had configured a 4MB limit for that
 *     requirement — src/lib/compressImage.ts had a fixed 3MB ceiling
 *     ignoring DocumentRequirement.maxSizeMb entirely (see
 *     compressImage.test.ts for coverage of that fix directly).
 *  2. The admin's Required Documents editor (/admin/profile-fields) had no
 *     way to edit an existing requirement's size limit or file types — only
 *     a required/optional toggle and delete. The server's `update` mutation
 *     already accepted these fields; this was a pure UI gap, fixed by adding
 *     an Edit dialog to DocumentRequirementsEditor.tsx.
 */
test.describe("Admin: edit an existing Required Document (size limit, formats)", () => {
  test.describe.configure({ mode: "serial" });

  let requirementId: string;
  const reqName = `E2E Edit Doc ${Date.now()}`;

  test.beforeAll(async () => {
    const { campId } = await getFixtureOrgContext();
    const req = await prisma.documentRequirement.create({
      data: {
        campId,
        name: reqName,
        required: true,
        acceptedFormats: "jpg,png",
        maxSizeMb: 2,
        scope: "CAMPER",
      },
    });
    requirementId = req.id;
  });

  test.afterAll(async () => {
    await prisma.documentRequirement.deleteMany({ where: { id: requirementId } });
  });

  test("owner edits an existing requirement's max size and formats via the new Edit dialog", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/profile-fields");
    await page.getByRole("tab", { name: "Required Documents" }).click();

    const row = page.locator("div.rounded-md.border-neutral-200", { hasText: reqName });
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row.getByText("jpg,png · Up to 2 MB", { exact: false })).toBeVisible();

    await row.getByRole("button", { name: "Edit" }).click();

    // Don't assert the dialog root's own visibility either way — HeadlessUI's
    // fixed-position children collapse the dialog root's bounding box to
    // 0×0 (established pattern in this repo, see campus-quota.spec.ts) —
    // only its contents. Scope field lookups to it since the always-mounted
    // "Add new requirement" form below shares the same field labels.
    const dialog = page.getByRole("dialog");
    const dialogHeading = dialog.getByText("Edit Document Requirement");
    await expect(dialogHeading).toBeVisible({ timeout: 5000 });

    await fieldInDialog(dialog, "Formats").fill("jpg,png,pdf");
    await fieldInDialog(dialog, "Max Size (MB)").fill("5");
    await dialog.getByRole("button", { name: "Save" }).click();

    await expect(dialogHeading).not.toBeVisible({ timeout: 5000 });
    await expect(row.getByText("jpg,png,pdf · Up to 5 MB", { exact: false })).toBeVisible({ timeout: 10000 });

    const updated = await prisma.documentRequirement.findUniqueOrThrow({ where: { id: requirementId } });
    expect(updated.maxSizeMb).toBe(5);
    expect(updated.acceptedFormats).toBe("jpg,png,pdf");
    // Untouched fields must survive a partial edit.
    expect(updated.required).toBe(true);
    expect(updated.scope).toBe("CAMPER");
  });
});
