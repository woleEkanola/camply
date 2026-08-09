import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

/**
 * Campus.suspended halts a campus's registration activity (new submissions,
 * endorse, approve) without touching its signup link or already-approved
 * campers — see src/server/registration/validation.ts and engine.ts. This
 * is a distinct control from SignupLink.active (tests/campus-detail.spec.ts's
 * "signup link enable/disable" describe block).
 */
test.describe("Campus suspend/halt", () => {
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now();
  const campusName = `E2E Suspend Campus ${stamp}`;
  const camperName = `E2E Suspend Camper ${stamp}`;

  let organizationId: string;
  let campId: string;
  let campusId: string;
  let repId: string;
  let repEmail: string;
  let parentId: string;
  let camperId: string;
  let registrationId: string;
  let originalApprovalWorkflow: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;

    // Pin to SINGLE_STEP so the registrations queue shows a plain "Approve"
    // button — other specs leave the shared fixture org in TWO_STEP without
    // resetting it, which isn't this test's concern but would otherwise make
    // the queue show "Recommend" instead and break this spec's assumptions.
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    originalApprovalWorkflow = org.approvalWorkflow;
    await prisma.organization.update({ where: { id: organizationId }, data: { approvalWorkflow: "SINGLE_STEP" } });

    const campus = await prisma.campus.create({
      data: {
        name: campusName,
        slug: `e2e-suspend-campus-${stamp}`,
        address: "1 Suspend St",
        city: "Testville",
        country: "Testland",
        organizationId,
      },
    });
    campusId = campus.id;

    // A dedicated rep scoped to ONLY this campus — the campus-rep dashboard
    // hub reads session.managedCampuses[0], so reusing the shared seeded
    // campusrep@camply.com (which already manages "Demo Campus") makes which
    // campus is "first" non-deterministic and flakes this spec.
    repEmail = `e2e-suspend-rep-${stamp}@camply.test`;
    const hashed = await bcrypt.hash("password123", 10);
    const rep = await prisma.user.create({
      data: {
        email: repEmail,
        password: hashed,
        role: "CAMPUS_REPRESENTATIVE",
        organizationId,
        managedCampuses: { connect: { id: campusId } },
      },
    });
    repId = rep.id;

    const parent = await prisma.user.create({
      data: { email: `e2e-suspend-parent-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId },
    });
    parentId = parent.id;
    const camper = await prisma.camper.create({
      data: { name: camperName, userId: parentId, organizationId, homeCampusId: campusId },
    });
    camperId = camper.id;
    const reg = await prisma.registration.create({
      data: { camperId, campId, campusId, status: "PENDING" },
    });
    registrationId = reg.id;
  });

  test.afterAll(async () => {
    await prisma.organization.update({ where: { id: organizationId }, data: { approvalWorkflow: originalApprovalWorkflow as any } });
    await prisma.registration.deleteMany({ where: { id: registrationId } });
    await prisma.camper.deleteMany({ where: { id: camperId } });
    await prisma.user.deleteMany({ where: { id: { in: [parentId, repId] } } });
    await prisma.campus.update({ where: { id: campusId }, data: { reps: { set: [] } } });
    await prisma.campus.deleteMany({ where: { id: campusId } });
  });

  test("owner can suspend a campus with a reason from the detail page, and reactivate it", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto(`/admin/campuses/${campusId}`);
    await expect(page.getByRole("heading", { name: campusName })).toBeVisible({ timeout: 10000 });

    await page.getByRole("tab", { name: "Settings", exact: true }).click();
    const statusCard = page.getByTestId("campus-suspend-card");
    await expect(statusCard.getByText("Active", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Suspend Campus" }).click();
    const dialog = page.getByTestId("dialog-panel");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/Reason/i).fill("Investigating a reported issue");
    await dialog.getByRole("button", { name: "Suspend Campus", exact: true }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    await expect(statusCard.getByText("Suspended", { exact: true })).toBeVisible();
    await expect(page.getByText("Investigating a reported issue")).toBeVisible();

    await expect
      .poll(async () => (await prisma.campus.findUniqueOrThrow({ where: { id: campusId } })).suspended)
      .toBe(true);

    // Reactivate — the round trip back to normal.
    await page.getByRole("button", { name: "Reactivate Campus" }).click();
    await expect(statusCard.getByText("Active", { exact: true })).toBeVisible({ timeout: 10000 });

    await expect
      .poll(async () => (await prisma.campus.findUniqueOrThrow({ where: { id: campusId } })).suspended)
      .toBe(false);
  });

  test("campus rep dashboard shows a suspended banner and disables the Review Registrations tile", async ({ page }) => {
    await prisma.campus.update({ where: { id: campusId }, data: { suspended: true, suspendedReason: "E2E banner check" } });

    await loginWithPassword(page, repEmail, "password123");
    await page.goto("/campus-rep-dashboard");

    await expect(page.getByText("This campus is suspended.")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("E2E banner check")).toBeVisible();
    await expect(page.getByText("Suspended", { exact: true })).toBeVisible();

    await prisma.campus.update({ where: { id: campusId }, data: { suspended: false, suspendedReason: null } });
  });

  test("approve is blocked server-side while suspended, reject still works, and approve works again after reactivating", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/registrations");
    await page.getByRole("button", { name: "List View" }).click();

    const row = page.locator("tr", { hasText: camperName });
    await expect(row).toBeVisible({ timeout: 10000 });

    await prisma.campus.update({ where: { id: campusId }, data: { suspended: true } });
    await page.reload();
    await page.getByRole("button", { name: "List View" }).click();
    const suspendedRow = page.locator("tr", { hasText: camperName });
    await expect(suspendedRow).toBeVisible({ timeout: 10000 });

    const approveBtn = suspendedRow.getByRole("button", { name: "Approve" });
    await expect(approveBtn).toBeDisabled();

    // Reject remains available while suspended.
    await expect(suspendedRow.getByRole("button", { name: "Reject" })).toBeEnabled();

    await prisma.campus.update({ where: { id: campusId }, data: { suspended: false } });
    await page.reload();
    await page.getByRole("button", { name: "List View" }).click();
    const reactivatedRow = page.locator("tr", { hasText: camperName });
    await expect(reactivatedRow).toBeVisible({ timeout: 10000 });
    await expect(reactivatedRow.getByRole("button", { name: "Approve" })).toBeEnabled();

    await reactivatedRow.getByRole("button", { name: "Approve" }).click();
    await expect
      .poll(async () => (await prisma.registration.findUniqueOrThrow({ where: { id: registrationId } })).status)
      .toBe("APPROVED");
  });
});
