import { test, expect } from "@playwright/test";
import { getFixtureOrgContext, loginWithPassword, prisma } from "./helpers";

test.describe("Leaderboard subject reset (camper drains tribe/campus rollups)", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  let campId = "";
  let campusId = "";
  let tribeId = "";
  let categoryId = "";
  let registrationId = "";
  let camperId = "";
  let parentId = "";
  let camperName = "";

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    campId = ctx.campId;
    campusId = ctx.campusId;
    const stamp = Date.now();
    const tribe = await prisma.tribe.create({ data: { campId, name: `E2E Reset Subj Tribe ${stamp}` } });
    tribeId = tribe.id;
    const category = await prisma.scoreCategory.create({ data: {
      campId, key: `E2E_RESETSUBJ_SEED_${stamp}`, name: `Reset Subj Seed ${stamp}`, defaultPoints: 20, kind: "MANUAL", sortOrder: -100,
    } });
    categoryId = category.id;

    const parent = await prisma.user.create({ data: { email: `e2e-resetsubj-parent-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId: ctx.organizationId } });
    parentId = parent.id;
    camperName = `E2E Reset Subj Camper ${stamp}`;
    const camper = await prisma.camper.create({ data: { name: camperName, firstName: "E2E", lastName: `ResetSubj ${stamp}`, dateOfBirth: new Date(2013, 1, 1), gender: "MALE", userId: parent.id, organizationId: ctx.organizationId, homeCampusId: campusId } });
    camperId = camper.id;
    const registration = await prisma.registration.create({ data: { camperId: camper.id, campId, campusId, tribeId, status: "CHECKED_IN" } });
    registrationId = registration.id;
  });

  test.afterAll(async () => {
    await prisma.scoreEvent.deleteMany({ where: { tribeId } });
    await prisma.leaderboardStat.deleteMany({ where: { OR: [{ subjectId: tribeId }, { subjectId: registrationId }, { subjectId: campusId }] } });
    await prisma.scoreCategory.deleteMany({ where: { id: categoryId } });
    await prisma.registration.deleteMany({ where: { id: registrationId } });
    await prisma.camper.deleteMany({ where: { id: camperId } });
    await prisma.user.deleteMany({ where: { id: parentId } });
    await prisma.tribe.deleteMany({ where: { id: tribeId } });
  });

  async function seedCamperPoints(points: number) {
    await prisma.scoreEvent.create({ data: { campId, tribeId, campusId, registrationId, categoryId, points, source: "MANUAL", day: new Date() } });
    await prisma.tribe.update({ where: { id: tribeId }, data: { points: { increment: points } } });
    for (const [subjectType, subjectId] of [["CAMPER", registrationId], ["TRIBE", tribeId], ["CAMPUS", campusId]] as const) {
      const existing = await prisma.leaderboardStat.findFirst({ where: { campId, subjectType, subjectId, day: null } });
      if (existing) await prisma.leaderboardStat.update({ where: { id: existing.id }, data: { totalPoints: { increment: points } } });
      else await prisma.leaderboardStat.create({ data: { campId, subjectType, subjectId, totalPoints: points } });
    }
  }

  test("resetting a camper zeroes the camper and drains the same amount from their tribe and campus totals", async ({ page }) => {
    await seedCamperPoints(75);

    const before = {
      camper: await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "CAMPER", subjectId: registrationId, day: null } }),
      tribe: await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "TRIBE", subjectId: tribeId, day: null } }),
      campus: await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "CAMPUS", subjectId: campusId, day: null } }),
    };
    expect(before.camper?.totalPoints).toBe(75);
    expect(before.tribe?.totalPoints).toBeGreaterThanOrEqual(75);
    expect(before.campus?.totalPoints).toBeGreaterThanOrEqual(75);

    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/leaderboard/admin?tab=bulk-award");

    await page.locator("#reset-subject-type").selectOption("CAMPER");
    // Option label includes a live points suffix ("Name — 75 pts"), so match
    // by contained text and select on its actual value rather than a full label.
    const option = page.locator("#reset-subject-id option", { hasText: camperName });
    await expect(option).toHaveCount(1, { timeout: 10000 });
    const value = await option.getAttribute("value");
    await page.locator("#reset-subject-id").selectOption(value!);
    await page.locator("#reset-subject-reason").fill("Duplicate award removed");

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("reset-subject-button").click();
    await expect(page.getByText(/Subject reset to zero\./)).toBeVisible({ timeout: 10000 });

    await expect.poll(async () => {
      const stat = await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "CAMPER", subjectId: registrationId, day: null } });
      return stat?.totalPoints ?? 0;
    }).toBe(0);

    // Tribe/campus totals drained by exactly the camper's contribution (75).
    await expect.poll(async () => {
      const stat = await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "TRIBE", subjectId: tribeId, day: null } });
      return stat?.totalPoints ?? 0;
    }).toBe((before.tribe?.totalPoints ?? 0) - 75);
    await expect.poll(async () => {
      const stat = await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "CAMPUS", subjectId: campusId, day: null } });
      return stat?.totalPoints ?? 0;
    }).toBe((before.campus?.totalPoints ?? 0) - 75);

    const auditRow = await prisma.auditLog.findFirst({
      where: { organizationId: (await getFixtureOrgContext()).organizationId, action: "LEADERBOARD_SUBJECT_RESET", subjectId: registrationId },
    });
    expect(auditRow).toBeTruthy();
  });
});
