import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

/**
 * Covers two reported bugs in the shared NotificationBell (src/components/
 * NotificationBell.tsx, rendered in every role's AppShell header):
 *  1. "Mark all read" fired the mutation correctly, but its onSuccess only
 *     refetched the notification list — never invalidated unreadCount — so
 *     the red badge count lagged up to 30s (its own refetchInterval),
 *     looking like the click did nothing.
 *  2. The popup had no outside-click/Escape handling at all; it only closed
 *     by clicking the bell again.
 */
test.describe("Notification bell: mark-all-read badge + outside-click close", () => {
  test.describe.configure({ mode: "serial" });

  let userId: string;
  let organizationId: string;
  const seededIds: string[] = [];
  const title1 = `E2E Notif A ${Date.now()}`;
  const title2 = `E2E Notif B ${Date.now()}`;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@camply.com" } });
    userId = owner.id;

    const notifs = await prisma.notification.createManyAndReturn({
      data: [
        { organizationId, userId, channel: "IN_APP", title: title1, body: "Test notification A" },
        { organizationId, userId, channel: "IN_APP", title: title2, body: "Test notification B" },
      ],
    });
    seededIds.push(...notifs.map((n) => n.id));
  });

  test.afterAll(async () => {
    await prisma.notification.deleteMany({ where: { id: { in: seededIds } } });
  });

  test("mark all read clears the badge promptly, and clicking outside the popup closes it", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");

    const bellButton = page.getByRole("button").filter({ hasText: "🔔" });
    await expect(bellButton).toBeVisible({ timeout: 10000 });

    const unreadBefore = await prisma.notification.count({ where: { userId, readAt: null } });
    expect(unreadBefore).toBeGreaterThanOrEqual(2);
    await expect(bellButton.locator("span")).toHaveText(String(unreadBefore), { timeout: 10000 });

    await bellButton.click();
    await expect(page.getByText(title1)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(title2)).toBeVisible();

    await page.getByRole("button", { name: "Mark all read" }).click();

    // The regression: this used to require waiting out the full 30s
    // refetchInterval for the badge to reflect reality. It must now clear
    // well within that window.
    await expect(bellButton.locator("span")).toHaveCount(0, { timeout: 5000 });

    const stillOpen = page.getByText(title1);
    await expect(stillOpen).toBeVisible();
    await page.locator("body").click({ position: { x: 5, y: 400 } });
    await expect(stillOpen).not.toBeVisible({ timeout: 5000 });

    const reloaded = await prisma.notification.count({ where: { id: { in: seededIds }, readAt: null } });
    expect(reloaded).toBe(0);
  });
});
