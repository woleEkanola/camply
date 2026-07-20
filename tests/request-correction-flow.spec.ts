import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";
import { submitRegistration } from "../src/server/registration/engine";

test.describe("Request correction & resubmission flow", () => {
  const stamp = Date.now();
  const parentEmail = `e2e-correction-parent-${stamp}@camply.test`;
  const parentPassword = "password123";
  let organizationId: string;
  let campId: string;
  let campusId: string;
  let camperId: string;
  let registrationId: string;
  let parentUserId: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;
    campusId = ctx.campusId;

    const hashed = await bcrypt.hash(parentPassword, 10);
    const parent = await prisma.user.create({
      data: {
        email: parentEmail,
        password: hashed,
        role: "PARENT",
        organizationId,
        active: true,
        firstName: "E2E",
        lastName: "Correction",
      },
    });
    parentUserId = parent.id;

    const camper = await prisma.camper.create({
      data: {
        name: `E2E Correction Camper ${stamp}`,
        firstName: "E2E",
        lastName: "Correction",
        dateOfBirth: new Date(2012, 5, 15),
        gender: "Female",
        userId: parent.id,
        organizationId,
        homeCampusId: campusId,
      },
    });
    camperId = camper.id;

    // Create registration in REQUIRES_ACTION status directly
    const registration = await prisma.registration.create({
      data: {
        camperId: camper.id,
        campId,
        campusId,
        status: "REQUIRES_ACTION",
        correctionRequest: "Please update profile details.",
      },
    });
    registrationId = registration.id;

    // Fulfill any required documents for this camp
    const reqs = await prisma.documentRequirement.findMany({ where: { campId, required: true } });
    for (const req of reqs) {
      await prisma.document.create({
        data: {
          requirementId: req.id,
          registrationId: registration.id,
          camperId: camper.id,
          url: "https://example.com/doc.pdf",
          fileName: "doc.pdf",
          fileType: "application/pdf",
          fileSize: 1024,
          uploadedById: parent.id,
        },
      });
    }
  });

  test.afterAll(async () => {
    await prisma.registration.deleteMany({ where: { id: registrationId } });
    await prisma.camper.deleteMany({ where: { id: camperId } });
    await prisma.user.deleteMany({ where: { email: parentEmail } });
  });

  test("submitRegistration delegates to resubmitRegistration for REQUIRES_ACTION status", async () => {
    // Verify engine level resubmission for REQUIRES_ACTION
    const result = await submitRegistration({
      registrationId,
      actorId: parentUserId,
    });
    expect(result.status).toBe("PENDING");
    expect(result.correctionRequest).toBeNull();
  });

  test("parent sees dashboard status and can navigate to resubmit", async ({ page }) => {
    await loginWithPassword(page, parentEmail, parentPassword);
    await page.goto("/dashboard");

    // Parent sees camper card and status
    await expect(page.getByText(`E2E Correction Camper ${stamp}`).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Continue Registration" }).first()).toBeVisible();
  });
});
