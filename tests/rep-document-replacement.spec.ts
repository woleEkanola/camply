import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

/**
 * Assigned rep document replacement permissions: a rep can upload/replace a
 * required document for a camper in one of their managed campuses, and cannot
 * do so for another campus.
 */
test.describe("Rep document replacement permissions", () => {
  test.describe.configure({ mode: "serial" });

  const repAEmail = `e2e-rep-doc-a-${Date.now()}@camply.test`;
  const repBEmail = `e2e-rep-doc-b-${Date.now()}@camply.test`;
  const parentAEmail = `e2e-rep-doc-parent-a-${Date.now()}@camply.test`;
  const parentBEmail = `e2e-rep-doc-parent-b-${Date.now()}@camply.test`;

  let campusAId: string;
  let campusBId: string;
  let repAId: string;
  let repBId: string;
  let parentAId: string;
  let parentBId: string;
  let registrationAId: string;
  let registrationBId: string;
  let documentAId: string;
  let documentBId: string;
  let requirementId: string;

  test.beforeAll(async () => {
    const { organizationId, campId } = await getFixtureOrgContext();

    const campusA = await prisma.campus.create({
      data: { name: `E2E Rep Doc Campus A ${Date.now()}`, slug: `e2e-rep-doc-a-${Date.now()}`, address: "1 A St", city: "Testville", country: "Testland", organizationId },
    });
    campusAId = campusA.id;
    const campusB = await prisma.campus.create({
      data: { name: `E2E Rep Doc Campus B ${Date.now()}`, slug: `e2e-rep-doc-b-${Date.now()}`, address: "1 B St", city: "Testville", country: "Testland", organizationId },
    });
    campusBId = campusB.id;

    const password = await bcrypt.hash("password123", 10);
    const repAUser = await prisma.user.create({
      data: { email: repAEmail, password, role: "CAMPUS_REPRESENTATIVE", organizationId, managedCampuses: { connect: { id: campusAId } } },
    });
    repAId = repAUser.id;
    const repBUser = await prisma.user.create({
      data: { email: repBEmail, password, role: "CAMPUS_REPRESENTATIVE", organizationId, managedCampuses: { connect: { id: campusBId } } },
    });
    repBId = repBUser.id;

    const parentA = await prisma.user.create({ data: { email: parentAEmail, password: "x", role: "PARENT", organizationId } });
    parentAId = parentA.id;
    const parentB = await prisma.user.create({ data: { email: parentBEmail, password: "x", role: "PARENT", organizationId } });
    parentBId = parentB.id;

    const camperA = await prisma.camper.create({ data: { name: "E2E Rep Doc Camper A", userId: parentA.id, organizationId, homeCampusId: campusAId } });
    const camperB = await prisma.camper.create({ data: { name: "E2E Rep Doc Camper B", userId: parentB.id, organizationId, homeCampusId: campusBId } });

    const registrationA = await prisma.registration.create({ data: { camperId: camperA.id, campId, campusId: campusAId, status: "REQUIRES_ACTION" } });
    registrationAId = registrationA.id;
    const registrationB = await prisma.registration.create({ data: { camperId: camperB.id, campId, campusId: campusBId, status: "REQUIRES_ACTION" } });
    registrationBId = registrationB.id;

    const requirement = await prisma.documentRequirement.create({
      data: { campId, name: "Birth Certificate", required: true, acceptedFormats: "jpg,png,pdf", maxSizeMb: 2, scope: "REGISTRATION" },
    });
    requirementId = requirement.id;

    const docA = await prisma.document.create({
      data: { requirementId: requirement.id, registrationId: registrationA.id, url: "https://example.com/a.pdf", fileName: "a.pdf", fileType: "application/pdf", fileSize: 1024, uploadedById: parentA.id },
    });
    documentAId = docA.id;
    await prisma.documentAction.create({
      data: { documentId: docA.id, status: "REQUIRES_ACTION", reason: "Blurry", requestedById: repAId },
    });

    const docB = await prisma.document.create({
      data: { requirementId: requirement.id, registrationId: registrationB.id, url: "https://example.com/b.pdf", fileName: "b.pdf", fileType: "application/pdf", fileSize: 1024, uploadedById: parentB.id },
    });
    documentBId = docB.id;
    await prisma.documentAction.create({
      data: { documentId: docB.id, status: "REQUIRES_ACTION", reason: "Blurry", requestedById: repBId },
    });
  });

  test.afterAll(async () => {
    await prisma.documentAction.deleteMany({ where: { documentId: { in: [documentAId, documentBId] } } });
    await prisma.document.deleteMany({ where: { id: { in: [documentAId, documentBId] } } });
    await prisma.documentRequirement.deleteMany({ where: { id: requirementId } });
    await prisma.registration.deleteMany({ where: { id: { in: [registrationAId, registrationBId] } } });
    await prisma.camper.deleteMany({ where: { userId: { in: [parentAId, parentBId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [parentAId, parentBId, repAId, repBId] } } });
    await prisma.campus.deleteMany({ where: { id: { in: [campusAId, campusBId] } } });
  });

  test("rep A can replace a document on their managed campus", async ({ page }) => {
    await loginWithPassword(page, repAEmail, "password123");

    const res = await page.request.post("/api/trpc/document.replaceForRegistration?batch=1", {
      data: {
        "0": {
          json: {
            requirementId,
            registrationId: registrationAId,
            url: "https://example.com/replaced-a.pdf",
            fileName: "replaced-a.pdf",
            fileType: "application/pdf",
            fileSize: 1024,
            replacingDocumentId: documentAId,
          },
        },
      },
      headers: { "Content-Type": "application/json" },
    });

    expect(res.ok()).toBe(true);
    const action = await prisma.documentAction.findFirstOrThrow({ where: { documentId: documentAId } });
    expect(action.status).toBe("RESOLVED");
    expect(action.resolutionType).toBe("REP_UPLOAD");
  });

  test("Upload Replacement file input actually reaches the client-side requirement check", async ({ page }) => {
    // Regression test for a bug where listForRegistration never included `requirement`
    // on each Document, so RegistrationDocumentPanel's onChange handler's
    // `if (!file || !doc.requirement) return;` silently no-op'd on every file pick —
    // no error, no upload, nothing. Driving the real file <input> (not the tRPC
    // mutation directly, which is what the other tests in this file do and which
    // never exercised this code path) with an oversized file proves `doc.requirement`
    // reached the client: the size-limit error can only fire if it did.
    await loginWithPassword(page, repAEmail, "password123");
    await page.goto(`/campus-rep-dashboard/registrations`);
    await page.getByRole("heading", { name: "Registrations" }).first().waitFor({ state: "visible", timeout: 15000 });
    await page.getByRole("button", { name: "List View" }).click();
    // Clear any default review-state filter (e.g. a TWO_STEP org defaults reviewers
    // to "Pending") so this REQUIRES_ACTION fixture registration is guaranteed visible.
    await page.locator("select").first().selectOption("");

    const row = page.locator("tr", { hasText: "E2E Rep Doc Camper A" });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Registration Details" })).toBeVisible({ timeout: 10000 });
    await dialog.getByRole("button", { name: /Documents/ }).click();

    const fileInput = dialog.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: "too-big.pdf",
      mimeType: "application/pdf",
      // requirement.maxSizeMb is 2 — 3MB deliberately exceeds it.
      buffer: Buffer.alloc(3 * 1024 * 1024, 1),
    });

    await expect(dialog.getByText(/File exceeds the maximum size of 2 MB/i)).toBeVisible({ timeout: 10000 });
  });

  test("rep A is FORBIDDEN from replacing a document on another campus", async ({ page }) => {
    await loginWithPassword(page, repAEmail, "password123");

    const res = await page.request.post("/api/trpc/document.replaceForRegistration?batch=1", {
      data: {
        "0": {
          json: {
            requirementId,
            registrationId: registrationBId,
            url: "https://example.com/replaced-b.pdf",
            fileName: "replaced-b.pdf",
            fileType: "application/pdf",
            fileSize: 1024,
            replacingDocumentId: documentBId,
          },
        },
      },
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status()).toBe(403);
    const action = await prisma.documentAction.findFirstOrThrow({ where: { documentId: documentBId } });
    expect(action.status).toBe("REQUIRES_ACTION");
  });
});
