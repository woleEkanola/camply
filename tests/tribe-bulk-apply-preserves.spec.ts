import { test, expect } from "@playwright/test";
import {
  loginWithPassword,
  getFixtureOrgContext,
  switchRegistrationsToListView,
  onlyVisible,
  prisma,
  resetSystemFieldDefaults,
  relaxRequiredCustomFields,
  restoreRequiredCustomFields,
} from "./helpers";
import * as regEngine from "../src/server/registration/engine";
import * as tribeEngine from "../src/server/tribe/engine";

// The actual reported bug: selecting registrations on /admin/registrations
// and clicking "Suggest Tribes" -> "Apply Tribes" used to silently move
// campers who already had a tribe, mid-campaign, which is how some campers
// ended up with a real-but-wrong tribe in a bulk email. This reproduces the
// exact call shape (explicit registrationIds via the UI's bulk action bar)
// and asserts the already-assigned camper is now preserved by default, with
// an explicit "Reassign anyway" step required to move them.
test.describe("Apply Tribes preserves an already-assigned camper by default", () => {
  test.describe.configure({ mode: "serial" });

  let originalTribeId: string;
  let targetTribeId: string;
  let assignedCamperName: string;
  let assignedCamperId: string;
  let assignedRegistrationId: string;
  let freshCamperName: string;
  let freshCamperId: string;
  let freshRegistrationId: string;
  let parentUserId: string;
  let relaxedCustomFields: { id: string; required: boolean }[] = [];
  let relaxedDocRequirements: { id: string; required: boolean }[] = [];

  test.beforeAll(async () => {
    const { organizationId, campId, campusId } = await getFixtureOrgContext();

    await resetSystemFieldDefaults("CAMPER");
    relaxedCustomFields = await relaxRequiredCustomFields("CAMPER");
    const camp = await prisma.camp.findUniqueOrThrow({ where: { id: campId }, include: { documentRequirements: true } });
    const requiredDocs = camp.documentRequirements.filter((r) => r.required && !r.deletedAt);
    relaxedDocRequirements = requiredDocs.map((r) => ({ id: r.id, required: r.required }));
    if (requiredDocs.length > 0) {
      await prisma.documentRequirement.updateMany({ where: { id: { in: requiredDocs.map((r) => r.id) } }, data: { required: false } });
    }

    const stamp = Date.now();
    const originalTribe = await prisma.tribe.create({ data: { campId, name: `E2E Original ${stamp}` } });
    const targetTribe = await prisma.tribe.create({ data: { campId, name: `E2E Target ${stamp}` } });
    originalTribeId = originalTribe.id;
    targetTribeId = targetTribe.id;

    const parent = await prisma.user.create({
      data: { email: `e2e-tribe-bulk-parent-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId },
    });
    parentUserId = parent.id;

    assignedCamperName = `E2E Bulk Assigned ${stamp}`;
    const assignedCamper = await prisma.camper.create({
      data: { name: assignedCamperName, firstName: "E2E", lastName: `Assigned${stamp}`, dateOfBirth: new Date(2013, 5, 1), gender: "MALE", userId: parentUserId, organizationId, homeCampusId: campusId },
    });
    assignedCamperId = assignedCamper.id;
    const assignedDraft = await regEngine.createDraft({ camperId: assignedCamperId, campId, campusId, actorId: parentUserId });
    const assignedReg = await regEngine.submitRegistration({ registrationId: assignedDraft.id, actorId: parentUserId });
    assignedRegistrationId = assignedReg.id;
    await tribeEngine.assignTribe({ registrationId: assignedRegistrationId, tribeId: originalTribeId, actorId: parentUserId });
    // Set the suggestion directly (bypassing the population-balancer's exact
    // pick) so the test controls which tribe "Apply" would move this camper
    // to, deterministically.
    await prisma.registration.update({ where: { id: assignedRegistrationId }, data: { suggestedTribeId: targetTribeId } });

    freshCamperName = `E2E Bulk Fresh ${stamp}`;
    const freshCamper = await prisma.camper.create({
      data: { name: freshCamperName, firstName: "E2E", lastName: `Fresh${stamp}`, dateOfBirth: new Date(2013, 5, 1), gender: "FEMALE", userId: parentUserId, organizationId, homeCampusId: campusId },
    });
    freshCamperId = freshCamper.id;
    const freshDraft = await regEngine.createDraft({ camperId: freshCamperId, campId, campusId, actorId: parentUserId });
    const freshReg = await regEngine.submitRegistration({ registrationId: freshDraft.id, actorId: parentUserId });
    freshRegistrationId = freshReg.id;
    await prisma.registration.update({ where: { id: freshRegistrationId }, data: { suggestedTribeId: targetTribeId } });
  });

  test.afterAll(async () => {
    try {
      await prisma.sideEffect.deleteMany({ where: { registrationId: { in: [assignedRegistrationId, freshRegistrationId] } } });
      await prisma.registration.deleteMany({ where: { id: { in: [assignedRegistrationId, freshRegistrationId] } } });
      await prisma.camper.deleteMany({ where: { id: { in: [assignedCamperId, freshCamperId] } } });
      await prisma.user.deleteMany({ where: { id: parentUserId } });
      await prisma.tribe.deleteMany({ where: { id: { in: [originalTribeId, targetTribeId] } } });
      await restoreRequiredCustomFields(relaxedCustomFields);
      for (const r of relaxedDocRequirements) {
        await prisma.documentRequirement.updateMany({ where: { id: r.id }, data: { required: r.required } });
      }
    } catch {
      // best-effort cleanup
    }
  });

  test("Apply Tribes skips the already-assigned camper and offers an explicit reassign step", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/registrations");
    await switchRegistrationsToListView(page);

    const search = page.getByPlaceholder(/Name, email, or registration/i);
    await search.fill(assignedCamperName.split(" ")[0]);

    const assignedRow = page.locator("tr", { hasText: assignedCamperName }).first();
    await assignedRow.waitFor({ state: "visible", timeout: 15000 });
    await onlyVisible(assignedRow.getByLabel("Select row")).check();

    await search.fill("");
    await search.fill(freshCamperName.split(" ")[0]);
    const freshRow = page.locator("tr", { hasText: freshCamperName }).first();
    await freshRow.waitFor({ state: "visible", timeout: 15000 });
    await onlyVisible(freshRow.getByLabel("Select row")).check();

    await page.getByRole("button", { name: "Apply Tribes" }).click();

    // The skip summary + reassign offer.
    await expect(page.getByText(/skipped — already in a tribe/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "Reassign anyway" })).toBeVisible();

    const afterFirstApply = await prisma.registration.findUniqueOrThrow({ where: { id: assignedRegistrationId } });
    expect(afterFirstApply.tribeId).toBe(originalTribeId);
    const freshAfterApply = await prisma.registration.findUniqueOrThrow({ where: { id: freshRegistrationId } });
    expect(freshAfterApply.tribeId).toBe(targetTribeId);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Reassign anyway" }).click();

    // Not asserting on the banner text: the first (safe) Apply already left
    // "Assigned 1 registration(s)..." on screen, which this second call's
    // message would also match — that's the exact "stale toast" trap
    // documented in helpers.ts's expectSettingsSaved. Poll the DB instead.
    await expect
      .poll(async () => (await prisma.registration.findUniqueOrThrow({ where: { id: assignedRegistrationId } })).tribeId, { timeout: 15000 })
      .toBe(targetTribeId);

    const changeLog = await prisma.auditLog.findFirst({
      where: { registrationId: assignedRegistrationId, action: "TRIBE_CHANGED" },
      orderBy: { createdAt: "desc" },
    });
    expect(changeLog).toBeTruthy();
  });
});
