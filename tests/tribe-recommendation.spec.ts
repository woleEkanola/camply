import { test, expect } from "@playwright/test";
import {
  loginWithPassword,
  getFixtureOrgContext,
  openRegistrationByName,
  clickRegistrationDrawerTab,
  prisma,
  resetSystemFieldDefaults,
  relaxRequiredCustomFields,
  restoreRequiredCustomFields,
} from "./helpers";
import * as regEngine from "../src/server/registration/engine";

test.describe("Tribe recommendation — Accept on first click + button legibility", () => {
  test.describe.configure({ mode: "serial" });

  let camperName: string;
  let camperId: string;
  let registrationId: string;
  let tribeId: string;
  let parentUserId: string;
  let relaxedCustomFields: { id: string; required: boolean }[] = [];
  let relaxedDocRequirements: { id: string; required: boolean }[] = [];

  test.beforeAll(async () => {
    const { organizationId, campId, campusId } = await getFixtureOrgContext();

    // The shared fixture org's FormFields/DocumentRequirements accumulate
    // drift from prior sessions' admin edits (see helpers.ts) — reset/relax
    // them so a Prisma-created registration can pass submission validation
    // without driving the full signup wizard, which this spec doesn't need.
    await resetSystemFieldDefaults("CAMPER");
    relaxedCustomFields = await relaxRequiredCustomFields("CAMPER");

    const camp = await prisma.camp.findUniqueOrThrow({
      where: { id: campId },
      include: { documentRequirements: true },
    });
    const requiredDocs = camp.documentRequirements.filter((r) => r.required && !r.deletedAt);
    relaxedDocRequirements = requiredDocs.map((r) => ({ id: r.id, required: r.required }));
    if (requiredDocs.length > 0) {
      await prisma.documentRequirement.updateMany({
        where: { id: { in: requiredDocs.map((r) => r.id) } },
        data: { required: false },
      });
    }

    const tribe = await prisma.tribe.create({
      data: { campId, name: `E2E Accept Tribe ${Date.now()}` },
    });
    tribeId = tribe.id;

    const parent = await prisma.user.create({
      data: {
        email: `e2e-tribe-parent-${Date.now()}@camply.test`,
        password: "x",
        role: "PARENT",
        organizationId,
      },
    });
    parentUserId = parent.id;

    camperName = `E2E Tribe Camper ${Date.now()}`;
    const camper = await prisma.camper.create({
      data: {
        name: camperName,
        firstName: "E2E",
        lastName: `Tribe${Date.now()}`,
        dateOfBirth: new Date(2013, 5, 1),
        gender: "MALE",
        userId: parentUserId,
        organizationId,
        homeCampusId: campusId,
      },
    });
    camperId = camper.id;

    const draft = await regEngine.createDraft({
      camperId,
      campId,
      campusId,
      actorId: parentUserId,
    });
    const submitted = await regEngine.submitRegistration({
      registrationId: draft.id,
      actorId: parentUserId,
    });
    registrationId = submitted.id;
  });

  test.afterAll(async () => {
    try {
      await prisma.registration.deleteMany({ where: { id: registrationId } });
      await prisma.camper.deleteMany({ where: { id: camperId } });
      await prisma.user.deleteMany({ where: { id: parentUserId } });
      await prisma.tribe.deleteMany({ where: { id: tribeId } });
      await restoreRequiredCustomFields(relaxedCustomFields);
      for (const r of relaxedDocRequirements) {
        await prisma.documentRequirement.updateMany({ where: { id: r.id }, data: { required: r.required } });
      }
    } catch {
      // best-effort cleanup
    }
  });

  test("Accept Recommendation works on the first click, without regenerating first", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/registrations");

    await openRegistrationByName(page, camperName);
    await clickRegistrationDrawerTab(page, "Assignments");

    const dialog = page.getByRole("dialog");
    const acceptButton = dialog.getByRole("button", { name: "Accept Recommendation" });
    await expect(acceptButton).toBeVisible({ timeout: 10000 });

    // Deliberately do NOT click "Regenerate" first — the fresh registration has
    // no persisted suggestedTribeId yet, only the live preview from tribe.suggest.
    await acceptButton.click();

    await expect(dialog.getByText("ACCEPTED")).toBeVisible({ timeout: 10000 });

    const updated = await prisma.registration.findUniqueOrThrow({ where: { id: registrationId } });
    expect(updated.tribeRecommendationStatus).toBe("ACCEPTED");
    // The fixture camp may already have other tribes competing for the lowest-population
    // pick, so just assert a suggestion was persisted and accepted — not which tribe won.
    expect(updated.suggestedTribeId).toBeTruthy();
  });

  test("Request Correction and Reject buttons render with legible (non-white) text", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/registrations");

    await openRegistrationByName(page, camperName);

    const dialog = page.getByRole("dialog");
    const correctionButton = dialog.getByRole("button", { name: "Request Correction" });
    const rejectButton = dialog.getByRole("button", { name: "Reject" });
    await expect(correctionButton).toBeVisible();
    await expect(rejectButton).toBeVisible();

    const correctionColor = await correctionButton.evaluate((el) => getComputedStyle(el).color);
    const rejectColor = await rejectButton.evaluate((el) => getComputedStyle(el).color);

    expect(correctionColor).not.toBe("rgb(255, 255, 255)");
    expect(rejectColor).not.toBe("rgb(255, 255, 255)");
  });
});
