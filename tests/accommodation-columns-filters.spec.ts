import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

/**
 * New Hostel/Room/Bed/Tribe columns and hostel→floor→room→bed-status filters
 * on the admin Campers page and the Teachers page (StaffListPage), backed by
 * accommodation.listStructureOptions and the new filter inputs on
 * camper.adminList / staff.adminList.
 */
test.describe("Accommodation columns and filters on Campers/Teachers pages", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  const stamp = `e2e-acccols-${Date.now()}`;
  let orgId: string;
  let campId: string;
  let campusId: string;
  let venueId: string;
  let hostelId: string;
  let floorId: string;
  let roomId: string;
  let bedId: string;
  let camperUserEmail: string;
  let camperRegId: string;
  let teacherUserEmail: string;
  let teacherProfileId: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    orgId = ctx.organizationId;
    campId = ctx.campId;
    campusId = ctx.campusId;

    const venue = await prisma.venue.create({ data: { campId, name: `${stamp} Venue` } });
    venueId = venue.id;
    const hostel = await prisma.hostel.create({ data: { organizationId: orgId, venueId, name: `${stamp} Hostel`, gender: "MALE" } });
    hostelId = hostel.id;
    const floor = await prisma.hostelFloor.create({ data: { hostelId, name: `${stamp} Floor`, level: 0 } });
    floorId = floor.id;
    const room = await prisma.room.create({ data: { hostelId, floorId, name: `${stamp} Room`, capacity: 2 } });
    roomId = room.id;
    const bed = await prisma.bed.create({ data: { roomId, label: "Bed 1" } });
    bedId = bed.id;

    camperUserEmail = `${stamp}-camper@camply.test`;
    const parent = await prisma.user.create({ data: { email: camperUserEmail, password: "x", role: "PARENT", organizationId: orgId, homeCampusId: campusId } });
    const camper = await prisma.camper.create({ data: { name: `${stamp} Camper`, userId: parent.id, organizationId: orgId, homeCampusId: campusId, gender: "Male" } });
    const reg = await prisma.registration.create({ data: { camperId: camper.id, campId, campusId, status: "APPROVED", roomId } });
    await prisma.bed.update({ where: { id: bedId }, data: { registrationId: reg.id } });
    camperRegId = reg.id;

    teacherUserEmail = `${stamp}-teacher@camply.test`;
    const teacherUser = await prisma.user.create({ data: { email: teacherUserEmail, password: "x", role: "TEACHER", organizationId: orgId } });
    const teacher = await prisma.staffProfile.create({
      data: {
        userId: teacherUser.id,
        organizationId: orgId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: `${stamp}`,
        lastName: "Teacher",
        email: teacherUserEmail,
        phone: "+1-555-0900",
        assignedHostelId: hostelId,
        assignedRoomId: roomId,
      },
    });
    teacherProfileId = teacher.id;
  });

  test.afterAll(async () => {
    await prisma.bed.deleteMany({ where: { id: bedId } });
    await prisma.staffProfile.deleteMany({ where: { id: teacherProfileId } });
    await prisma.room.deleteMany({ where: { id: roomId } });
    await prisma.hostelFloor.deleteMany({ where: { id: floorId } });
    await prisma.hostel.deleteMany({ where: { id: hostelId } });
    await prisma.venue.deleteMany({ where: { id: venueId } });
    await prisma.registration.deleteMany({ where: { id: camperRegId } });
    await prisma.camper.deleteMany({ where: { name: { contains: stamp } } });
    await prisma.user.deleteMany({ where: { email: { in: [camperUserEmail, teacherUserEmail] } } });
  });

  test("Campers page shows Hostel/Room/Bed/Tribe columns and hostel/floor/room/bed-status filters narrow the list", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campers");

    // Flip to list view so the Table columns render. click() auto-waits for
    // the button to become actionable, unlike a plain isVisible() snapshot
    // check which can run before hydration completes and silently no-op.
    await page.locator("button:visible", { hasText: /^List$/ }).first().click();

    const row = page.locator("tr", { hasText: `${stamp} Camper` });
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(row).toContainText(`${stamp} Hostel`);
    await expect(row).toContainText("Bed 1");

    await page.getByLabel("Filter by Hostel").selectOption({ label: `${stamp} Hostel` });
    await expect(page.locator("tr", { hasText: `${stamp} Camper` })).toBeVisible({ timeout: 15000 });

    await page.getByLabel("Filter by Bed Status").selectOption("UNASSIGNED");
    await expect(page.locator("tr", { hasText: `${stamp} Camper` })).toHaveCount(0);

    await page.getByLabel("Filter by Bed Status").selectOption("ASSIGNED");
    await expect(page.locator("tr", { hasText: `${stamp} Camper` })).toBeVisible({ timeout: 15000 });
  });

  test("Teachers page shows Hostel/Room/Bed/Tribe columns for a room-only staff assignment", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/teachers");

    // Hostel/Room/Bed/Tribe are hideable but off by default (same pattern as
    // the other optional columns) — turn them on via the Columns dropdown.
    await page.getByRole("button", { name: /Columns/i }).click();
    await page.getByLabel("Hostel", { exact: true }).check();
    await page.getByLabel("Room", { exact: true }).check();
    await page.getByLabel("Bed", { exact: true }).check();
    await page.locator("div.fixed.inset-0.z-10").click();

    const row = page.locator("tr", { hasText: `${stamp} Teacher` });
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(row).toContainText(`${stamp} Hostel`);
    await expect(row).toContainText("Room only");

    await page.getByRole("button", { name: /Filters/i }).click();
    await page.getByLabel("Filter by hostel").selectOption({ label: `${stamp} Hostel` });
    await expect(page.locator("tr", { hasText: `${stamp} Teacher` })).toBeVisible({ timeout: 15000 });

    await page.getByLabel("Filter by bed status").selectOption("UNASSIGNED");
    await expect(page.locator("tr", { hasText: `${stamp} Teacher` })).toBeVisible({ timeout: 15000 });
    await page.getByLabel("Filter by bed status").selectOption("ASSIGNED");
    await expect(page.locator("tr", { hasText: `${stamp} Teacher` })).toHaveCount(0);
  });
});
