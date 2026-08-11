import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma, getFixtureOrgContext, loginWithPassword, relaxRequiredCustomFields, restoreRequiredCustomFields, switchRegistrationsToListView } from "./helpers";

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

  const repEmail2 = `e2e-twostep-rep2-${stamp}@camply.test`;
  const parentEmailE = `e2e-twostep-parent-e-${stamp}@camply.test`;
  const parentEmailF = `e2e-twostep-parent-f-${stamp}@camply.test`;

  let organizationId: string;
  let campId: string;
  let originalApprovalWorkflow: string;
  let campusId: string;
  let repId: string;
  let registrationEndorseId: string; // rep endorses -> admin approves
  let registrationRejectId: string; // rep rejects directly
  let registrationOverrideId: string; // admin approves without endorsement
  let registrationSingleStepId: string; // used once flipped back to SINGLE_STEP
  let registrationNotifyId: string; // endorsement notification test
  let registrationResubmitId: string; // correction + resubmit resets endorsement
  let campusId2: string; // second campus, for cross-campus scoping test
  let repId2: string;
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
    registrationNotifyId = await makePendingRegistration(parentEmailE);
    registrationResubmitId = await makePendingRegistration(parentEmailF);
    // resubmitRegistration() runs the full validateSubmission pipeline, which
    // requires firstName/lastName/dateOfBirth/gender (SYSTEM fields) — the
    // other fixtures above never resubmit, so `name` alone was enough for them.
    const resubmitCamper = await prisma.registration
      .findUniqueOrThrow({ where: { id: registrationResubmitId } })
      .then((r) => r.camperId);
    await prisma.camper.update({
      where: { id: resubmitCamper },
      data: { firstName: "E2E", lastName: "TwoStep", dateOfBirth: new Date("2012-01-01"), gender: "Male" },
    });

    const campus2 = await prisma.campus.create({
      data: { name: `E2E TwoStep Campus2 ${stamp}`, slug: `e2e-twostep-campus2-${stamp}`, address: "2 Test St", city: "Testville", country: "Testland", organizationId },
    });
    campusId2 = campus2.id;
    const rep2 = await prisma.user.create({
      data: { email: repEmail2, password, role: "CAMPUS_REPRESENTATIVE", organizationId, managedCampuses: { connect: { id: campusId2 } } },
    });
    repId2 = rep2.id;
  });

  test.afterAll(async () => {
    await prisma.registration.deleteMany({ where: { camperId: { in: camperIds } } });
    await prisma.camper.deleteMany({ where: { id: { in: camperIds } } });
    await prisma.notification.deleteMany({ where: { registrationId: { in: [registrationNotifyId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [...parentIds, repId, repId2] } } });
    if (campusId) await prisma.campus.deleteMany({ where: { id: campusId } });
    if (campusId2) await prisma.campus.deleteMany({ where: { id: campusId2 } });
    await prisma.organization.update({ where: { id: organizationId }, data: { approvalWorkflow: originalApprovalWorkflow } });
  });

  test("rep can endorse a PENDING registration — no status change, no acceptance email", async ({ page }) => {
    await loginWithPassword(page, repEmail, "password123");
    await page.goto("/campus-rep-dashboard/registrations");
    await page.getByText("List View").click();

    // Reviewers default into the "Pending" filter (submitted, not yet recommended).
    const row = page.locator("tr", { hasText: `E2E TwoStep Camper ${parentEmailA}` });
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row.getByRole("button", { name: "Approve" })).toHaveCount(0);
    await row.getByRole("button", { name: "Recommend" }).click();

    // Endorsed rows leave the "Pending" filter (it's excluded from AWAITING_VETTING), so
    // switch to "All Statuses" to find it again and check its Recommended badge.
    await page.locator("select").first().selectOption("");
    const rowAfterEndorse = page.locator("tr", { hasText: `E2E TwoStep Camper ${parentEmailA}` });
    await expect(rowAfterEndorse.getByText("Recommended", { exact: true })).toBeVisible({ timeout: 10000 });

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
    await page.getByText("List View").click();

    const row = page.locator("tr", { hasText: `E2E TwoStep Camper ${parentEmailB}` });
    await expect(row).toBeVisible({ timeout: 10000 });

    await row.getByRole("button", { name: "Reject" }).click();
    await page.getByPlaceholder("Reason for rejection").fill("Duplicate submission");
    await page.getByRole("dialog").getByRole("button", { name: "Reject" }).click();

    await expect(async () => {
      const registration = await prisma.registration.findUniqueOrThrow({ where: { id: registrationRejectId } });
      expect(registration.status).toBe("REJECTED");
    }).toPass({ timeout: 10000 });

    await expect(async () => {
      const sideEffects = await prisma.sideEffect.findMany({ where: { registrationId: registrationRejectId, type: "REGISTRATION_REJECTED" } });
      expect(sideEffects.length).toBeGreaterThan(0);
    }).toPass({ timeout: 10000 });
  });

  test("admin sees the endorsed registration under Awaiting Final Approval and gives final approval", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/registrations");

    await page.getByRole("button", { name: "Awaiting Final Approval" }).click();
    await page.getByText("List View").click();
    const row = page.locator("tr", { hasText: `E2E TwoStep Camper ${parentEmailA}` });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.click();

    await expect(page.getByRole("heading", { name: "Registration Details" })).toBeVisible({ timeout: 5000 });
    await page.getByRole("dialog").getByRole("button", { name: "Approve", exact: true }).click();

    await expect(async () => {
      const registration = await prisma.registration.findUniqueOrThrow({ where: { id: registrationEndorseId } });
      expect(registration.status).toBe("APPROVED");
      expect(registration.registrationNumber).toBeTruthy();
      expect(registration.qrToken).toBeTruthy();
    }).toPass({ timeout: 10000 });

    // SideEffect rows are written via the outbox pattern (async, outside the
    // approval transaction) — poll instead of a one-shot check.
    await expect(async () => {
      const sideEffects = await prisma.sideEffect.findMany({ where: { registrationId: registrationEndorseId, type: "REGISTRATION_APPROVED" } });
      expect(sideEffects.length).toBeGreaterThan(0);
    }).toPass({ timeout: 10000 });

    const auditRows = await prisma.auditLog.findMany({ where: { registrationId: registrationEndorseId, action: "REGISTRATION_APPROVED" } });
    expect(auditRows.some((r) => (r.newValue as any)?.twoStepOverride === false)).toBe(true);
  });

  test("admin can approve an un-endorsed registration directly (override)", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/registrations");

    await page.getByText("List View").click();
    const search = page.getByPlaceholder("Name, email, or registration #");
    await search.fill(`E2E TwoStep Camper ${parentEmailC}`);
    const row = page.locator("tr", { hasText: `E2E TwoStep Camper ${parentEmailC}` });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.click();

    await expect(page.getByRole("heading", { name: "Registration Details" })).toBeVisible({ timeout: 5000 });
    // Drawer overflow trigger is aria-labelled "More options" (see
    // RegistrationDetailsDrawer.tsx) — "More Actions" was never a real label.
    await page.getByRole("dialog").getByLabel("More options").click();
    // The override warning lives inside StatusDialog, which the menu's
    // "Change Status" item opens — the menu itself doesn't render it.
    await page.getByRole("dialog").getByText("Change Status").click();
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
      await page.getByText("List View").click();

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

  test("endorsing a registration notifies org admins in-app", async ({ page }) => {
    await loginWithPassword(page, repEmail, "password123");
    await page.goto("/campus-rep-dashboard/registrations");
    await switchRegistrationsToListView(page);
    await page.getByPlaceholder("Name, email, or registration #").fill(parentEmailE);

    const row = page.locator("tr", { hasText: `E2E TwoStep Camper ${parentEmailE}` });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.getByRole("button", { name: "Recommend" }).click();
    await expect(row.getByRole("button", { name: "Awaiting Approval" })).toBeVisible({ timeout: 10000 });

    const admins = await prisma.user.findMany({
      where: { organizationId, role: { in: ["SUPER_ADMIN", "OWNER", "ADMIN"] }, deletedAt: null },
      select: { id: true },
    });
    await expect(async () => {
      const notifications = await prisma.notification.findMany({
        where: { registrationId: registrationNotifyId, channel: "IN_APP" },
      });
      expect(notifications.length).toBeGreaterThanOrEqual(admins.length);
      expect(notifications.every((n) => n.title === "Registration endorsed")).toBe(true);
    }).toPass({ timeout: 10000 });
  });

  test("resubmission after a correction request resets a stale endorsement", async ({ page }) => {
    const { endorseRegistration, requestCorrection, resubmitRegistration } = await import("../src/server/registration/engine");

    // Relax the fixture camp's required document/custom-field gates so
    // resubmitRegistration's full validateSubmission pass doesn't fail on
    // unrelated fixture-org state — this test only cares about the review reset.
    const requiredDocs = await prisma.documentRequirement.findMany({ where: { campId, required: true, deletedAt: null } });
    if (requiredDocs.length > 0) {
      await prisma.documentRequirement.updateMany({ where: { id: { in: requiredDocs.map((d) => d.id) } }, data: { required: false } });
    }
    const customFieldSnapshot = await relaxRequiredCustomFields("CAMPER");

    try {
      await endorseRegistration({ registrationId: registrationResubmitId, actorId: repId });
      let review = await prisma.registrationReview.findUnique({ where: { registrationId: registrationResubmitId } });
      expect(review?.verificationStatus).toBe("COMPLETED");

      const resubmitParent = parentIds[parentIds.length - 1];
      await requestCorrection({ registrationId: registrationResubmitId, actorId: repId, message: "Please fix the DOB" });
      await resubmitRegistration({ registrationId: registrationResubmitId, actorId: resubmitParent });
    } finally {
      if (requiredDocs.length > 0) {
        await prisma.documentRequirement.updateMany({ where: { id: { in: requiredDocs.map((d) => d.id) } }, data: { required: true } });
      }
      await restoreRequiredCustomFields(customFieldSnapshot);
    }

    const review = await prisma.registrationReview.findUnique({ where: { registrationId: registrationResubmitId } });
    expect(review?.verificationStatus).toBe("NOT_STARTED");
    expect(review?.recommendation).toBeNull();

    const registration = await prisma.registration.findUniqueOrThrow({ where: { id: registrationResubmitId } });
    expect(registration.status).toBe("PENDING");

    await loginWithPassword(page, repEmail, "password123");
    await page.goto("/campus-rep-dashboard/registrations");
    await page.getByPlaceholder("Name, email, or registration #").fill(parentEmailF);
    await expect(page.getByRole("heading", { name: `E2E TwoStep Camper ${parentEmailF}` })).toBeVisible({ timeout: 10000 });
    await expect(page.locator("button:visible", { hasText: /^Recommend$/ }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("button:visible", { hasText: /^Awaiting Approval$/ })).toHaveCount(0);
  });

  test("a campus rep cannot see or endorse another campus's registration", async ({ page }) => {
    await loginWithPassword(page, repEmail2, "password123");
    await page.goto("/campus-rep-dashboard/registrations");

    const row = page.locator("tr", { hasText: `E2E TwoStep Camper ${parentEmailA}` });
    await expect(row).toHaveCount(0);

    const res = await page.request.post("/api/trpc/registration.endorse?batch=1", {
      data: { "0": { json: { registrationId: registrationEndorseId } } },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(403);
  });
});
