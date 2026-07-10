import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

test.describe("Super Admin/Owner: Camp CRUD and active-camp switching", () => {
  test.describe.configure({ mode: "serial" });

  const campName = `E2E Camp ${Date.now()}`;
  let campId: string | undefined;
  let previousActiveCampId: string | null = null;

  test.afterAll(async () => {
    if (campId) {
      // Restore whichever camp was active before this test, so later spec
      // files relying on getFixtureOrgContext()'s "active camp" keep working.
      // setActiveCamp deactivates every other camp in the org when activating
      // one, so the previous camp's own `active` flag must be restored too —
      // not just the Organization.activeCampId pointer.
      if (previousActiveCampId) {
        await prisma.organization.updateMany({
          where: { activeCampId: campId },
          data: { activeCampId: previousActiveCampId },
        });
        await prisma.camp.update({
          where: { id: previousActiveCampId },
          data: { active: true },
        });
      }
      await prisma.camp.deleteMany({ where: { id: campId } });
    }
  });

  test("owner can create a new camp and set it active", async ({ page }) => {
    const { organizationId } = await getFixtureOrgContext();
    const orgBefore = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    previousActiveCampId = orgBefore.activeCampId;

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/camps");

    await page.getByRole("button", { name: "Add Camp" }).first().click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(campName);
    await dialog.getByRole("button", { name: "Create Camp", exact: true }).click();

    await expect(page.getByText(campName)).toBeVisible({ timeout: 10000 });

    const camp = await prisma.camp.findFirstOrThrow({ where: { name: campName } });
    campId = camp.id;
    expect(camp.active).toBe(false);

    const row = page.locator("tr", { hasText: campName });
    await row.getByRole("button", { name: "Set Active" }).click();

    await expect
      .poll(async () => (await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } })).activeCampId, {
        timeout: 10000,
      })
      .toBe(camp.id);

    await expect(page.getByRole("heading", { name: "Active Camp" })).toBeVisible();
    await expect(page.locator("div", { hasText: campName }).first()).toBeVisible();
  });
});
