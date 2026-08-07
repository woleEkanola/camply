import { test, expect } from "@playwright/test";
import { loginWithPassword, getFixtureOrgContext, prisma } from "./helpers";

/**
 * PR 8 — the /l/[token]/announce wall-display channel, the ?demo=1
 * FLIP/confetti verification mode, and the new LEADERBOARD_SCORES export
 * kind surfaced in admin Settings.
 */
test.describe("Leaderboard announce page, demo mode, and score export (PR 8)", () => {
  test.describe.configure({ mode: "serial" });

  let campId: string;
  let organizationId: string;
  let tribeId: string;
  let publicToken: string;

  test.beforeAll(async () => {
    ({ campId, organizationId } = await getFixtureOrgContext());
    await prisma.leaderboardSettings.deleteMany({ where: { campId } });

    const tribe = await prisma.tribe.create({ data: { campId, name: `E2E Announce Tribe ${Date.now()}`, color: "#f59e0b" } });
    tribeId = tribe.id;

    const { appRouter } = await import("../src/server/api/root");
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@camply.com" } });
    const caller = appRouter.createCaller({
      prisma,
      session: { user: { id: admin.id, email: admin.email, role: "ADMIN", organizationId: admin.organizationId ?? undefined }, expires: "" },
    });
    await caller.leaderboard.award({ campId, subjectType: "TRIBE", subjectId: tribeId, categoryId: "seed-cat-cleaning", points: 15, reason: "E2E announce" });
    await caller.leaderboard.settings.update({ campId, publicEnabled: true });
    await caller.leaderboard.rotatePublicToken({ campId });

    const settings = await prisma.leaderboardSettings.findFirstOrThrow({ where: { campId } });
    publicToken = settings.publicToken!;
  });

  test.afterAll(async () => {
    await prisma.exportJob.deleteMany({ where: { organizationId, kind: "LEADERBOARD_SCORES" } });
    await prisma.scoreEvent.deleteMany({ where: { tribeId } });
    await prisma.leaderboardStat.deleteMany({ where: { subjectId: tribeId } });
    await prisma.tribe.delete({ where: { id: tribeId } });
    await prisma.leaderboardSettings.deleteMany({ where: { campId } });
  });

  test("the announce page loads unauthenticated and shows a real announcement item", async ({ page }) => {
    await page.goto(`/l/${publicToken}/announce`);
    await expect(page.getByTestId("announce-root")).toBeVisible();
    await expect(page.getByTestId("announce-item")).toBeVisible({ timeout: 15000 });
  });

  test("?demo=1 on the presentation page renders simulated tribes without a real token lookup", async ({ page }) => {
    // A garbage token would 404 against the real publicBoard query — demo
    // mode must never actually call it.
    await page.goto(`/l/not-a-real-token/present?demo=1`);
    await expect(page.getByTestId("presentation-root")).toBeVisible();
    await expect(page.getByText("Demo Camp (?demo=1)")).toBeVisible();
    await expect(page.getByText("Judah")).toBeVisible();
  });

  test("admin exports leaderboard scores as XLSX from Settings", async ({ page }) => {
    test.setTimeout(60000);
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/leaderboard/admin");
    await page.getByRole("tab", { name: "Settings" }).click();

    await expect(page.getByText("Every score event recorded for this camp")).toBeVisible();
    await page.getByRole("button", { name: "Export Leaderboard Scores" }).click();

    const dialog = page.getByTestId("dialog-panel");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Export", exact: true }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    await expect
      .poll(
        async () => {
          const job = await prisma.exportJob.findFirst({
            where: { organizationId, kind: "LEADERBOARD_SCORES" },
            orderBy: { createdAt: "desc" },
          });
          return job?.status;
        },
        { timeout: 20000 }
      )
      .toBe("DONE");
  });
});
