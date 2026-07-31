import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

/**
 * List-view row actions on the registrations pages used to be [Approve]
 * [Reject] for PENDING rows only, and nothing at all for any other status —
 * deleting a registration required selecting its checkbox and using the
 * bulk-action toolbar. Every row (any status) now also gets an inline
 * [Delete] button, reusing the existing soft-delete confirmation dialog and
 * `bulkSoftDelete` mutation (same one the bulk toolbar already used). Card
 * view already had Delete buried in the "More options" overflow menu; it's
 * now promoted to a visible button between Reject and View.
 */
test.describe("Registrations list/card view: Delete button", () => {
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now();
  const camperName = `E2E ListDelete Camper ${stamp}`;
  const approvedCamperName = `E2E ListDelete Approved ${stamp}`;

  let campusId: string;
  let camperId: string;
  let approvedCamperId: string;
  let parentId: string;
  let approvedParentId: string;
  let registrationId: string;
  let approvedRegistrationId: string;

  test.beforeAll(async () => {
    const { organizationId, campId } = await getFixtureOrgContext();

    const campus = await prisma.campus.create({
      data: { name: `E2E ListDelete Campus ${stamp}`, slug: `e2e-listdelete-campus-${stamp}`, address: "1 Test St", city: "Testville", country: "Testland", organizationId },
    });
    campusId = campus.id;

    const parent = await prisma.user.create({ data: { email: `e2e-listdelete-parent-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId } });
    parentId = parent.id;
    const camper = await prisma.camper.create({ data: { name: camperName, userId: parent.id, organizationId, homeCampusId: campusId } });
    camperId = camper.id;
    const reg = await prisma.registration.create({ data: { camperId: camper.id, campId, campusId, status: "PENDING" } });
    registrationId = reg.id;

    // A non-PENDING registration — previously had zero actions in list view.
    const approvedParent = await prisma.user.create({ data: { email: `e2e-listdelete-approved-parent-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId } });
    approvedParentId = approvedParent.id;
    const approvedCamper = await prisma.camper.create({ data: { name: approvedCamperName, userId: approvedParent.id, organizationId, homeCampusId: campusId } });
    approvedCamperId = approvedCamper.id;
    const approvedReg = await prisma.registration.create({ data: { camperId: approvedCamper.id, campId, campusId, status: "APPROVED" } });
    approvedRegistrationId = approvedReg.id;
  });

  test.afterAll(async () => {
    await prisma.registration.deleteMany({ where: { id: { in: [registrationId, approvedRegistrationId] } } });
    await prisma.camper.deleteMany({ where: { id: { in: [camperId, approvedCamperId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [parentId, approvedParentId] } } });
    await prisma.campus.deleteMany({ where: { id: campusId } });
  });

  test("admin list view: Delete appears on every row (Pending and non-Pending) and soft-deletes", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/registrations");
    await page.getByRole("button", { name: "List View" }).click();

    const pendingRow = page.locator("tr", { hasText: camperName });
    await expect(pendingRow).toBeVisible({ timeout: 10000 });
    await expect(pendingRow.getByRole("button", { name: "Approve" })).toBeVisible();
    await expect(pendingRow.getByRole("button", { name: "Reject" })).toBeVisible();
    await expect(pendingRow.getByRole("button", { name: "Delete" })).toBeVisible();

    // Non-PENDING row: no Approve/Reject, but Delete is still there.
    const approvedRow = page.locator("tr", { hasText: approvedCamperName });
    await expect(approvedRow).toBeVisible();
    await expect(approvedRow.getByRole("button", { name: "Approve" })).toHaveCount(0);
    await expect(approvedRow.getByRole("button", { name: "Reject" })).toHaveCount(0);
    await expect(approvedRow.getByRole("button", { name: "Delete" })).toBeVisible();

    await pendingRow.getByRole("button", { name: "Delete" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/Delete 1 registration/)).toBeVisible();
    await dialog.getByRole("button", { name: "Delete" }).click();

    await expect(page.locator("tr", { hasText: camperName })).toHaveCount(0, { timeout: 10000 });
    const deleted = await prisma.registration.findUniqueOrThrow({ where: { id: registrationId } });
    expect(deleted.deletedAt).not.toBeNull();
  });

  test("admin card view: Delete is a visible button between Reject and View, not just in the overflow menu", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/registrations");

    const card = page.locator("div.rounded-2xl", { hasText: approvedCamperName }).first();
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card.getByRole("button", { name: "Delete" })).toBeVisible();
    await expect(card.getByRole("button", { name: "View" })).toBeVisible();
  });
});

