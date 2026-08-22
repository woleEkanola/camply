import { test, expect } from "@playwright/test";
import { getFixtureOrgContext, loginWithPassword, prisma } from "./helpers";

test.describe("Point event void (fraud/mistake normalization)", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  let campId = "";
  let tribeId = "";
  let categoryId = "";
  let tribeName = "";

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    campId = ctx.campId;
    const stamp = Date.now();
    tribeName = `E2E Void Tribe ${stamp}`;
    const tribe = await prisma.tribe.create({ data: { campId, name: tribeName, color: "#8B5CF6" } });
    tribeId = tribe.id;
    const category = await prisma.scoreCategory.create({ data: {
      campId, key: `E2E_VOID_SEED_${stamp}`, name: `Void Seed ${stamp}`, defaultPoints: 30, kind: "MANUAL", sortOrder: -100,
    } });
    categoryId = category.id;
  });

  test.afterAll(async () => {
    await prisma.scoreEvent.deleteMany({ where: { tribeId } });
    await prisma.leaderboardStat.deleteMany({ where: { subjectId: tribeId } });
    await prisma.scoreCategory.deleteMany({ where: { id: categoryId } });
    await prisma.tribe.deleteMany({ where: { id: tribeId } });
  });

  test("admin voids a fraudulent award from Point Activity — hidden from history, total corrected, audited", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/leaderboard/admin?tab=bulk-award");

    const tribeCheckbox = page.locator("label", { hasText: tribeName }).locator('input[type="checkbox"]');
    await tribeCheckbox.check();
    await page.locator("#bulk-category").selectOption(categoryId);
    await page.locator("#bulk-points").fill("50");
    await page.locator("#bulk-reason").fill("Fraudulent duplicate scan");
    await page.getByRole("button", { name: /Award to 1 tribe/ }).click();
    await expect.poll(async () => {
      const stat = await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "TRIBE", subjectId: tribeId, day: null } });
      return stat?.totalPoints;
    }).toBe(50);

    const event = await prisma.scoreEvent.findFirstOrThrow({ where: { tribeId, points: 50 } });

    await page.goto("/leaderboard/admin?tab=point-activity");
    const panel = page.getByTestId("point-activity-admin");
    await expect(panel).toBeVisible();
    // Scoped to <tr> specifically — the shared Table component dual-renders
    // a CSS-hidden mobile <ul>/<li> card list alongside the desktop <table>,
    // and `tr` only ever matches the desktop rows, so this can't accidentally
    // resolve to the hidden mobile markup at the default desktop viewport.
    const row = panel.locator("tr", { hasText: tribeName }).filter({ hasText: "+50" });
    await expect(row.first()).toBeVisible({ timeout: 10000 });

    page.once("dialog", (dialog) => dialog.accept("Duplicate award, confirmed by camp head"));
    await row.first().getByRole("button", { name: "Void" }).click();
    await expect(page.getByText("Point event voided.")).toBeVisible({ timeout: 10000 });

    // Total corrected — the +50 and its -50 compensation net to zero.
    await expect.poll(async () => {
      const stat = await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "TRIBE", subjectId: tribeId, day: null } });
      return stat?.totalPoints ?? 0;
    }).toBe(0);
    await expect.poll(async () => {
      const tribe = await prisma.tribe.findUniqueOrThrow({ where: { id: tribeId } });
      return tribe.points;
    }).toBe(0);

    // Hidden from the default (non-"Show voided") view.
    await expect(panel.locator("tr", { hasText: "+50" })).toHaveCount(0);

    // "Show voided" surfaces it again, struck through / labelled.
    await page.getByText("Show voided").click();
    await expect(panel.locator("tr", { hasText: tribeName }).filter({ hasText: "🚫" }).first()).toBeVisible({ timeout: 10000 });

    const updated = await prisma.scoreEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(updated.voidedAt).toBeTruthy();
    expect(updated.voidReason).toContain("Duplicate award");

    const auditRow = await prisma.auditLog.findFirst({
      where: { organizationId: (await getFixtureOrgContext()).organizationId, action: "LEADERBOARD_VOID", subjectId: event.id },
    });
    expect(auditRow).toBeTruthy();
    expect(auditRow?.reason).toContain("Duplicate award");
  });
});
