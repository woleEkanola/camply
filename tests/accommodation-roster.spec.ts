import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

/**
 * The Accommodation Roster page (/admin/accommodation/roster) — a grouped
 * hostel → floor → room view of occupancy, with a "Flagged only" toggle for
 * spotting placements that need correction (e.g. a gender mismatch).
 */
test.describe("Accommodation Roster page", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  const stamp = `e2e-roster-${Date.now()}`;
  let orgId: string;
  let campId: string;
  let campusId: string;
  let venueId: string;
  let hostelId: string;
  let floorId: string;
  let roomId: string;
  let bedId: string;
  let secondBedId: string;
  let camperUserEmail: string;
  let camperRegId: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    orgId = ctx.organizationId;
    campId = ctx.campId;
    campusId = ctx.campusId;

    const venue = await prisma.venue.create({ data: { campId, name: `${stamp} Venue` } });
    venueId = venue.id;
    // MALE hostel + a Female camper deliberately placed in it, to exercise
    // the "Flagged only" gender-mismatch narrowing.
    const hostel = await prisma.hostel.create({ data: { organizationId: orgId, venueId, name: `${stamp} Hostel`, gender: "MALE" } });
    hostelId = hostel.id;
    const floor = await prisma.hostelFloor.create({ data: { hostelId, name: `${stamp} Floor`, level: 0 } });
    floorId = floor.id;
    const room = await prisma.room.create({ data: { hostelId, floorId, name: `${stamp} Room`, capacity: 2 } });
    roomId = room.id;
    const bed = await prisma.bed.create({ data: { roomId, label: "Bed 1" } });
    bedId = bed.id;
    const secondBed = await prisma.bed.create({ data: { roomId, label: "Bed 2" } }); // left empty
    secondBedId = secondBed.id;

    camperUserEmail = `${stamp}-camper@camply.test`;
    const parent = await prisma.user.create({ data: { email: camperUserEmail, password: "x", role: "PARENT", organizationId: orgId, homeCampusId: campusId } });
    const camper = await prisma.camper.create({ data: { name: `${stamp} Camper`, userId: parent.id, organizationId: orgId, homeCampusId: campusId, gender: "Female" } });
    const reg = await prisma.registration.create({ data: { camperId: camper.id, campId, campusId, status: "APPROVED", roomId } });
    await prisma.bed.update({ where: { id: bedId }, data: { registrationId: reg.id } });
    camperRegId = reg.id;
  });

  test.afterAll(async () => {
    await prisma.bed.deleteMany({ where: { id: { in: [bedId, secondBedId] } } });
    await prisma.room.deleteMany({ where: { id: roomId } });
    await prisma.hostelFloor.deleteMany({ where: { id: floorId } });
    await prisma.hostel.deleteMany({ where: { id: hostelId } });
    await prisma.venue.deleteMany({ where: { id: venueId } });
    await prisma.registration.deleteMany({ where: { id: camperRegId } });
    await prisma.camper.deleteMany({ where: { name: { contains: stamp } } });
    await prisma.user.deleteMany({ where: { email: camperUserEmail } });
  });

  test("renders hostel → floor → room hierarchy with correct occupancy counts, and 'Flagged only' narrows to the mismatched placement", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/accommodation/roster");

    await expect(page.getByRole("heading", { name: `${stamp} Hostel` })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(`${stamp} Floor`)).toBeVisible({ timeout: 10000 });

    const roomCard = page.locator("div", { hasText: `${stamp} Room` }).filter({ hasText: "1/2" }).first();
    await expect(roomCard).toBeVisible({ timeout: 10000 });
    await expect(roomCard).toContainText(`${stamp} Camper`);
    await expect(roomCard).toContainText("Empty");

    const flaggedCheckbox = page.getByLabel("Flagged only");
    await flaggedCheckbox.check();
    await expect(page.getByText(`${stamp} Camper`)).toBeVisible({ timeout: 10000 });

    await page.getByLabel("Filter by gender").selectOption("FEMALE");
    await expect(page.getByRole("heading", { name: `${stamp} Hostel` })).toHaveCount(0);
  });
});