test.describe("Campus-rep registrations queue: Delete button (Recommend language)", () => {
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now();
  const repEmail = `e2e-repdelete-rep-${stamp}@camply.test`;
  const camperName = `E2E RepDelete Camper ${stamp}`;

  let organizationId: string;
  let campusId: string;
  let originalApprovalWorkflow: string;
  let repId: string;
  let parentId: string;
  let camperId: string;
  let registrationId: string;

  test.beforeAll(async () => {
    const { organizationId: orgId, campId } = await getFixtureOrgContext();
    organizationId = orgId;

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    originalApprovalWorkflow = org.approvalWorkflow;
    await prisma.organization.update({ where: { id: organizationId }, data: { approvalWorkflow: "TWO_STEP" } });

    const campus = await prisma.campus.create({
      data: { name: `E2E RepDelete Campus ${stamp}`, slug: `e2e-repdelete-campus-${stamp}`, address: "1 Test St", city: "Testville", country: "Testland", organizationId },
    });
    campusId = campus.id;

    const password = await bcrypt.hash("password123", 10);
    const rep = await prisma.user.create({
      data: { email: repEmail, password, role: "CAMPUS_REPRESENTATIVE", organizationId, managedCampuses: { connect: { id: campusId } } },
    });
    repId = rep.id;

    const parent = await prisma.user.create({ data: { email: `e2e-repdelete-parent-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId } });
    parentId = parent.id;
    const camper = await prisma.camper.create({ data: { name: camperName, userId: parent.id, organizationId, homeCampusId: campusId } });
    camperId = camper.id;
    const reg = await prisma.registration.create({ data: { camperId: camper.id, campId, campusId, status: "PENDING" } });
    registrationId = reg.id;
  });

  test.afterAll(async () => {
    try {
      await prisma.registration.deleteMany({ where: { camperId } });
      await prisma.camper.deleteMany({ where: { id: camperId } });
      await prisma.user.deleteMany({ where: { id: { in: [parentId, repId] } } });
      await prisma.campus.deleteMany({ where: { id: campusId } });
      await prisma.organization.update({ where: { id: organizationId }, data: { approvalWorkflow: originalApprovalWorkflow } });
    } catch {
      // best-effort
    }
  });

  test("Delete sits alongside Recommend/Reject in the two-step reviewer's list view", async ({ page }) => {
    await loginWithPassword(page, repEmail, "password123");
    await page.goto("/campus-rep-dashboard/registrations");
    await page.getByRole("heading", { name: "Registrations" }).first().waitFor({ state: "visible", timeout: 15000 });
    await page.getByRole("button", { name: "List View" }).click();
    await page.locator("select").first().selectOption("");

    const row = page.locator("tr", { hasText: camperName });
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row.getByRole("button", { name: "Recommend" })).toBeVisible();
    await expect(row.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
    await expect(row.getByRole("button", { name: "Reject" })).toBeVisible();
    await expect(row.getByRole("button", { name: "Delete" })).toBeVisible();

    await row.getByRole("button", { name: "Delete" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/Delete 1 registration/)).toBeVisible();
    await dialog.getByRole("button", { name: "Delete" }).click();

    await expect(page.locator("tr", { hasText: camperName })).toHaveCount(0, { timeout: 10000 });
    const deleted = await prisma.registration.findUniqueOrThrow({ where: { id: registrationId } });
    expect(deleted.deletedAt).not.toBeNull();
  });
});
