import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

/**
 * Covers the newly-wired position.delete UI on the organogram: creating a
 * role, nesting a child under it, then deleting the parent and confirming
 * the child is promoted up one level (never orphaned, never cascade-deleted)
 * — both in the DOM and via Prisma.
 */
test.describe("Organogram: create, nest, and delete a role", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  const stamp = Date.now();
  const parentName = `E2E Lifecycle Parent ${stamp}`;
  const childName = `E2E Lifecycle Child ${stamp}`;
  let campId: string;
  let parentPositionId: string | undefined;
  let childPositionId: string | undefined;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    campId = ctx.campId;
  });

  test.afterAll(async () => {
    if (childPositionId) await prisma.position.deleteMany({ where: { id: childPositionId } });
    if (parentPositionId) await prisma.position.deleteMany({ where: { id: parentPositionId } });
  });

  test("deleting a parent role promotes its child to the top level", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/camp-structure");
    await page.getByRole("tab", { name: "Organogram" }).click();
    await expect(page.getByTestId("camp-organogram")).toBeVisible({ timeout: 20000 });

    // Create the parent role.
    await page.getByRole("button", { name: "Add top-level role" }).click();
    await page.getByLabel("Position name").fill(parentName);
    await page.getByRole("button", { name: "Create role", exact: true }).click();
    await expect(page.getByText(parentName)).toBeVisible({ timeout: 15000 });

    parentPositionId = (await prisma.position.findFirstOrThrow({ where: { campId, name: parentName, deletedAt: null } })).id;

    // Select it and add a child.
    await page.getByText(parentName).first().click();
    const detailDialog = page.getByTestId("dialog-panel");
    await expect(detailDialog).toBeVisible();
    await detailDialog.getByRole("button", { name: "Add child role" }).click();
    await page.getByLabel("Position name").fill(childName);
    await page.getByRole("button", { name: "Create role", exact: true }).click();
    await expect(page.getByText(childName)).toBeVisible({ timeout: 15000 });

    childPositionId = (await prisma.position.findFirstOrThrow({ where: { campId, name: childName, deletedAt: null } })).id;
    expect((await prisma.position.findUniqueOrThrow({ where: { id: childPositionId } })).parentPositionId).toBe(parentPositionId);

    // Delete the parent — the confirm dialog must state the promotion outcome.
    await page.getByText(parentName).first().click();
    await expect(detailDialog).toBeVisible();
    await detailDialog.getByTestId("organogram-delete-role").click();
    // The just-closed detail dialog and the newly-opened confirm dialog both
    // carry data-testid="dialog-panel" during the leave/enter transition —
    // .last() is the one that just mounted.
    const confirmDialog = page.getByTestId("dialog-panel").last();
    await expect(confirmDialog).toContainText("1 reporting role");
    await confirmDialog.getByTestId("organogram-delete-confirm").click();

    await expect(page.getByText("Role deleted")).toBeVisible({ timeout: 15000 });

    // Child promoted to top-level (its old parent's parent — here, null).
    await expect
      .poll(async () => (await prisma.position.findUniqueOrThrow({ where: { id: childPositionId! } })).parentPositionId, { timeout: 10000 })
      .toBeNull();

    // Parent soft-deleted, child still live and visible in the chart.
    expect((await prisma.position.findUniqueOrThrow({ where: { id: parentPositionId! } })).deletedAt).not.toBeNull();
    await expect(page.getByText(childName)).toBeVisible();
  });
});
