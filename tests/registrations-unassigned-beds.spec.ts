import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, switchRegistrationsToListView } from "./helpers";

/**
 * Before this fix, an admin had no way to see who lacks a bed assignment
 * short of running the full auto-assign engine — assignmentReadiness
 * computed the count but discarded the names, and the registrations page
 * rendered no room/bed column at all. This covers the new "No Bed Assigned"
 * StatCard filter chip and the Bed column on /admin/registrations.
 */
test.describe("Registrations page: bed assignment visibility", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  const stamp = `e2e-beds-${Date.now()}`;
  let orgId: string;
  let campId: string;
  let campusId: string;
  let venueId: string;
  let hostelId: string;
  let roomId: string;
  let bedId: string;
  let unassignedRegId: string;
  let assignedRegId: string;
  const emails: string[] = [];

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    orgId = ctx.organizationId;
    campId = ctx.campId;
    campusId = ctx.campusId;

    const venue = await prisma.venue.create({ data: { campId, name: `${stamp} Venue` } });
    venueId = venue.id;
    const hostel = await prisma.hostel.create({ data: { organizationId: orgId, venueId, name: `${stamp} Hostel` } });
    hostelId = hostel.id;
    const room = await prisma.room.create({ data: { hostelId, name: `${stamp} Room` } });
    roomId = room.id;
    const bed = await prisma.bed.create({ data: { roomId, label: "Bed 1" } });
    bedId = bed.id;

    async function makeReg(name: string, withBed: boolean) {
      const email = `${stamp}-${withBed ? "assigned" : "unassigned"}@camply.test`;
      emails.push(email);
      const parent = await prisma.user.create({ data: { email, password: "x", role: "PARENT", organizationId: orgId, homeCampusId: campusId } });
      const camper = await prisma.camper.create({ data: { name, userId: parent.id, organizationId: orgId, homeCampusId: campusId, gender: "Male" } });
      const reg = await prisma.registration.create({
        data: { camperId: camper.id, campId, campusId, status: "APPROVED", ...(withBed && { roomId }) },
      });
      if (withBed) await prisma.bed.update({ where: { id: bedId }, data: { registrationId: reg.id } });
      return reg.id;
    }

    unassignedRegId = await makeReg(`${stamp} Unassigned Camper`, false);
    assignedRegId = await makeReg(`${stamp} Assigned Camper`, true);
  });

  test.afterAll(async () => {
    await prisma.bed.deleteMany({ where: { id: bedId } });
    await prisma.room.deleteMany({ where: { id: roomId } });
    await prisma.hostel.deleteMany({ where: { id: hostelId } });
    await prisma.venue.deleteMany({ where: { id: venueId } });
    await prisma.registration.deleteMany({ where: { id: { in: [unassignedRegId, assignedRegId] } } });
    await prisma.camper.deleteMany({ where: { name: { contains: stamp } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
  });

  test("the 'No Bed Assigned' StatCard filters to only unassigned registrations, and the Bed column shows state", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/registrations");

    await page.getByTestId("registration-stat-unassigned-bed").click();

    await switchRegistrationsToListView(page);
    await expect(page.locator("tr", { hasText: `${stamp} Unassigned Camper` })).toBeVisible({ timeout: 15000 });
    await expect(page.locator("tr", { hasText: `${stamp} Assigned Camper` })).toHaveCount(0);

    // Turn on the Bed column and verify it reflects each state. The dropdown
    // closes via a full-viewport backdrop click, not a second button click.
    await page.getByRole("button", { name: /Columns/i }).click();
    await page.getByLabel("Bed").check();
    await page.locator("div.fixed.inset-0.z-40").click();

    const unassignedRow = page.locator("tr", { hasText: `${stamp} Unassigned Camper` });
    await expect(unassignedRow).toContainText("No bed");

    await page.getByTestId("registration-stat-unassigned-bed").click(); // clear filter
    const assignedRow = page.locator("tr", { hasText: `${stamp} Assigned Camper` });
    await expect(assignedRow).toBeVisible({ timeout: 15000 });
    await expect(assignedRow).toContainText("Bed 1");
  });
});
