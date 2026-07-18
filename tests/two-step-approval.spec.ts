import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

/**
 * Exercises the two-layer registration approval workflow: with
 * Organization.approvalWorkflow = "TWO_STEP", a Campus Representative can
 * only ENDORSE a PENDING registration (no status change, no acceptance
 * email) — an org ADMIN must give final approval, which is what actually
 * fires the acceptance email. An admin may still approve without a prior
 * endorsement (an override, recorded in the audit trail). Reps can still
 * reject directly. SINGLE_STEP orgs (the default) keep today's one-click
 * rep-approve behavior unchanged.
 */
test.describe("Two-step registration approval", () => {
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now();
  const repEmail = `e2e-twostep-rep-${stamp}@camply.test`;
  const parentEmailA = `e2e-twostep-parent-a-${stamp}@camply.test`;
  const parentEmailB = `e2e-twostep-parent-b-${stamp}@camply.test`;
  const parentEmailC = `e2e-twostep-parent-c-${stamp}@camply.test`;
  const parentEmailD = `e2e-twostep-parent-d-${stamp}@camply.test`;

  let organizationId: string;
  let campId: string;
  let originalApprovalWorkflow: string;
  let campusId: string;
  let repId: string;
  let registrationEndorseId: string; // rep endorses -> admin approves
  let registrationRejectId: string; // rep rejects directly
  let registrationOverrideId: string; // admin approves without endorsement
  let registrationSingleStepId: string; // used once flipped back to SINGLE_STEP
  const camperIds: string[] = [];
  const parentIds: string[] = [];

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    originalApprovalWorkflow = org.approvalWorkflow;
    await prisma.organization.update({ where: { id: organizationId }, data: { approvalWorkflow: "TWO_STEP" } });

    const campus = await prisma.campus.create({
      data: { name: `E2E TwoStep Campus ${stamp}`, slug: `e2e-twostep-campus-${stamp}`, address: "1 Test St", city: "Testville", country: "Testland", organizationId },
    });
    campusId = campus.id;

    const password = await bcrypt.hash("password123", 10);
    const rep = await prisma.user.create({
      data: { email: repEmail, password, role: "CAMPUS_REPRESENTATIVE", organizationId, managedCampuses: { connect: { id: campusId } } },
    });
    repId = rep.id;

    async function makePendingRegistration(parentEmail: string) {
      const parent = await prisma.user.create({ data: { email: parentEmail, password: "x", role: "PARENT", organizationId } });
      parentIds.push(parent.id);
      const camper = await prisma.camper.create({
        data: { name: `E2E TwoStep Camper ${parentEmail}`, userId: parent.id, organizationId, homeCampusId: campusId },
      });
      camperIds.push(camper.id);
      const registration = await prisma.registration.create({
        data: { camperId: camper.id, campId, campusId, status: "PENDING" },
      });
      return registration.id;
    }

    registrationEndorseId = await makePendingRegistration(parentEmailA);
    registrationRejectId = await makePendingRegistration(parentEmailB);
    registrationOverrideId = await makePendingRegistration(parentEmailC);
    registrationSingleStepId = await makePendingRegistration(parentEmailD);
  });

  test.afterAll(async () => {
    await prisma.registration.deleteMany({ where: { camperId: { in: camperIds } } });
    await prisma.camper.deleteMany({ where: { id: { in: camperIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [...parentIds, repId] } } });
    if (campusId) await prisma.campus.deleteMany({ where: { id: campusId } });
    await prisma.organization.update({ where: { id: organizationId }, data: { approvalWorkflow: originalApprovalWorkflow } });
  });

  test("rep can endorse a PENDING registration — no status change, no acceptance email", async ({ page }) => {
    await loginWithPassword(page, repEmail, "password123");
    await page.goto("/campus-rep-dashboard/registrations");

    const row = page.locator("tr", { hasText: `E2E TwoStep Camper ${parentEmailA}` });
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row.getByRole("button", { name: "Approve" })).toHaveCount(0);
    await row.getByRole("button", { name: "Recommend" }).click();

    await expect(row.getByText("Recommended ✓ awaiting admin approval")).toBeVisible({ timeout: 10000 });

    const review = await prisma.registrationReview.findUnique({ where: { registrationId: registrationEndorseId } });
    expect(review?.verificationStatus).toBe("COMPLETED");
    expect(review?.recommendation).toBe("APPROVE");

    const registration = await prisma.registration.findUniqueOrThrow({ where: { id: registrationEndorseId } });
    expect(registration.status).toBe("PENDING");

    const sideEffects = await prisma.sideEffect.findMany({ where: { registrationId: registrationEndorseId, type: "REGISTRATION_APPROVED" } });
    expect(sideEffects).toHaveLength(0);
  });

  test("rep is forbidden from approving directly via the API in TWO_STEP mode", async ({ page }) => {
    await loginWithPassword(page, repEmail, "password123");

    const res = await page.request.post("/api/trpc/registration.approve?batch=1", {
      data: { "0": { json: { registrationId: registrationEndorseId } } },
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status()).toBe(403);
    const unchanged = await prisma.registration.findUniqueOrThrow({ where: { id: registrationEndorseId } });
    expect(unchanged.status).toBe("PENDING");
  });

  test("rep can reject a registration directly", async ({ page }) => {
    await loginWithPassword(page, repEmail, "password123");
    await page.goto("/campus-rep-dashboard/registrations");

    const row = page.locator("tr", { hasText: `E2E TwoStep Camper ${parentEmailB}` });
    await expect(row).toBeVisible({ timeout: 10000 });

    page.once("dialog", (dialog) => dialog.accept("Duplicate submission"));
    await row.getByRole("button", { name: "Reject" }).click();

    await expect(async () => {
      const registration = await prisma.registration.findUniqueOrThrow({ where: { id: registrationRejectId } });
      expect(registration.status).toBe("REJECTED");
    }).toPass({ timeout: 10000 });

    const sideEffects = await prisma.sideEffect.findMany({ where: { registrationId: registrationRejectId, type: "REGISTRATION_REJECTED" } });
    expect(sideEffects.length).toBeGreaterThan(0);
  });

  test("admin sees the endorsed registration under Awaiting Final Approval and gives final approval", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/registrations");

    await page.getByText("Awaiting Final Approval").click();
    const row = page.locator("tr", { hasText: `E2E TwoStep Camper ${parentEmailA}` });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.click();

    await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible({ timeout: 5000 });
    await page.getByRole("dialog").getByRole("button", { name: "Approve", exact: true }).click();

    await expect(async () => {
      const registration = await prisma.registration.findUniqueOrThrow({ where: { id: registrationEndorseId } });
      expect(registration.status).toBe("APPROVED");
      expect(registration.registrationNumber).toBeTruthy();
      expect(registration.qrToken).toBeTruthy();
    }).toPass({ timeout: 10000 });

    const sideEffects = await prisma.sideEffect.findMany({ where: { registrationId: registrationEndorseId, type: "REGISTRATION_APPROVED" } });
    expect(sideEffects.length).toBeGreaterThan(0);

    const auditRows = await prisma.auditLog.findMany({ where: { registrationId: registrationEndorseId, action: "REGISTRATION_APPROVED" } });
    expect(auditRows.some((r) => (r.newValue as any)?.twoStepOverride === false)).toBe(true);
  });

  test("admin can approve an un-endorsed registration directly (override)", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/registrations");

    const search = page.getByPlaceholder("Name, email, or registration #");
    await search.fill(`E2E TwoStep Camper ${parentEmailC}`);
    const row = page.locator("tr", { hasText: `E2E TwoStep Camper ${parentEmailC}` });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.click();

    await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Change Status" }).click();
    await expect(page.getByText("This registration has not been recommended by a campus rep")).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Approve Registration" }).click();

    await expect(async () => {
      const registration = await prisma.registration.findUniqueOrThrow({ where: { id: registrationOverrideId } });
      expect(registration.status).toBe("APPROVED");
    }).toPass({ timeout: 10000 });

    const auditRows = await prisma.auditLog.findMany({ where: { registrationId: registrationOverrideId, action: "REGISTRATION_APPROVED" } });
    expect(auditRows.some((r) => (r.newValue as any)?.twoStepOverride === true)).toBe(true);
  });

  test("flipping the org back to SINGLE_STEP restores one-click rep approval", async ({ page }) => {
    await prisma.organization.update({ where: { id: organizationId }, data: { approvalWorkflow: "SINGLE_STEP" } });
    try {
      await loginWithPassword(page, repEmail, "password123");
      await page.goto("/campus-rep-dashboard/registrations");

      const row = page.locator("tr", { hasText: `E2E TwoStep Camper ${parentEmailD}` });
      await expect(row).toBeVisible({ timeout: 10000 });
      await expect(row.getByRole("button", { name: "Recommend" })).toHaveCount(0);
      await row.getByRole("button", { name: "Approve" }).click();

      await expect(async () => {
        const registration = await prisma.registration.findUniqueOrThrow({ where: { id: registrationSingleStepId } });
        expect(registration.status).toBe("APPROVED");
      }).toPass({ timeout: 10000 });
    } finally {
      await prisma.organization.update({ where: { id: organizationId }, data: { approvalWorkflow: "TWO_STEP" } });
    }
  });
});
