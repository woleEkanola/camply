import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

test.describe("Document Zoom Lightbox Modal E2E", () => {
  const stamp = Date.now();
  const adminEmail = `e2e-doczoom-admin-${stamp}@camply.test`;
  const adminPassword = "password123";
  let organizationId: string;
  let campusId: string;
  let camperId: string;
  let registrationId: string;
  let documentId: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campusId = ctx.campusId;

    const hashed = await bcrypt.hash(adminPassword, 10);
    await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashed,
        role: "ADMIN",
        organizationId,
        active: true,
        firstName: "DocZoomAdmin",
        lastName: "User",
      },
    });

    const parent = await prisma.user.create({
      data: {
        email: `doczoomparent-${stamp}@test.com`,
        password: hashed,
        role: "PARENT",
        organizationId,
        active: true,
      },
    });

    const camper = await prisma.camper.create({
      data: {
        name: `ZoomDoc Camper ${stamp}`,
        firstName: "ZoomDoc",
        lastName: "Camper",
        userId: parent.id,
        organizationId,
        homeCampusId: campusId,
      },
    });
    camperId = camper.id;

    // Create a camp if needed
    let camp = await prisma.camp.findFirst({ where: { organizationId, deletedAt: null } });
    if (!camp) {
      camp = await prisma.camp.create({
        data: {
          name: `DocZoom Camp ${stamp}`,
          organizationId,
          slug: `doczoom-camp-${stamp}`,
          year: new Date().getFullYear(),
          startDate: new Date(),
          endDate: new Date(),
        },
      });
    }

    const reg = await prisma.registration.create({
      data: {
        camperId: camper.id,
        campusId,
        campId: camp.id,
        status: "PENDING",
        registrationNumber: `REG-ZOOM-${stamp}`,
      },
    });
    registrationId = reg.id;

    // Create a document requirement and uploaded document
    const req = await prisma.documentRequirement.create({
      data: {
        campId: camp.id,
        name: "Proof of Identity",
        description: "Upload ID card or Passport",
        required: true,
      },
    });

    const doc = await prisma.document.create({
      data: {
        registrationId: reg.id,
        requirementId: req.id,
        uploadedById: parent.id,
        fileName: "sample_passport_id.png",
        fileType: "image/png",
        fileSize: 102400,
        url: "https://via.placeholder.com/800x600.png?text=Passport+ID+Sample",
        status: "PENDING",
      },
    });
    documentId = doc.id;
  });

  test.afterAll(async () => {
    if (documentId) await prisma.document.deleteMany({ where: { id: documentId } });
    if (registrationId) await prisma.registration.deleteMany({ where: { id: registrationId } });
    if (camperId) await prisma.camper.deleteMany({ where: { id: camperId } });
    await prisma.user.deleteMany({ where: { email: { in: [adminEmail, `doczoomparent-${stamp}@test.com`] } } });
  });

  test("opens registration documents and tests zoom lightbox controls", async ({ page }) => {
    await loginWithPassword(page, adminEmail, adminPassword);

    // Deep-link directly to registration drawer
    await page.goto(`/admin/registrations?openReg=${registrationId}`);

    // Wait for registration drawer title
    await expect(page.getByText(`REG-ZOOM-${stamp}`).first()).toBeVisible({ timeout: 15000 });

    // Click Documents tab in registration drawer
    const docsTab = page.getByRole("tab", { name: /Documents/i });
    await expect(docsTab).toBeVisible({ timeout: 10000 });
    await docsTab.click();

    // Verify uploaded document is visible in panel
    await expect(page.getByText("sample_passport_id.png")).toBeVisible({ timeout: 10000 });

    // Click "View & Zoom" button
    const viewZoomBtn = page.getByRole("button", { name: /View & Zoom/i }).first();
    await expect(viewZoomBtn).toBeVisible({ timeout: 5000 });
    await viewZoomBtn.click();

    // Verify DocumentZoomModal is open with filename and initial 100% scale
    await expect(page.getByText("sample_passport_id.png").first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("100%").first()).toBeVisible({ timeout: 5000 });

    // Click Zoom In (+) button
    const zoomInBtn = page.getByTitle("Zoom In (+)");
    await expect(zoomInBtn).toBeVisible();
    await zoomInBtn.click();

    // Scale indicator should now show 125%
    await expect(page.getByText("125%").first()).toBeVisible({ timeout: 5000 });

    // Click Rotate (90°) button
    const rotateBtn = page.getByTitle("Rotate 90° (R)");
    await expect(rotateBtn).toBeVisible();
    await rotateBtn.click();

    // Click Reset View button
    const resetBtn = page.getByTitle("Reset View (0)");
    await expect(resetBtn).toBeVisible();
    await resetBtn.click();

    // Scale should reset to 100%
    await expect(page.getByText("100%").first()).toBeVisible({ timeout: 5000 });

    // Close Modal via Close button
    const closeBtn = page.getByTitle("Close (Esc)");
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    // Verify modal is closed
    await expect(page.getByText("100%").first()).not.toBeVisible();
  });
});
