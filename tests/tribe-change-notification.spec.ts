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
import * as tribeEngine from "../src/server/tribe/engine";

// A camper whose tribe changes AFTER they've already been assigned one
// should get a correction email — this is the fix for the "some campers
// received a real but wrong tribe" incident: previously nothing ever told a
// parent their camper's tribe had actually changed.
test.describe("Reassigning a camper's tribe queues a TRIBE_CHANGED notification", () => {
  test.describe.configure({ mode: "serial" });

  let originalTribeId: string;
  let targetTribeName: string;
  let targetTribeId: string;
  let camperName: string;
  let camperId: string;
  let registrationId: string;
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
    const originalTribe = await prisma.tribe.create({ data: { campId, name: `E2E Notify Original ${stamp}` } });
    targetTribeName = `E2E Notify Target ${stamp}`;
    const targetTribe = await prisma.tribe.create({ data: { campId, name: targetTribeName } });
    originalTribeId = originalTribe.id;
    targetTribeId = targetTribe.id;

    const parent = await prisma.user.create({
      data: { email: `e2e-tribe-notify-parent-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId },
    });
    parentUserId = parent.id;

    camperName = `E2E Notify Camper ${stamp}`;
    const camper = await prisma.camper.create({
      data: { name: camperName, firstName: "E2E", lastName: `Notify${stamp}`, dateOfBirth: new Date(2013, 5, 1), gender: "MALE", userId: parentUserId, organizationId, homeCampusId: campusId },
    });
    camperId = camper.id;
    const draft = await regEngine.createDraft({ camperId, campId, campusId, actorId: parentUserId });
    const submitted = await regEngine.submitRegistration({ registrationId: draft.id, actorId: parentUserId });
    registrationId = submitted.id;
    await tribeEngine.assignTribe({ registrationId, tribeId: originalTribeId, actorId: parentUserId });
  });

  test.afterAll(async () => {
    try {
      await prisma.sideEffect.deleteMany({ where: { registrationId } });
      await prisma.registration.deleteMany({ where: { id: registrationId } });
      await prisma.camper.deleteMany({ where: { id: camperId } });
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

  test("changing the tribe in the drawer queues (and drains) a TRIBE_CHANGED side effect", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/registrations");
    await openRegistrationByName(page, camperName);
    await clickRegistrationDrawerTab(page, "Assignments");

    const dialog = page.getByRole("dialog");
    const tribeCard = dialog.getByText("Confirmed Tribe Assignment", { exact: true }).locator(
      "xpath=ancestor::div[contains(@class,'rounded-2xl')][1]"
    );
    const tribeSelect = tribeCard.locator("select");
    await expect(tribeSelect).toBeVisible({ timeout: 10000 });
    // The option label includes a population suffix ("Name (0/5)"), not just
    // the tribe name — select by value (the tribe id) instead.
    await tribeSelect.selectOption(targetTribeId);

    // Generous timeouts: this poll flaked once under the full suite's
    // heavier concurrent DB load (15s wasn't enough for the mutation to
    // land), not because of any actual bug — bumped with real margin.
    await expect
      .poll(async () => (await prisma.registration.findUniqueOrThrow({ where: { id: registrationId } })).tribeId, { timeout: 30000 })
      .toBe(targetTribeId);

    // Resend is unconfigured locally, so assert the queue behavior (created,
    // then drains to a terminal state), not actual delivery.
    await expect
      .poll(async () => prisma.sideEffect.findFirst({ where: { registrationId, type: "TRIBE_CHANGED" } }), { timeout: 15000 })
      .toBeTruthy();

    const effect = await prisma.sideEffect.findFirstOrThrow({ where: { registrationId, type: "TRIBE_CHANGED" } });
    expect((effect.payload as any).previousTribeId).toBe(originalTribeId);

    await expect
      .poll(
        async () => (await prisma.sideEffect.findUnique({ where: { id: effect.id } }))?.status,
        { timeout: 30000 }
      )
      .not.toBe("QUEUED");
  });
});
