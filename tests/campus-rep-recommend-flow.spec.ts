import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

/**
 * Campus-rep registrations queue (RegistrationQueue) in a TWO_STEP org:
 * - defaults a reviewer straight into "Pending" (submitted, not yet recommended);
 * - once a reg is recommended (endorsed) it leaves the Pending list and its action
 *   becomes a disabled "Awaiting Approval" marker with a "Recommended" badge;
 * - duplicate registrations surface with a "Duplicates" filter + a "Duplicate" badge,
 *   at parity with the admin registrations page.
 */
test.describe("Campus-rep recommend flow + filters + duplicates", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ viewport: { width: 1280, height: 900 } });

  const stamp = Date.now();
  const repEmail = `e2e-reprec-rep-${stamp}@camply.test`;

  let organizationId: string;
  let campId: string;
  let campusId: string;
  let originalApprovalWorkflow: string;
  let repId: string;
  const parentIds: string[] = [];
  const camperIds: string[] = [];

  const targetName = `E2E Reprec Target ${stamp}`;
  const drawerTargetName = `E2E Reprec Drawer ${stamp}`;
  const dupName = `E2E Reprec Dup ${stamp}`;
  const dupDob = new Date(2012, 3, 4);

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    originalApprovalWorkflow = org.approvalWorkflow;
    await prisma.organization.update({ where: { id: organizationId }, data: { approvalWorkflow: "TWO_STEP" } });

    const campus = await prisma.campus.create({
      data: { name: `E2E Reprec Campus ${stamp}`, slug: `e2e-reprec-campus-${stamp}`, address: "1 Test St", city: "Testville", country: "Testland", organizationId },
    });
    campusId = campus.id;

    const password = await bcrypt.hash("password123", 10);
    const rep = await prisma.user.create({
      data: { email: repEmail, password, role: "CAMPUS_REPRESENTATIVE", organizationId, managedCampuses: { connect: { id: campusId } } },
    });
    repId = rep.id;

    async function makePending(name: string, dob?: Date) {
      const parent = await prisma.user.create({ data: { email: `e2e-reprec-parent-${parentIds.length}-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId } });
      parentIds.push(parent.id);
      const camper = await prisma.camper.create({
        data: { name, dateOfBirth: dob, userId: parent.id, organizationId, homeCampusId: campusId },
      });
      camperIds.push(camper.id);
      const reg = await prisma.registration.create({ data: { camperId: camper.id, campId, campusId, status: "PENDING" } });
      return reg.id;
    }

    // Recommend target (unique — not a duplicate).
    await makePending(targetName);
    // Separate target opened via the drawer (RegistrationDetailsDrawer), not the list row.
    await makePending(drawerTargetName);
    // Duplicate pair: two distinct campers sharing name+dob → both flagged duplicate.
    await makePending(dupName, dupDob);
    await makePending(dupName, dupDob);
  });

  test.afterAll(async () => {
    try {
      await prisma.registration.deleteMany({ where: { camperId: { in: camperIds } } });
      await prisma.camper.deleteMany({ where: { id: { in: camperIds } } });
      await prisma.user.deleteMany({ where: { id: { in: [...parentIds, repId] } } });
      if (campusId) await prisma.campus.deleteMany({ where: { id: campusId } });
      await prisma.organization.update({ where: { id: organizationId }, data: { approvalWorkflow: originalApprovalWorkflow } });
    } catch {
      // best-effort
    }
  });

  test("defaults to Pending and lets a reviewer recommend once, flipping to Awaiting Approval", async ({ page }) => {
    await loginWithPassword(page, repEmail, "password123");
    await page.goto("/campus-rep-dashboard/registrations");
    await page.getByRole("heading", { name: "Registrations" }).first().waitFor({ state: "visible", timeout: 15000 });

    // Default filter is "Pending" (AWAITING_VETTING) — the reviewer's outstanding work.
    const filterSelect = page.locator("select").first();
    await expect(filterSelect).toHaveValue("REVIEW_AWAITING_VETTING", { timeout: 10000 });

    // Switch to list view for deterministic <tr> rows.
    await page.getByRole("button", { name: "List View" }).click();

    const targetRow = page.locator("tr", { hasText: targetName });
    await expect(targetRow).toBeVisible({ timeout: 10000 });
    await expect(targetRow.getByRole("button", { name: "Recommend" })).toBeVisible();

    // Recommend it.
    await targetRow.getByRole("button", { name: "Recommend" }).click();

    // It leaves the Pending list (endorsed rows are excluded from AWAITING_VETTING).
    await expect(page.locator("tr", { hasText: targetName })).toHaveCount(0, { timeout: 10000 });

    // In the "Awaiting" filter it reappears, now non-clickable "Awaiting Approval" + Recommended badge.
    await filterSelect.selectOption("REVIEW_AWAITING_FINAL");
    const awaitingRow = page.locator("tr", { hasText: targetName });
    await expect(awaitingRow).toBeVisible({ timeout: 10000 });
    await expect(awaitingRow.getByText("Recommended")).toBeVisible();
    const awaitingBtn = awaitingRow.getByRole("button", { name: "Awaiting Approval" });
    await expect(awaitingBtn).toBeVisible();
    await expect(awaitingBtn).toBeDisabled();
    await expect(awaitingRow.getByRole("button", { name: "Recommend" })).toHaveCount(0);
  });

  test("Recommend inside the Registration Details drawer gives immediate feedback", async ({ page }) => {
    await loginWithPassword(page, repEmail, "password123");
    await page.goto("/campus-rep-dashboard/registrations");
    await page.getByRole("heading", { name: "Registrations" }).first().waitFor({ state: "visible", timeout: 15000 });
    await page.getByRole("button", { name: "List View" }).click();

    // Clear back to "All Statuses" so both filter states are reachable without navigating away.
    await page.locator("select").first().selectOption("");
    const row = page.locator("tr", { hasText: drawerTargetName });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Registration Details" })).toBeVisible({ timeout: 10000 });

    const recommendBtn = dialog.getByRole("button", { name: "Recommend" });
    await expect(recommendBtn).toBeVisible();
    await recommendBtn.click();

    // Without closing/reopening the drawer: badge appears, button becomes disabled
    // "Awaiting Approval" — this is the fix for "clicking Recommend does nothing".
    await expect(dialog.getByText("Recommended")).toBeVisible({ timeout: 10000 });
    const awaitingBtn = dialog.getByRole("button", { name: "Awaiting Approval" });
    await expect(awaitingBtn).toBeVisible();
    await expect(awaitingBtn).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Recommend" })).toHaveCount(0);
  });

  test("surfaces duplicate registrations with a Duplicates filter and badge", async ({ page }) => {
    await loginWithPassword(page, repEmail, "password123");
    await page.goto("/campus-rep-dashboard/registrations");
    await page.getByRole("heading", { name: "Registrations" }).first().waitFor({ state: "visible", timeout: 15000 });
    await page.getByRole("button", { name: "List View" }).click();

    const filterSelect = page.locator("select").first();
    await filterSelect.selectOption("FILTER_DUPLICATES");

    const dupRows = page.locator("tr", { hasText: dupName });
    await expect(dupRows).toHaveCount(2, { timeout: 10000 });
    // Each duplicate row carries the warning "Duplicate" badge.
    await expect(dupRows.first().getByText("Duplicate", { exact: true })).toBeVisible();
    await expect(dupRows.nth(1).getByText("Duplicate", { exact: true })).toBeVisible();
  });
});
