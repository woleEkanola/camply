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
  // Since PR14, awarding camp completion also transitions CHECKED_IN
  // registrations to COMPLETED — and this spec runs against the *shared*
  // fixture org, so without snapshotting and restoring these it would
  // permanently mutate seeded data that other specs (and manual testing)
  // depend on being CHECKED_IN.
  let checkedInBefore: string[] = [];

  test.beforeAll(async () => {
    ({ campId } = await getFixtureOrgContext());
    await prisma.leaderboardSettings.deleteMany({ where: { campId } });
    checkedInBefore = (
      await prisma.registration.findMany({ where: { campId, status: "CHECKED_IN", deletedAt: null }, select: { id: true } })
    ).map((r) => r.id);
  });

  test.afterAll(async () => {
    await prisma.registration.updateMany({ where: { id: { in: checkedInBefore } }, data: { status: "CHECKED_IN" } });
    await prisma.auditLog.deleteMany({ where: { registrationId: { in: checkedInBefore }, action: "REGISTRATION_COMPLETED" } });
    await prisma.scoreEvent.deleteMany({ where: { campId, categoryId: "seed-cat-camp-completion" } });
    await prisma.auditLog.deleteMany({ where: { action: "LEADERBOARD_CAMP_COMPLETION" } });
    await prisma.leaderboardSettings.deleteMany({ where: { campId } });
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

  test("the manual Award Camp Completion button records real score events", async ({ page }) => {
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
