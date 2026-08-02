import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import {
  prisma,
  getFixtureOrgContext,
  loginWithPassword,
  switchRegistrationsToListView,
  suspendDuplicateConstraint,
  restoreDuplicateConstraint,
} from "./helpers";

/**
 * Confirms the new REVOKE_APPROVAL, UNDO_CHECK_IN, and
 * ADVANCE_FROM_REQUIRES_ACTION actions appear in the StatusDialog
 * UI (the "Change Status" dropdown inside RegistrationDetailsDrawer),
 * and that submitting them through the UI produces the correct
 * status change.
 */
test.describe("StatusDialog UI status actions", () => {
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now();
  const parentEmail = `e2e-statusdialog-${stamp}@camply.test`;

  let organizationId: string;
  let campId: string;
  let campusId: string;
  let parentId: string;
  let camperApprovedId: string;
  let camperCheckedInId: string;
  let camperRequiresActionId: string;
  let regApprovedId: string;
  let regCheckedInId: string;
  let regRequiresActionId: string;

  test.beforeAll(async () => {
    await suspendDuplicateConstraint();

    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;
    campusId = ctx.campusId;

    const parent = await prisma.user.create({
      data: {
        email: parentEmail,
        password: "x",
        role: "PARENT",
        organizationId,
      },
    });
    parentId = parent.id;

    const camperA = await prisma.camper.create({
      data: {
        name: `E2E SD Revoke ${stamp}`,
        userId: parentId,
        organizationId,
        homeCampusId: campusId,
      },
    });
    camperApprovedId = camperA.id;

    const camperB = await prisma.camper.create({
      data: {
        name: `E2E SD UndoCI ${stamp}`,
        userId: parentId,
        organizationId,
        homeCampusId: campusId,
      },
    });
    camperCheckedInId = camperB.id;

    const camperC = await prisma.camper.create({
      data: {
        name: `E2E SD Advance ${stamp}`,
        userId: parentId,
        organizationId,
        homeCampusId: campusId,
      },
    });
    camperRequiresActionId = camperC.id;

    const r1 = await prisma.registration.create({
      data: {
        camperId: camperApprovedId,
        campId,
        campusId,
        status: "APPROVED",
        qrToken: "e2e-ui-revoke",
        registrationNumber: `E2E-REVOKE-${stamp}`,
      },
    });
    regApprovedId = r1.id;

    const r2 = await prisma.registration.create({
      data: {
        camperId: camperCheckedInId,
        campId,
        campusId,
        status: "CHECKED_IN",
        qrToken: "e2e-ui-undo-ci",
        registrationNumber: `E2E-UNDOCI-${stamp}`,
        checkedInAt: new Date(),
      },
    });
    regCheckedInId = r2.id;

    const r3 = await prisma.registration.create({
      data: {
        camperId: camperRequiresActionId,
        campId,
        campusId,
        status: "REQUIRES_ACTION",
        correctionRequest: "Missing document",
      },
    });
    regRequiresActionId = r3.id;
  });

  test.afterAll(async () => {
    await prisma.registration.deleteMany({
      where: { camperId: { in: [camperApprovedId, camperCheckedInId, camperRequiresActionId] } },
    });
    await prisma.camper.deleteMany({
      where: { id: { in: [camperApprovedId, camperCheckedInId, camperRequiresActionId] } },
    });
    await prisma.user.deleteMany({ where: { id: parentId } });
    await restoreDuplicateConstraint();
  });

  async function openChangeStatusDialog(page: any, camperSearch: string) {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/registrations");
    await switchRegistrationsToListView(page);

    const search = page.getByPlaceholder("Name, email, or registration #");
    await search.fill(camperSearch);
    await page.waitForTimeout(1000);

    const row = page.locator("tr", { hasText: camperSearch }).first();
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.click();

    await expect(page.getByRole("heading", { name: "Registration Details" })).toBeVisible({ timeout: 5000 });

    // The Drawer and StatusDialog both get role="dialog"; scope the
    // "More options" button to the Drawer's panel, then click
    // "Change Status" which opens the StatusDialog (a nested Dialog
    // with data-testid="dialog-panel").
    await page.getByTestId("drawer-panel").getByLabel("More options").click();
    await page.getByTestId("drawer-panel").getByText("Change Status").click();
    await expect(page.getByTestId("dialog-panel")).toBeVisible({ timeout: 5000 });
  }

  function statusDialogSelect(page: any) {
    return page.getByTestId("dialog-panel").locator("select").first();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  REVOKE_APPROVAL via UI
  // ═══════════════════════════════════════════════════════════════════════

  test("StatusDialog shows Revoke Approval for APPROVED registrations", async ({ page }) => {
    await openChangeStatusDialog(page, `E2E SD Revoke ${stamp}`);

    await expect(statusDialogSelect(page).locator("option", { hasText: "Revoke Approval" })).toBeAttached();
  });

  test("admin revokes an APPROVED registration via StatusDialog → PENDING, clears qrToken/regNumber", async ({ page }) => {
    await openChangeStatusDialog(page, `E2E SD Revoke ${stamp}`);

    await statusDialogSelect(page).selectOption("REVOKE_APPROVAL");

    await expect(
      page.getByTestId("dialog-panel").getByText(/move the registration back/)
    ).toBeVisible({ timeout: 3000 });

    await page.getByTestId("dialog-panel").getByRole("button", { name: "Revoke Approval" }).click();

    await expect(async () => {
      const reg = await prisma.registration.findUniqueOrThrow({ where: { id: regApprovedId } });
      expect(reg.status).toBe("PENDING");
      expect(reg.qrToken).toBeNull();
      expect(reg.registrationNumber).toBeNull();
    }).toPass({ timeout: 10000 });
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  UNDO_CHECK_IN via UI
  // ═══════════════════════════════════════════════════════════════════════

  test("StatusDialog shows Undo Check-in for CHECKED_IN registrations", async ({ page }) => {
    await openChangeStatusDialog(page, `E2E SD UndoCI ${stamp}`);

    await expect(statusDialogSelect(page).locator("option", { hasText: "Undo Check-in" })).toBeAttached();
  });

  test("admin undoes a check-in via StatusDialog → CHECKED_IN reverts to APPROVED", async ({ page }) => {
    await openChangeStatusDialog(page, `E2E SD UndoCI ${stamp}`);

    await statusDialogSelect(page).selectOption("UNDO_CHECK_IN");

    await expect(
      page.getByTestId("dialog-panel").getByText(/undo the check-in/)
    ).toBeVisible({ timeout: 3000 });

    await page.getByTestId("dialog-panel").getByRole("button", { name: "Undo Check-in" }).click();

    await expect(async () => {
      const reg = await prisma.registration.findUniqueOrThrow({ where: { id: regCheckedInId } });
      expect(reg.status).toBe("APPROVED");
      expect(reg.checkedInAt).toBeNull();
      expect(reg.checkedInById).toBeNull();
    }).toPass({ timeout: 10000 });
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  ADVANCE_FROM_REQUIRES_ACTION via UI
  // ═══════════════════════════════════════════════════════════════════════

  test("StatusDialog shows Advance to Review for REQUIRES_ACTION registrations", async ({ page }) => {
    await openChangeStatusDialog(page, `E2E SD Advance ${stamp}`);

    await expect(statusDialogSelect(page).locator("option", { hasText: "Advance to Review" })).toBeAttached();
  });

  test("admin advances REQUIRES_ACTION via StatusDialog → PENDING, clears correctionRequest", async ({ page }) => {
    await openChangeStatusDialog(page, `E2E SD Advance ${stamp}`);

    await statusDialogSelect(page).selectOption("ADVANCE_FROM_REQUIRES_ACTION");

    await expect(
      page.getByTestId("dialog-panel").getByText(/clear the correction request/)
    ).toBeVisible({ timeout: 3000 });

    await page.getByTestId("dialog-panel").getByRole("button", { name: "Advance to Review" }).click();

    await expect(async () => {
      const reg = await prisma.registration.findUniqueOrThrow({ where: { id: regRequiresActionId } });
      expect(reg.status).toBe("PENDING");
      expect(reg.correctionRequest).toBeNull();
    }).toPass({ timeout: 10000 });
  });

  // ═══════════════════════════════════════════════════════════════════════
  //  Negative: actions should NOT appear for wrong statuses
  // ═══════════════════════════════════════════════════════════════════════

  test("Revoke Approval does NOT appear for non-APPROVED registrations", async ({ page }) => {
    await openChangeStatusDialog(page, `E2E SD Advance ${stamp}`);

    await expect(statusDialogSelect(page).locator("option", { hasText: "Revoke Approval" })).not.toBeAttached();
  });

  test("Undo Check-in does NOT appear for non-CHECKED_IN registrations", async ({ page }) => {
    await openChangeStatusDialog(page, `E2E SD Revoke ${stamp}`);

    await expect(statusDialogSelect(page).locator("option", { hasText: "Undo Check-in" })).not.toBeAttached();
  });
});
