import { test, expect } from "@playwright/test";
import type { RegistrationStatus } from "@prisma/client";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

/**
 * The admin Campers page's "Total Campers" stat used to be `allCampers.length`
 * — the number of rows loaded client-side into the current page, not the
 * true org-wide total (page size is capped at 50, so any org with more than
 * 50 campers showed a wrong, ever-changing number as you scrolled/loaded
 * more). It's now backed by a dedicated camper.getAdminListStats query, and
 * the page also gained Male/Female/In Camp/Exited Camp/Assigned to Tribe
 * stat cards.
 */
test.describe("Campers page: accurate stats cards", () => {
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now();
  let campusId: string;
  const camperIds: string[] = [];
  const parentIds: string[] = [];
  const registrationIds: string[] = [];

  test.beforeAll(async () => {
    const { organizationId, campId, campusId: fixtureCampusId } = await getFixtureOrgContext();
    campusId = fixtureCampusId;

    async function makeCamper(gender: string, status?: RegistrationStatus) {
      const parent = await prisma.user.create({
        data: { email: `e2e-camperstats-parent-${parentIds.length}-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId },
      });
      parentIds.push(parent.id);
      const camper = await prisma.camper.create({
        data: { name: `E2E CamperStats ${gender} ${stamp}-${camperIds.length}`, userId: parent.id, organizationId, homeCampusId: campusId, gender },
      });
      camperIds.push(camper.id);
      if (status) {
        const reg = await prisma.registration.create({ data: { camperId: camper.id, campId, campusId, status } });
        registrationIds.push(reg.id);
      }
      return camper;
    }

    await makeCamper("Male", "CHECKED_IN");
    await makeCamper("Female", "COMPLETED");
    await makeCamper("Male");
  });

  test.afterAll(async () => {
    await prisma.registration.deleteMany({ where: { id: { in: registrationIds } } });
    await prisma.camper.deleteMany({ where: { id: { in: camperIds } } });
    await prisma.user.deleteMany({ where: { id: { in: parentIds } } });
  });

  test("stat cards reflect true org-wide counts, not just the loaded page", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/campers");

    async function statValue(testId: string): Promise<number> {
      const text = (await page.getByTestId(testId).textContent()) ?? "";
      return parseInt(text.match(/\d+/)?.[0] ?? "0", 10);
    }

    await expect(page.getByTestId("camper-stat-male")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("camper-stat-female")).toBeVisible();
    await expect(page.getByTestId("camper-stat-in-camp")).toBeVisible();
    await expect(page.getByTestId("camper-stat-exited-camp")).toBeVisible();
    await expect(page.getByTestId("camper-stat-tribe")).toBeVisible();

    // The stats query resolves asynchronously after the stat cards first
    // mount showing "0" — poll until the real counts land rather than
    // reading textContent the instant the element appears.
    await expect(async () => {
      // The fixture org already has other campers seeded from prior sessions
      // — just assert at least the 3 we just added, not an exact total.
      expect(await statValue("camper-stat-total")).toBeGreaterThanOrEqual(3);
      expect(await statValue("camper-stat-male")).toBeGreaterThanOrEqual(2);
      expect(await statValue("camper-stat-in-camp")).toBeGreaterThanOrEqual(1);
      expect(await statValue("camper-stat-exited-camp")).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 15000 });
  });
});
