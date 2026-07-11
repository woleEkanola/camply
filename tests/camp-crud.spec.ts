import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

test.describe("Super Admin/Owner: Camp CRUD and active-camp switching", () => {
  test.describe.configure({ mode: "serial" });

  const campName = `E2E Camp ${Date.now()}`;
  let campId: string | undefined;
  let previousActiveCampId: string | null = null;
  let fixtureOrganizationId: string | undefined;

  test.afterAll(async () => {
    if (campId) {
      // Restore whichever camp was active before this test, so later spec
      // files relying on getFixtureOrgContext()'s "active camp" keep working.
      // setActiveCamp deactivates every other camp in the org when activating
      // one, so the previous camp's own `active` flag must be restored too —
      // not just the Organization.activeCampId pointer. Set this unconditionally
      // by organizationId (not `where: { activeCampId: campId }`) since the
      // delete-camp test may have already nulled activeCampId itself.
      if (previousActiveCampId && fixtureOrganizationId) {
        await prisma.organization.update({
          where: { id: fixtureOrganizationId },
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
    fixtureOrganizationId = organizationId;
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

  test("deleting a camp with a live registration is blocked; deleting an empty camp soft-deletes it", async ({ page }) => {
    if (!campId) throw new Error("campId not set — earlier test must have failed");
    // Not using getFixtureOrgContext() here: the previous test in this file made
    // the new E2E camp active, and that helper requires a Venue under whichever
    // camp is currently active — this camp has none. Resolve org/campus directly.
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@camply.com" } });
    const organizationId = admin.organizationId!;
    const campus = await prisma.campus.findFirstOrThrow({ where: { organizationId } });
    const campusId = campus.id;

    const parentEmail = `e2e-camp-delete-parent-${Date.now()}@camply.test`;
    const parent = await prisma.user.create({ data: { email: parentEmail, password: "x", role: "PARENT", organizationId } });
    const camper = await prisma.camper.create({ data: { name: "E2E Camp-Block Camper", userId: parent.id, organizationId, homeCampusId: campusId } });
    const registration = await prisma.registration.create({
      data: { camperId: camper.id, campId, campusId, status: "APPROVED", registrationNumber: `E2E-CAMP-BLOCK-${Date.now()}` },
    });

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/camps");

    const row = page.locator("tr", { hasText: campName });
    await row.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();

    await expect(page.getByText(/cannot delete a camp that has registrations/i)).toBeVisible({ timeout: 10000 });
    await expect(prisma.camp.findUniqueOrThrow({ where: { id: campId } })).resolves.toMatchObject({ deletedAt: null });

    await prisma.registration.deleteMany({ where: { id: registration.id } });
    await prisma.camper.deleteMany({ where: { id: camper.id } });
    await prisma.user.deleteMany({ where: { id: parent.id } });

    // The confirmation dialog stayed open after the blocked attempt (only closes
    // on success) — just retry the same "Delete Camp" button rather than reaching
    // for the row's button again, which is now hidden behind the modal overlay.
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();

    await expect(page.getByText("Camp deleted successfully!")).toBeVisible({ timeout: 10000 });
    await expect
      .poll(async () => (await prisma.camp.findUniqueOrThrow({ where: { id: campId! } })).deletedAt, { timeout: 10000 })
      .not.toBeNull();
  });
});
