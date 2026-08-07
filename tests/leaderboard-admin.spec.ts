import { test, expect } from "@playwright/test";
import { loginWithPassword, getFixtureOrgContext, prisma } from "./helpers";

test.describe("Leaderboard admin area", () => {
  test.describe.configure({ mode: "serial" });

  let campId: string;

  test.beforeAll(async () => {
    ({ campId } = await getFixtureOrgContext());
    // Leave settings clean for this camp before/after — other specs and
    // manual sessions may have touched it.
    await prisma.leaderboardSettings.deleteMany({ where: { campId } });
  });

  test.afterAll(async () => {
    await prisma.scoreCategory.deleteMany({ where: { campId, key: { startsWith: "E2E_" } } });
    await prisma.scoreRule.deleteMany({ where: { campId, stationId: "E2E_STATION" } });
    await prisma.leaderboardSettings.deleteMany({ where: { campId } });
  });

  test("admin creates a category, a rule with a live preview, and audits it", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/leaderboard/admin");

    await expect(page.getByRole("tab", { name: "Categories" })).toBeVisible();

    // Category
    await page.getByLabel("Name").fill("E2E Admin Category");
    await page.getByLabel("Key").fill("E2E_ADMIN_CATEGORY");
    await page.getByRole("button", { name: "Add Category" }).click();
    await expect(page.getByText("Category created.")).toBeVisible();
    await expect(page.getByText("E2E Admin Category")).toBeVisible();

    const category = await prisma.scoreCategory.findFirstOrThrow({ where: { campId, key: "E2E_ADMIN_CATEGORY" } });
    expect(category.campId).toBe(campId);

    // Rule + live preview
    await page.getByRole("tab", { name: "Rules" }).click();
    await page.getByLabel("Category").selectOption({ label: "E2E Admin Category" });
    await page.getByLabel("Station ID").fill("E2E_STATION");
    await page.getByLabel("Preview: arrive").fill("7");
    await expect(page.getByText("3 pts", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Create Rule" }).click();
    await expect(page.getByText("Rule created.")).toBeVisible();

    const rule = await prisma.scoreRule.findFirstOrThrow({ where: { campId, stationId: "E2E_STATION" } });
    expect(rule.categoryId).toBe(category.id);
    expect((rule.tiers as any)?.[1]).toMatchObject({ maxMinutesLate: 5, points: 6 });
  });

  test("settings: enabling public + generating a link creates a working token, and rotating kills it", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/leaderboard/admin");
    await page.getByRole("tab", { name: "Settings" }).click();

    await page.getByLabel("Enable the public, no-login leaderboard page").check();
    await expect(page.getByText("Settings updated.")).toBeVisible();
    await page.getByRole("button", { name: "Generate Public Link" }).click();
    await expect(page.getByAltText("Public leaderboard QR code")).toBeVisible();

    const settings1 = await prisma.leaderboardSettings.findFirstOrThrow({ where: { campId } });
    expect(settings1.publicEnabled).toBe(true);
    expect(settings1.publicToken).toBeTruthy();

    await page.getByRole("button", { name: "Rotate link (kills the old URL)" }).click();
    const rotateDialog = page.getByTestId("dialog-panel");
    await expect(rotateDialog).toBeVisible();
    await rotateDialog.getByRole("button", { name: "Rotate", exact: true }).click();
    await expect(page.getByText("Public link rotated")).toBeVisible();
    await expect(rotateDialog).not.toBeVisible();

    const settings2 = await prisma.leaderboardSettings.findFirstOrThrow({ where: { campId } });
    expect(settings2.publicToken).not.toBe(settings1.publicToken);

    // Clean up: leave public disabled for other specs/manual testing.
    await page.getByLabel("Enable the public, no-login leaderboard page").uncheck();
    await expect(page.getByText("Settings updated.")).toBeVisible();
  });

  test("audit log lists the award and undo works from there", async ({ page }) => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@camply.com" } });
    const tribe = await prisma.tribe.create({ data: { campId, name: `E2E Admin Tribe ${Date.now()}` } });
    const category = await prisma.scoreCategory.findFirstOrThrow({ where: { key: "CLEANING" } });
    // Unique per run (not just per test) — Table's dual-render (desktop
    // <table> + mobile card list both present in the DOM, CSS-toggled, not
    // unmounted) already means every match appears twice; a retry reusing
    // the same literal reason text would double that again.
    const reason = `E2E audit test ${Date.now()}`;

    try {
      const { appRouter } = await import("../src/server/api/root");
      const caller = appRouter.createCaller({
        prisma,
        session: { user: { id: admin.id, email: admin.email, role: "ADMIN", organizationId: admin.organizationId ?? undefined }, expires: "" },
      });
      await caller.leaderboard.award({ campId, subjectType: "TRIBE", subjectId: tribe.id, categoryId: category.id, points: 12, reason });

      await loginWithPassword(page, "admin@camply.com", "password123");
      await page.goto("/leaderboard/admin");
      await page.getByRole("tab", { name: "Audit Log" }).click();

      const row = page.locator("tr", { has: page.getByText(reason, { exact: true }) }).first();
      await expect(row).toBeVisible();
      await row.getByRole("button", { name: "Undo" }).click();
      await expect(page.getByText("Award undone.")).toBeVisible();

      const tribeAfter = await prisma.tribe.findUniqueOrThrow({ where: { id: tribe.id } });
      expect(tribeAfter.points).toBe(0);
    } finally {
      await prisma.scoreEvent.deleteMany({ where: { tribeId: tribe.id } });
      await prisma.leaderboardStat.deleteMany({ where: { subjectId: tribe.id } });
      await prisma.tribe.delete({ where: { id: tribe.id } });
      await prisma.auditLog.deleteMany({ where: { reason } });
    }
  });
});
