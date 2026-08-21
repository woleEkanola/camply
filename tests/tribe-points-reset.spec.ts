import { test, expect } from "@playwright/test";
import { getFixtureOrgContext, loginWithPassword, prisma } from "./helpers";

test.describe("Tribe points reset and deduction", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  let campId = "";
  let tribeAId = "";
  let tribeBId = "";
  let categoryId = "";
  let tribeAName = "";
  let tribeBName = "";

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    campId = ctx.campId;
    const stamp = Date.now();
    tribeAName = `E2E Reset Tribe A ${stamp}`;
    tribeBName = `E2E Reset Tribe B ${stamp}`;

    const tribeA = await prisma.tribe.create({ data: { campId, name: tribeAName, color: "#F59E0B" } });
    tribeAId = tribeA.id;
    const tribeB = await prisma.tribe.create({ data: { campId, name: tribeBName, color: "#10B981" } });
    tribeBId = tribeB.id;

    const category = await prisma.scoreCategory.create({ data: {
      campId, key: `E2E_RESET_SEED_${stamp}`, name: `Reset Seed ${stamp}`, defaultPoints: 30, kind: "MANUAL", sortOrder: -100,
    } });
    categoryId = category.id;
  });

  test.afterAll(async () => {
    await prisma.scoreEvent.deleteMany({ where: { OR: [{ tribeId: tribeAId }, { tribeId: tribeBId }] } });
    await prisma.leaderboardStat.deleteMany({ where: { OR: [{ subjectId: tribeAId }, { subjectId: tribeBId }] } });
    const adjustmentCategory = await prisma.scoreCategory.findFirst({ where: { campId, key: { equals: "LEADERBOARD_ADJUSTMENT", mode: "insensitive" } } });
    await prisma.scoreCategory.deleteMany({ where: { id: categoryId } });
    // The lazily-created adjustment category is shared/reusable camp-wide
    // infrastructure (like the attendance category), not this test's own
    // fixture — leave it in place for other specs/admins to reuse.
    void adjustmentCategory;
    await prisma.tribe.deleteMany({ where: { id: { in: [tribeAId, tribeBId] } } });
  });

  async function seedTribePoints(tribeId: string, points: number) {
    await prisma.scoreEvent.create({ data: {
      campId, tribeId, categoryId, points, source: "MANUAL", day: new Date(),
    } });
    // Mirror the Tribe.points denormalized counter and LeaderboardStat the
    // way recordScoreEvent does, since we're seeding directly via Prisma
    // rather than through that write path. No @@unique on LeaderboardStat's
    // (campId, subjectType, subjectId, day) — find-then-create/update.
    await prisma.tribe.update({ where: { id: tribeId }, data: { points: { increment: points } } });
    const existing = await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "TRIBE", subjectId: tribeId, day: null } });
    if (existing) await prisma.leaderboardStat.update({ where: { id: existing.id }, data: { totalPoints: { increment: points } } });
    else await prisma.leaderboardStat.create({ data: { campId, subjectType: "TRIBE", subjectId: tribeId, totalPoints: points } });
  }

  test("admin deducts points from a tribe via Bulk Award, then resets it to zero, leaving other tribes untouched", async ({ page }) => {
    await seedTribePoints(tribeAId, 100);
    await seedTribePoints(tribeBId, 60);

    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/leaderboard/admin?tab=bulk-award");

    // Deduct via the existing negative-points bulk award path.
    const tribeCheckbox = page.locator("label", { hasText: tribeAName }).locator('input[type="checkbox"]');
    await tribeCheckbox.check();
    await page.locator("#bulk-category").selectOption(categoryId);
    await page.locator("#bulk-points").fill("-40");
    await page.locator("#bulk-reason").fill("Rule violation");
    await page.getByRole("button", { name: /Award to 1 tribe/ }).click();
    await expect.poll(async () => {
      const stat = await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "TRIBE", subjectId: tribeAId, day: null } });
      return stat?.totalPoints;
    }).toBe(60);

    // Reset that same tribe to zero via the new dedicated control.
    await page.locator("#reset-tribe").selectOption(tribeAId);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("reset-tribe-button").click();
    await expect.poll(async () => {
      const stat = await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "TRIBE", subjectId: tribeAId, day: null } });
      return stat?.totalPoints;
    }).toBe(0);

    // Tribe B is untouched by tribe A's reset.
    const tribeBStat = await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "TRIBE", subjectId: tribeBId, day: null } });
    expect(tribeBStat?.totalPoints).toBe(60);

    const auditRows = await prisma.auditLog.findMany({ where: { organizationId: (await getFixtureOrgContext()).organizationId, action: { in: ["LEADERBOARD_AWARD", "LEADERBOARD_TRIBE_RESET"] }, subjectId: tribeAId }, orderBy: { createdAt: "desc" }, take: 5 });
    expect(auditRows.some((row) => row.action === "LEADERBOARD_TRIBE_RESET")).toBe(true);
    expect(auditRows.some((row) => row.action === "LEADERBOARD_AWARD")).toBe(true);

    // Reset ALL tribes — tribe B (still at 60) goes to zero too.
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("reset-all-tribes-button").click();
    await expect.poll(async () => {
      const stat = await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "TRIBE", subjectId: tribeBId, day: null } });
      return stat?.totalPoints;
    }).toBe(0);
  });
});
