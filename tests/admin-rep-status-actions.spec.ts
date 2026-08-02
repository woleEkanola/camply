import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma, getFixtureOrgContext, loginWithPassword, suspendDuplicateConstraint, restoreDuplicateConstraint } from "./helpers";

/**
 * Verifies the REVOKE_APPROVAL, ADVANCE_FROM_REQUIRES_ACTION, and
 * UNDO_CHECK_IN status actions — added to transitionWithOptions and
 * bulkTransition in commits 3e49b28 and 6615bbd. Both org admins and
 * campus reps (scoped to their own campus via assertOrgAdminOrCampusRep)
 * can execute all three actions through the tRPC API.
 */
test.describe("Admin and Campus Rep status actions", () => {
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now();
  const repEmail = `e2e-statusactions-rep-${stamp}@camply.test`;
  const parentEmail = `e2e-statusactions-parent-${stamp}@camply.test`;

  let organizationId: string;
  let campId: string;
  let campusId: string;
  let repId: string;
  let parentId: string;
  let camperId: string;
  let regApprovedAdminId: string;
  let regApprovedRepId: string;
  let regRequiresActionId: string;
  let regCheckedInId: string;

  test.beforeAll(async () => {
    await suspendDuplicateConstraint();

    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;

    const campus = await prisma.campus.create({
      data: {
        name: `E2E StatusActions Campus ${stamp}`,
        slug: `e2e-statusactions-campus-${stamp}`,
        address: "1 Test St",
        city: "Testville",
        country: "Testland",
        organizationId,
      },
    });
    campusId = campus.id;

    const password = await bcrypt.hash("password123", 10);
    const rep = await prisma.user.create({
      data: {
        email: repEmail,
        password,
        role: "CAMPUS_REPRESENTATIVE",
        organizationId,
        managedCampuses: { connect: { id: campusId } },
      },
    });
    repId = rep.id;

    const parent = await prisma.user.create({
      data: { email: parentEmail, password: "x", role: "PARENT", organizationId },
    });
    parentId = parent.id;

    const camper = await prisma.camper.create({
      data: { name: `E2E StatusActions Camper ${stamp}`, userId: parentId, organizationId, homeCampusId: campusId },
    });
    camperId = camper.id;

    // Registration 1 — APPROVED, for admin revoke test
    const r1 = await prisma.registration.create({
      data: {
        camperId,
        campId,
        campusId,
        status: "APPROVED",
        qrToken: "e2e-revoke-token-admin",
        registrationNumber: `E2E-REVOKE-ADMIN-${stamp}`,
      },
    });
    regApprovedAdminId = r1.id;

    // Registration 2 — APPROVED, for campus rep revoke test
    const r2 = await prisma.registration.create({
      data: {
        camperId,
        campId,
        campusId,
        status: "APPROVED",
        qrToken: "e2e-revoke-token-rep",
        registrationNumber: `E2E-REVOKE-REP-${stamp}`,
      },
    });
    regApprovedRepId = r2.id;

    // Registration 3 — REQUIRES_ACTION, for campus rep advance test
    const r3 = await prisma.registration.create({
      data: {
        camperId,
        campId,
        campusId,
        status: "REQUIRES_ACTION",
        correctionRequest: "Missing document",
      },
    });
    regRequiresActionId = r3.id;

    // Registration 4 — CHECKED_IN, for admin undo check-in test
    const r4 = await prisma.registration.create({
      data: {
        camperId,
        campId,
        campusId,
        status: "CHECKED_IN",
        qrToken: "e2e-undo-ci-token",
        registrationNumber: `E2E-UNDO-CI-${stamp}`,
        checkedInAt: new Date(),
      },
    });
    regCheckedInId = r4.id;
  });

  test.afterAll(async () => {
    await prisma.registration.deleteMany({ where: { camperId } });
    await prisma.camper.deleteMany({ where: { id: camperId } });
    await prisma.user.deleteMany({ where: { id: { in: [parentId, repId] } } });
    if (campusId) await prisma.campus.deleteMany({ where: { id: campusId } });
    await restoreDuplicateConstraint();
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  REVOKE_APPROVAL
  // ═══════════════════════════════════════════════════════════════════════

  test("admin revokes an APPROVED registration → PENDING, clears qrToken and registrationNumber", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");

    const res = await page.request.post(
      "/api/trpc/registration.transitionWithOptions?batch=1",
      {
        data: {
          "0": {
            json: {
              registrationId: regApprovedAdminId,
              action: "REVOKE_APPROVAL",
              reason: "Test revoke by admin",
              sendEmail: false,
            },
          },
        },
        headers: { "Content-Type": "application/json" },
      },
    );

    expect(res.ok(), "Admin REVOKE_APPROVAL API call should succeed").toBe(true);

    const json = await res.json();
    expect(json[0].result?.data?.json?.status).toBe("PENDING");

    const reg = await prisma.registration.findUniqueOrThrow({ where: { id: regApprovedAdminId } });
    expect(reg.status).toBe("PENDING");
    expect(reg.qrToken).toBeNull();
    expect(reg.registrationNumber).toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { registrationId: regApprovedAdminId, action: "REGISTRATION_APPROVAL_REVOKED" },
    });
    expect(audit).toBeTruthy();
  });

  test("campus rep revokes an APPROVED registration on their own campus → PENDING", async ({ page }) => {
    await loginWithPassword(page, repEmail, "password123");

    const res = await page.request.post(
      "/api/trpc/registration.transitionWithOptions?batch=1",
      {
        data: {
          "0": {
            json: {
              registrationId: regApprovedRepId,
              action: "REVOKE_APPROVAL",
              reason: "Test revoke by campus rep",
              sendEmail: false,
            },
          },
        },
        headers: { "Content-Type": "application/json" },
      },
    );

    expect(res.ok(), "Campus rep REVOKE_APPROVAL API call should succeed").toBe(true);

    const reg = await prisma.registration.findUniqueOrThrow({ where: { id: regApprovedRepId } });
    expect(reg.status).toBe("PENDING");
    expect(reg.qrToken).toBeNull();
    expect(reg.registrationNumber).toBeNull();
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  ADVANCE_FROM_REQUIRES_ACTION
  // ═══════════════════════════════════════════════════════════════════════

  test("campus rep advances a REQUIRES_ACTION registration to PENDING", async ({ page }) => {
    await loginWithPassword(page, repEmail, "password123");

    const regBefore = await prisma.registration.findUniqueOrThrow({ where: { id: regRequiresActionId } });
    expect(regBefore.status).toBe("REQUIRES_ACTION");

    const res = await page.request.post(
      "/api/trpc/registration.transitionWithOptions?batch=1",
      {
        data: {
          "0": {
            json: {
              registrationId: regRequiresActionId,
              action: "ADVANCE_FROM_REQUIRES_ACTION",
              sendEmail: false,
            },
          },
        },
        headers: { "Content-Type": "application/json" },
      },
    );

    expect(res.ok(), "Campus rep ADVANCE_FROM_REQUIRES_ACTION should succeed").toBe(true);

    const reg = await prisma.registration.findUniqueOrThrow({ where: { id: regRequiresActionId } });
    expect(reg.status).toBe("PENDING");
    expect(reg.correctionRequest).toBeNull();
  });

  test("admin also advances a REQUIRES_ACTION registration → after campus rep, admin can do it too", async ({ page }) => {
    // Re-apply REQUIRES_ACTION to the same registration via Prisma
    await prisma.registration.update({
      where: { id: regRequiresActionId },
      data: { status: "REQUIRES_ACTION", correctionRequest: "Round two" },
    });

    await loginWithPassword(page, "owner@camply.com", "password123");

    const res = await page.request.post(
      "/api/trpc/registration.transitionWithOptions?batch=1",
      {
        data: {
          "0": {
            json: {
              registrationId: regRequiresActionId,
              action: "ADVANCE_FROM_REQUIRES_ACTION",
              sendEmail: false,
            },
          },
        },
        headers: { "Content-Type": "application/json" },
      },
    );

    expect(res.ok(), "Admin ADVANCE_FROM_REQUIRES_ACTION should succeed").toBe(true);

    const reg = await prisma.registration.findUniqueOrThrow({ where: { id: regRequiresActionId } });
    expect(reg.status).toBe("PENDING");
    expect(reg.correctionRequest).toBeNull();
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  UNDO_CHECK_IN
  // ═══════════════════════════════════════════════════════════════════════

  test("admin undoes a check-in → CHECKED_IN reverts to APPROVED", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");

    const res = await page.request.post(
      "/api/trpc/registration.transitionWithOptions?batch=1",
      {
        data: {
          "0": {
            json: {
              registrationId: regCheckedInId,
              action: "UNDO_CHECK_IN",
              sendEmail: false,
            },
          },
        },
        headers: { "Content-Type": "application/json" },
      },
    );

    expect(res.ok(), "Admin UNDO_CHECK_IN API call should succeed").toBe(true);

    const reg = await prisma.registration.findUniqueOrThrow({ where: { id: regCheckedInId } });
    expect(reg.status).toBe("APPROVED");
    expect(reg.checkedInAt).toBeNull();
    expect(reg.checkedInById).toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { registrationId: regCheckedInId, action: "CHECK_IN_UNDONE" },
    });
    expect(audit).toBeTruthy();
  });

  test("campus rep is FORBIDDEN from undoing a check-in on another campus", async ({ page }) => {
    // Create a second campus NOT managed by our rep
    const otherCampus = await prisma.campus.create({
      data: {
        name: `E2E StatusActions Other Campus ${stamp}`,
        slug: `e2e-statusactions-other-${stamp}`,
        address: "2 Other St",
        city: "Testville",
        country: "Testland",
        organizationId,
      },
    });

    const otherReg = await prisma.registration.create({
      data: {
        camperId,
        campId,
        campusId: otherCampus.id,
        status: "CHECKED_IN",
        checkedInAt: new Date(),
      },
    });

    try {
      await loginWithPassword(page, repEmail, "password123");

      const res = await page.request.post(
        "/api/trpc/registration.transitionWithOptions?batch=1",
        {
          data: {
            "0": {
              json: {
                registrationId: otherReg.id,
                action: "UNDO_CHECK_IN",
                sendEmail: false,
              },
            },
          },
          headers: { "Content-Type": "application/json" },
        },
      );

      // Should be forbidden — rep doesn't manage otherCampus
      expect(res.status()).toBe(403);

      const unchanged = await prisma.registration.findUniqueOrThrow({ where: { id: otherReg.id } });
      expect(unchanged.status).toBe("CHECKED_IN");
    } finally {
      await prisma.registration.deleteMany({ where: { id: otherReg.id } });
      await prisma.campus.deleteMany({ where: { id: otherCampus.id } });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  BULK TRANSITION
  // ═══════════════════════════════════════════════════════════════════════

  test("admin bulk revokes multiple APPROVED registrations", async ({ page }) => {
    // Create two quick APPROVED registrations
    const p2 = await prisma.user.create({
      data: { email: `e2e-bulk-parent-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId },
    });
    const c2 = await prisma.camper.create({
      data: { name: `E2E Bulk Camper ${stamp}`, userId: p2.id, organizationId, homeCampusId: campusId },
    });

    const b1 = await prisma.registration.create({
      data: { camperId: c2.id, campId, campusId, status: "APPROVED", qrToken: "bulk-1", registrationNumber: `BULK-1-${stamp}` },
    });
    const b2 = await prisma.registration.create({
      data: { camperId: c2.id, campId, campusId, status: "APPROVED", qrToken: "bulk-2", registrationNumber: `BULK-2-${stamp}` },
    });

    try {
      await loginWithPassword(page, "owner@camply.com", "password123");

      const res = await page.request.post(
        "/api/trpc/registration.bulkTransition?batch=1",
        {
          data: {
            "0": {
              json: {
                ids: [b1.id, b2.id],
                action: "REVOKE_APPROVAL",
                sendEmail: false,
              },
            },
          },
          headers: { "Content-Type": "application/json" },
        },
      );

      expect(res.ok(), "Admin bulk REVOKE_APPROVAL should succeed").toBe(true);
      const json = await res.json();
      expect(json[0].result?.data?.json?.succeeded).toBe(2);

      const r1 = await prisma.registration.findUniqueOrThrow({ where: { id: b1.id } });
      const r2 = await prisma.registration.findUniqueOrThrow({ where: { id: b2.id } });
      expect(r1.status).toBe("PENDING");
      expect(r1.qrToken).toBeNull();
      expect(r2.status).toBe("PENDING");
      expect(r2.qrToken).toBeNull();
    } finally {
      await prisma.registration.deleteMany({ where: { camperId: c2.id } });
      await prisma.camper.deleteMany({ where: { id: c2.id } });
      await prisma.user.deleteMany({ where: { id: p2.id } });
    }
  });

  test("campus rep bulk advances multiple REQUIRES_ACTION registrations", async ({ page }) => {
    const p3 = await prisma.user.create({
      data: { email: `e2e-bulk-rep-parent-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId },
    });
    const c3 = await prisma.camper.create({
      data: { name: `E2E BulkRep Camper ${stamp}`, userId: p3.id, organizationId, homeCampusId: campusId },
    });

    const ra1 = await prisma.registration.create({
      data: { camperId: c3.id, campId, campusId, status: "REQUIRES_ACTION", correctionRequest: "Fix A" },
    });
    const ra2 = await prisma.registration.create({
      data: { camperId: c3.id, campId, campusId, status: "REQUIRES_ACTION", correctionRequest: "Fix B" },
    });

    try {
      await loginWithPassword(page, repEmail, "password123");

      const res = await page.request.post(
        "/api/trpc/registration.bulkTransition?batch=1",
        {
          data: {
            "0": {
              json: {
                ids: [ra1.id, ra2.id],
                action: "ADVANCE_FROM_REQUIRES_ACTION",
                sendEmail: false,
              },
            },
          },
          headers: { "Content-Type": "application/json" },
        },
      );

      expect(res.ok(), "Campus rep bulk ADVANCE_FROM_REQUIRES_ACTION should succeed").toBe(true);
      const json = await res.json();
      expect(json[0].result?.data?.json?.succeeded).toBe(2);

      const r1 = await prisma.registration.findUniqueOrThrow({ where: { id: ra1.id } });
      const r2 = await prisma.registration.findUniqueOrThrow({ where: { id: ra2.id } });
      expect(r1.status).toBe("PENDING");
      expect(r2.status).toBe("PENDING");
    } finally {
      await prisma.registration.deleteMany({ where: { camperId: c3.id } });
      await prisma.camper.deleteMany({ where: { id: c3.id } });
      await prisma.user.deleteMany({ where: { id: p3.id } });
    }
  });
});
