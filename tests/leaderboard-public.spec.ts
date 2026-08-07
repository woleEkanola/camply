import { test, expect } from "@playwright/test";
import { getFixtureOrgContext, prisma } from "./helpers";

test.describe("Public leaderboard (/l/[token])", () => {
  test.describe.configure({ mode: "serial" });

  let campId: string;
  let token: string;
  let tribeId: string;

  test.beforeAll(async () => {
    ({ campId } = await getFixtureOrgContext());

    const tribe = await prisma.tribe.create({ data: { campId, name: `E2E Public Tribe ${Date.now()}`, color: "#123456" } });
    tribeId = tribe.id;
    await prisma.scoreEvent.create({
      data: {
        campId,
        tribeId,
        categoryId: (await prisma.scoreCategory.findFirstOrThrow({ where: { key: "CLEANING" } })).id,
        points: 15,
        reason: "E2E secret medical note, should never leak: peanut allergy",
        source: "MANUAL",
        occurredAt: new Date(),
        day: new Date(new Date().toISOString().slice(0, 10)),
      },
    });
    await prisma.leaderboardStat.deleteMany({ where: { campId } });

    const { appRouter } = await import("../src/server/api/root");
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@camply.com" } });
    const caller = appRouter.createCaller({
      prisma,
      session: { user: { id: admin.id, email: admin.email, role: "ADMIN", organizationId: admin.organizationId ?? undefined }, expires: "" },
    });
    await caller.leaderboard.rebuild({ campId });
    const settings = await caller.leaderboard.rotatePublicToken({ campId });
    await caller.leaderboard.settings.update({ campId, publicEnabled: true });
    token = settings.publicToken!;
  });

  test.afterAll(async () => {
    await prisma.scoreEvent.deleteMany({ where: { tribeId } });
    await prisma.leaderboardStat.deleteMany({ where: { subjectId: tribeId } });
    await prisma.tribe.delete({ where: { id: tribeId } });
    await prisma.leaderboardSettings.updateMany({ where: { campId }, data: { publicEnabled: false } });
  });

  test("loads with no session cookie, shows real data, and never leaks the free-text reason", async ({ browser }) => {
    // A fresh, cookie-less context — the concrete proof this needs no login.
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`/l/${token}`);
    await expect(page.getByText(/Leaderboard$/)).toBeVisible();
    await expect(page.getByText("E2E Public Tribe", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("15 pts", { exact: false }).first()).toBeVisible();

    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain("secret medical note");
    expect(bodyText).not.toContain("peanut allergy");

    await context.close();
  });

  test("presentation mode loads with a dark background and no session", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`/l/${token}/present`);
    await expect(page.getByText("E2E Public Tribe", { exact: false }).first()).toBeVisible();
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="presentation-root"]')!).backgroundColor);
    // #0a0a0a -> rgb(10, 10, 10)
    expect(bg).toBe("rgb(10, 10, 10)");

    await context.close();
  });

  test("a disabled public board returns not-found, never forbidden", async ({ browser }) => {
    await prisma.leaderboardSettings.updateMany({ where: { campId }, data: { publicEnabled: false } });
    const context = await browser.newContext();
    const page = await context.newPage();

    const response = await page.goto(`/l/${token}`);
    expect(response?.status()).toBeLessThan(400); // Next.js SSR shell still 200s; assert the content instead
    await expect(page.getByText("isn't available", { exact: false })).toBeVisible();

    await context.close();
    // restore for the next test in this serial file
    await prisma.leaderboardSettings.updateMany({ where: { campId }, data: { publicEnabled: true } });
  });

  test("rotating the token permanently kills the old URL", async ({ browser }) => {
    const { appRouter } = await import("../src/server/api/root");
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@camply.com" } });
    const caller = appRouter.createCaller({
      prisma,
      session: { user: { id: admin.id, email: admin.email, role: "ADMIN", organizationId: admin.organizationId ?? undefined }, expires: "" },
    });
    const oldToken = token;
    const rotated = await caller.leaderboard.rotatePublicToken({ campId });
    expect(rotated.publicToken).not.toBe(oldToken);

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`/l/${oldToken}`);
    await expect(page.getByText("isn't available", { exact: false })).toBeVisible();

    await page.goto(`/l/${rotated.publicToken}`);
    await expect(page.getByText("E2E Public Tribe", { exact: false }).first()).toBeVisible();

    await context.close();
  });
});
