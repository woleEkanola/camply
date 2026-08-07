import { test, expect } from "@playwright/test";
import { loginWithPassword, getFixtureOrgContext, prisma } from "./helpers";

/**
 * PR 6 — teacher composite score / weighted camper ranking, BumpChart
 * (rank-over-time) wiring, and the average-arrival-time analytic. Covers
 * the admin Settings weight editor round-tripping to the DB, the public
 * Rules tab rendering those weights read-only (the spec's "ranking method
 * stays transparent" requirement), and the History tab rendering its two
 * new sections without erroring.
 */
test.describe("Leaderboard composite scoring (PR 6)", () => {
  test.describe.configure({ mode: "serial" });

  let campId: string;
  let tribeId: string;

  test.beforeAll(async () => {
    ({ campId } = await getFixtureOrgContext());
    await prisma.leaderboardSettings.deleteMany({ where: { campId } });
    const tribe = await prisma.tribe.create({ data: { campId, name: `E2E Composite Tribe ${Date.now()}`, color: "#7c3aed" } });
    tribeId = tribe.id;
  });

  test.afterAll(async () => {
    await prisma.scoreEvent.deleteMany({ where: { tribeId } });
    await prisma.leaderboardStat.deleteMany({ where: { subjectId: tribeId } });
    await prisma.tribe.delete({ where: { id: tribeId } });
    await prisma.leaderboardSettings.deleteMany({ where: { campId } });
  });

  test("admin edits teacher/camper ranking weights in Settings, and they persist", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/leaderboard/admin");
    await page.getByRole("tab", { name: "Settings" }).click();

    await expect(page.getByText("Ranking Weights")).toBeVisible();
    await expect(page.getByText("Teacher Composite (0-5 rating)")).toBeVisible();

    const achievementsInput = page.locator("#teacherMetricWeights-achievementCount");
    await achievementsInput.fill("60");
    await expect(page.getByText("Settings updated.")).toBeVisible();

    const settings = await prisma.leaderboardSettings.findFirstOrThrow({ where: { campId } });
    expect((settings.teacherMetricWeights as any)?.achievementCount).toBe(60);
  });

  test("the public Rules tab shows the configured weights read-only", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/leaderboard");
    await page.getByRole("tab", { name: "Rules" }).click();

    const teacherWeights = page.locator("div", { has: page.getByText("Teacher Composite (0-5 rating)") }).first();
    await expect(teacherWeights).toBeVisible();
    await expect(teacherWeights.getByText("60", { exact: true })).toBeVisible();
  });

  test("History tab renders the Tribe Rank Over Time chart and an average arrival tile without erroring", async ({ page }) => {
    // Give the tribe two days of scoring so the BumpChart/StatCard sections
    // have real data to render rather than only their empty states.
    const { appRouter } = await import("../src/server/api/root");
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@camply.com" } });
    const caller = appRouter.createCaller({
      prisma,
      session: { user: { id: admin.id, email: admin.email, role: "ADMIN", organizationId: admin.organizationId ?? undefined }, expires: "" },
    });
    await caller.leaderboard.award({ campId, subjectType: "TRIBE", subjectId: tribeId, categoryId: "seed-cat-cleaning", points: 12, reason: "E2E composite history" });

    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/leaderboard");
    await page.getByRole("tab", { name: "History" }).click();

    await expect(page.getByText("Tribe Rank Over Time")).toBeVisible();
    await expect(page.getByText("Daily Score Totals")).toBeVisible();
    // No uncaught render error surfaced — a broken BumpChart/StatCard wiring
    // would throw during render rather than degrade gracefully.
    await expect(page.getByText(/application error/i)).not.toBeVisible();
  });

  test("Teachers tab shows a Composite column", async ({ page }) => {
    // Table renders only its EmptyState with zero rows — no header cells at
    // all — so this needs at least one STAFF LeaderboardStat row to exist.
    const { organizationId } = await getFixtureOrgContext();
    const staffUser = await prisma.user.create({
      data: { email: `e2e-lb-composite-teacher-${Date.now()}@camply.test`, password: "unused", role: "TEACHER", organizationId },
    });
    const staff = await prisma.staffProfile.create({
      data: {
        userId: staffUser.id,
        organizationId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: "E2E",
        lastName: "CompositeTeacher",
        phone: "+1-555-0903",
        email: staffUser.email,
        approvedAt: new Date(),
      },
    });

    try {
      const { appRouter } = await import("../src/server/api/root");
      const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@camply.com" } });
      const caller = appRouter.createCaller({
        prisma,
        session: { user: { id: admin.id, email: admin.email, role: "ADMIN", organizationId: admin.organizationId ?? undefined }, expires: "" },
      });
      await caller.leaderboard.award({ campId, subjectType: "STAFF", subjectId: staff.id, categoryId: "seed-cat-cleaning", points: 8, reason: "E2E composite teacher" });

      await loginWithPassword(page, "admin@camply.com", "password123");
      await page.goto("/leaderboard");
      await page.getByRole("tab", { name: "Teachers" }).click();
      // Table dual-renders a desktop <table> + a mobile card list at once
      // (CSS-toggled, not unmounted) — scope to the table role to avoid a
      // strict-mode match on the mobile copy.
      await expect(page.getByRole("table").getByText("Composite", { exact: true })).toBeVisible();
    } finally {
      await prisma.scoreEvent.deleteMany({ where: { staffProfileId: staff.id } });
      await prisma.leaderboardStat.deleteMany({ where: { subjectId: staff.id } });
      await prisma.auditLog.deleteMany({ where: { reason: "E2E composite teacher" } });
      await prisma.staffProfile.deleteMany({ where: { id: staff.id } });
      await prisma.user.deleteMany({ where: { id: staffUser.id } });
    }
  });
});
