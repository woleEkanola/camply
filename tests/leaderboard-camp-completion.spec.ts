import { test, expect } from "@playwright/test";
import { loginWithPassword, getFixtureOrgContext, expectSettingsSaved, prisma } from "./helpers";

/**
 * PR 10 — camp completion (the spec's last unimplemented automatic scoring
 * trigger), the campus ranking weights, and the expanded per-category weight
 * editor.
 */
test.describe("Leaderboard camp completion and campus weights (PR 10)", () => {
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now();
  let campId: string;
  let campusId: string;
  let organizationId: string;

  // A dedicated CHECKED_IN camper fixture, not a borrowed shared-org
  // registration. Before this, the fixture org had ZERO eligible
  // registrations, so "the manual Award Camp Completion button records real
  // score events" only ever proved the staff path (162 seeded APPROVED
  // staff) — it never actually exercised camper scoring, the thing camp
  // completion exists for.
  let tribeId: string;
  let registrationId: string;
  let parentEmail: string;
  let tribePointsBefore = 0;

  // Since PR14, awarding camp completion also transitions CHECKED_IN
  // registrations to COMPLETED — and this spec runs against the *shared*
  // fixture org, so without snapshotting and restoring these it would
  // permanently mutate seeded data that other specs (and manual testing)
  // depend on being CHECKED_IN. Kept even though the shared org currently has
  // none, as a defensive guard against that changing.
  let checkedInBefore: string[] = [];

  test.beforeAll(async () => {
    ({ campId, campusId, organizationId } = await getFixtureOrgContext());
    await prisma.leaderboardSettings.deleteMany({ where: { campId } });
    checkedInBefore = (
      await prisma.registration.findMany({ where: { campId, status: "CHECKED_IN", deletedAt: null }, select: { id: true } })
    ).map((r) => r.id);

    const tribe = await prisma.tribe.create({ data: { campId, name: `E2E Completion Tribe ${stamp}` } });
    tribeId = tribe.id;
    tribePointsBefore = tribe.points;

    parentEmail = `e2e-completion-parent-${stamp}@camply.test`;
    const parentUser = await prisma.user.create({
      data: { email: parentEmail, password: "unused", role: "PARENT", organizationId },
    });
    const camper = await prisma.camper.create({
      data: {
        name: `E2E Completion Camper ${stamp}`,
        firstName: "E2E",
        lastName: `Completion${stamp}`,
        dateOfBirth: new Date(2013, 5, 1),
        gender: "MALE",
        userId: parentUser.id,
        organizationId,
        homeCampusId: campusId,
      },
    });
    const registration = await prisma.registration.create({
      data: { camperId: camper.id, campId, campusId, tribeId, status: "CHECKED_IN", checkedInAt: new Date() },
    });
    registrationId = registration.id;
  });

  test.afterAll(async () => {
    await prisma.registration.updateMany({ where: { id: { in: checkedInBefore } }, data: { status: "CHECKED_IN" } });
    await prisma.auditLog.deleteMany({ where: { registrationId: { in: checkedInBefore }, action: "REGISTRATION_COMPLETED" } });
    await prisma.auditLog.deleteMany({ where: { registrationId, action: "REGISTRATION_COMPLETED" } });
    await prisma.scoreEvent.deleteMany({ where: { campId, categoryId: "seed-cat-camp-completion" } });
    await prisma.auditLog.deleteMany({ where: { action: "LEADERBOARD_CAMP_COMPLETION" } });
    await prisma.leaderboardSettings.deleteMany({ where: { campId } });
    await prisma.leaderboardStat.deleteMany({ where: { subjectId: { in: [tribeId, registrationId] } } });
    await prisma.registration.deleteMany({ where: { id: registrationId } });
    await prisma.camper.deleteMany({ where: { name: `E2E Completion Camper ${stamp}` } });
    await prisma.user.deleteMany({ where: { email: parentEmail } });
    // recordScoreEvent increments Tribe.points but deleting the ScoreEvent
    // above does not decrement it — confirmed by direct probe (before=0,
    // afterAward=7, afterEventDelete=7, still 7). Restore explicitly rather
    // than deleting the tribe and hoping nothing else references it mid-run.
    await prisma.tribe.update({ where: { id: tribeId }, data: { points: tribePointsBefore } });
    await prisma.tribe.deleteMany({ where: { id: tribeId } });
  });

  test("admin configures completion mode and points, and they persist", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/leaderboard/admin");
    await page.getByRole("tab", { name: "Settings" }).click();

    await expect(page.getByRole("heading", { name: "Camp Completion" })).toBeVisible();
    await page.locator("#completion-mode").selectOption("CHECKOUT");
    await page.locator("#completion-points").fill("75");

    // Two back-to-back mutations sharing one toast — see expectSettingsSaved.
    await expectSettingsSaved(campId, (s) => s?.completionMode === "CHECKOUT" && s?.completionPoints === 75);
  });

  test("the manual Award Camp Completion button records real score events, for campers not just staff", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/leaderboard/admin");
    await page.getByRole("tab", { name: "Settings" }).click();

    await page.getByRole("button", { name: "Award Camp Completion Now" }).click();
    // PR14 widened this toast to also report status transitions, so it now
    // reads "Camp completion: N camper(s) and M staff scored, …".
    await expect(page.getByText(/Camp completion:/)).toBeVisible({ timeout: 20000 });

    const events = await prisma.scoreEvent.findMany({ where: { campId, categoryId: "seed-cat-camp-completion" } });
    expect(events.length).toBeGreaterThan(0);
    // Every award carries a stable completion:* idempotency key.
    expect(events.every((e) => e.idempotencyKey?.startsWith("completion:"))).toBe(true);

    // The point of this fixture: assert the CAMPER path specifically, not
    // just that *some* events exist. Before this spec seeded its own
    // CHECKED_IN camper, the fixture org had zero eligible registrations, so
    // this assertion would have silently passed on staff awards alone —
    // exactly what let a real bug (scoring APPROVED-but-never-checked-in
    // campers) ship unnoticed.
    const camperEvent = events.find((e) => e.registrationId === registrationId);
    expect(camperEvent).toBeDefined();
    expect(camperEvent!.idempotencyKey).toBe(`completion:${registrationId}`);

    const registration = await prisma.registration.findUniqueOrThrow({ where: { id: registrationId } });
    expect(registration.status).toBe("COMPLETED");

    // Pressing again must not double-credit.
    const before = events.length;
    await page.getByRole("button", { name: "Award Camp Completion Now" }).click();
    await expect(page.getByText(/Camp completion: 0 camper\(s\) and 0 staff scored/)).toBeVisible({ timeout: 20000 });
    const after = await prisma.scoreEvent.count({ where: { campId, categoryId: "seed-cat-camp-completion" } });
    expect(after).toBe(before);
  });

  test("campus ranking weights are editable and shown read-only on the Rules tab", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/leaderboard/admin");
    await page.getByRole("tab", { name: "Settings" }).click();

    await expect(page.getByText("Campus Ranking (sort order)")).toBeVisible();
    await page.locator("#campusMetricWeights-attendancePct").fill("44");

    await expectSettingsSaved(campId, (s) => (s?.campusMetricWeights as any)?.attendancePct === 44);

    await page.goto("/leaderboard");
    await page.getByRole("tab", { name: "Rules" }).click();
    const campusWeights = page.locator("div", { has: page.getByRole("heading", { name: "Campus Ranking" }) }).last();
    await expect(campusWeights.getByText("44", { exact: true })).toBeVisible();
  });

  test("the Rules tab names the per-category metrics and defines the derived ones", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/leaderboard");
    await page.getByRole("tab", { name: "Rules" }).click();

    await expect(page.getByText("Bible Quiz").first()).toBeVisible();
    await expect(page.getByText("Camper Attendance").first()).toBeVisible();
    // PR13 replaced the "not tracked anywhere yet" disclaimer with actual
    // definitions, since both metrics now have real measurements behind them.
    await expect(page.getByText(/different activities someone has earned points in/)).toBeVisible();
    await expect(page.getByText(/attendance sessions a teacher actually ran/)).toBeVisible();
  });
});
