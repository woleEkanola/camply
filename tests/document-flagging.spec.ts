import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma, getFixtureOrgContext, loginWithPassword, loginWithOtp, fieldByLabel } from "./helpers";

/**
 * Document-level correction flagging: an admin or campus rep can flag one
 * required document on a registration, store a reason, move the registration to
 * REQUIRES_ACTION, and the parent dashboard/wizard highlights that exact
 * document with the reviewer message and a replace action.
 */
test.describe("Document flagging requires action", () => {
  test.describe.configure({ mode: "serial" });

  const parentEmail = `e2e-doc-flag-parent-${Date.now()}@camply.test`;
  const adminEmail = `admin@camply.com`;

  let parentId: string;
  let camperId: string;
  let registrationId: string;
  let documentId: string;
  let requirementId: string;
  let campusId: string;

  test.beforeAll(async () => {
    const { organizationId, campId } = await getFixtureOrgContext();
    const campus = await prisma.campus.findFirstOrThrow({ where: { organizationId } });
    campusId = campus.id;

    const parent = await prisma.user.create({
      data: { email: parentEmail, password: "x", role: "PARENT", organizationId },
    });
    parentId = parent.id;

    const camper = await prisma.camper.create({
      data: {
        name: "E2E Doc Flag Camper",
        firstName: "E2E",
        lastName: "DocFlag",
        dateOfBirth: new Date(2013, 5, 1),
        gender: "Male",
        userId: parentId,
        organizationId,
        homeCampusId: campusId,
      },
    });
    camperId = camper.id;

    const registration = await prisma.registration.create({
      data: { camperId: camper.id, campId, campusId: campusId, status: "PENDING" },
    });
    registrationId = registration.id;

    const requirement = await prisma.documentRequirement.create({
      data: {
        campId,
        name: "Birth Certificate",
        required: true,
        acceptedFormats: "jpg,png,pdf",
        maxSizeMb: 2,
        scope: "REGISTRATION",
      },
    });
    requirementId = requirement.id;

    const document = await prisma.document.create({
      data: {
        requirementId: requirement.id,
        registrationId: registration.id,
        url: "https://example.com/old-birth-cert.pdf",
        fileName: "old-birth-cert.pdf",
        fileType: "application/pdf",
        fileSize: 1024,
        uploadedById: parentId,
      },
    });
    documentId = document.id;
  });

  test.afterAll(async () => {
    await prisma.documentAction.deleteMany({ where: { documentId } });
    await prisma.document.deleteMany({ where: { id: documentId } });
    await prisma.documentRequirement.deleteMany({ where: { id: requirementId } });
    await prisma.registration.deleteMany({ where: { id: registrationId } });
    await prisma.camper.deleteMany({ where: { id: camperId } });
    await prisma.user.deleteMany({ where: { id: parentId } });
  });

  test("admin flags a document and the registration moves to REQUIRES_ACTION", async ({ page }) => {
    await loginWithPassword(page, adminEmail, "password123");
    await page.goto("/admin/registrations");
    await page.waitForSelector("text=Registrations");

    // Click the row for our camper
    await page.locator("text=E2E Doc Flag Camper").first().click();

    // Open the Documents tab
    await page.locator("button", { hasText: "Documents" }).first().click();

    // Click Request Replacement
    await page.locator("text=Request Replacement").first().click();
    await page.waitForTimeout(100);

    // Dismiss the browser prompt programmatically by filling and accepting
    page.on("dialog", async (dialog) => {
      if (dialog.type() === "prompt") {
        await dialog.accept("Please upload a clearer copy");
      } else {
        await dialog.dismiss();
      }
    });
    // Re-click after handler is attached
    await page.locator("text=Request Replacement").first().click();

    // Wait for the action-required banner
    await page.waitForSelector("text=Action required", { timeout: 10000 });
    await page.waitForSelector("text=Please upload a clearer copy", { timeout: 10000 });

    const registration = await prisma.registration.findUniqueOrThrow({ where: { id: registrationId } });
    expect(registration.status).toBe("REQUIRES_ACTION");
    expect(registration.correctionRequest).toContain("Birth Certificate needs action");
    expect(registration.correctionRequest).toContain("Please upload a clearer copy");

    const actions = await prisma.documentAction.findMany({ where: { documentId } });
    expect(actions).toHaveLength(1);
    expect(actions[0]?.status).toBe("REQUIRES_ACTION");
  });

  test("parent dashboard shows the exact flagged document and reviewer message", async ({ page }) => {
    await loginWithOtp(page, parentEmail);
    await page.waitForURL(/\/dashboard/);

    await page.goto(`/dashboard/register/${registrationId}`);
    await page.waitForSelector("text=Correction Requested by Admin", { timeout: 10000 });
    await page.waitForSelector("text=Birth Certificate needs action: Please upload a clearer copy", { timeout: 10000 });

    // Fill required profile fields so we can proceed to documents
    await fieldByLabel(page, "First Name").fill("E2E");
    await fieldByLabel(page, "Last Name").fill("DocFlag");
    await fieldByLabel(page, "Date of Birth").fill("2013-06-01");
    await fieldByLabel(page, "Gender").selectOption("Male");

    // Continue to documents step
    await page.locator('button:visible', { hasText: "Continue to Documents" }).first().click();

    // The document row should show "Action Required" and "Replace Document" button
    await page.waitForSelector("text=Action Required", { timeout: 10000 });
    await page.waitForSelector("text=Please upload a clearer copy", { timeout: 10000 });
    await page.waitForSelector("text=Replace Document", { timeout: 10000 });
  });
});
