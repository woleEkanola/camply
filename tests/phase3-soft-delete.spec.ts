import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, visibleText } from "./helpers";

test.describe("Camp structure soft-delete: Tribe, Department, Hostel/Room/Bed", () => {
  test.describe.configure({ mode: "serial" });

  let organizationId: string;
  let campId: string;
  let campusId: string;

  let tribeId: string | undefined;
  let departmentId: string | undefined;
  let venueId: string | undefined;
  let hostelId: string | undefined;
  let roomId: string | undefined;
  let bedId: string | undefined;
  let camperId: string | undefined;
  let parentUserId: string | undefined;
  let registrationId: string | undefined;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;
    campusId = ctx.campusId;

    const tribe = await prisma.tribe.create({ data: { campId, name: `E2E P3 Tribe ${Date.now()}` } });
    tribeId = tribe.id;

    const dept = await prisma.department.create({ data: { organizationId, campId, name: `E2E P3 Department ${Date.now()}` } });
    departmentId = dept.id;

    const venue = await prisma.venue.create({ data: { campId, name: `E2E P3 Venue ${Date.now()}` } });
    venueId = venue.id;
    const hostel = await prisma.hostel.create({ data: { organizationId, venueId, name: "E2E P3 Hostel" } });
    hostelId = hostel.id;
    const room = await prisma.room.create({ data: { hostelId, name: "E2E P3 Room" } });
    roomId = room.id;
    const bed = await prisma.bed.create({ data: { roomId, label: "E2E P3 Bed" } });
    bedId = bed.id;

    const parent = await prisma.user.create({
      data: { email: `e2e-p3-parent-${Date.now()}@camply.test`, password: "x", role: "PARENT", organizationId, homeCampusId: campusId },
    });
    parentUserId = parent.id;
    const camper = await prisma.camper.create({ data: { name: "E2E P3 Camper", userId: parent.id, organizationId, homeCampusId: campusId } });
    camperId = camper.id;
    const registration = await prisma.registration.create({
      data: { camperId: camper.id, campId, campusId, venueId, roomId, tribeId, status: "APPROVED", registrationNumber: `E2E-P3-${Date.now()}` },
    });
    registrationId = registration.id;
    await prisma.bed.update({ where: { id: bedId }, data: { registrationId: registration.id, status: "OCCUPIED" } });
  });

  test.afterAll(async () => {
    if (bedId) await prisma.bed.deleteMany({ where: { id: bedId } });
    if (roomId) await prisma.room.deleteMany({ where: { id: roomId } });
    if (hostelId) await prisma.hostel.deleteMany({ where: { id: hostelId } });
    if (registrationId) await prisma.registration.deleteMany({ where: { id: registrationId } });
    if (camperId) await prisma.camper.deleteMany({ where: { id: camperId } });
    if (parentUserId) await prisma.user.deleteMany({ where: { id: parentUserId } });
    if (venueId) await prisma.venue.deleteMany({ where: { id: venueId } });
    if (tribeId) await prisma.tribe.deleteMany({ where: { id: tribeId } });
    if (departmentId) await prisma.department.deleteMany({ where: { id: departmentId } });
  });

  test("deleting a tribe with assigned campers is blocked; deleting an empty tribe soft-deletes it", async ({ page }) => {
    const tribe = await prisma.tribe.findUniqueOrThrow({ where: { id: tribeId! } });

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto(`/admin/camps/${campId}/tribes`);

    // Same ancestor-matching trap as the department card below: plain `div` +
    // hasText also matches the outer list wrapper (which document order lists
    // before its child rows), so scope to the row's own distinguishing class.
    // This admin config page renders tribes as flat rows (`rounded-md border
    // ...`), not the `TribeGrid` Card component used elsewhere in the app —
    // don't reuse the `.cursor-pointer` class from that other component here.
    const row = page.locator("div.rounded-md", { hasText: tribe.name }).first();
    await row.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();

    await expect(page.getByText(/cannot delete a tribe with assigned campers/i)).toBeVisible({ timeout: 10000 });

    // Clear the assignment, then retry.
    await prisma.registration.update({ where: { id: registrationId! }, data: { tribeId: null } });
    await page.reload();
    await page.getByRole("button", { name: "Delete" }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();

    await expect
      .poll(async () => (await prisma.tribe.findUniqueOrThrow({ where: { id: tribeId! } })).deletedAt, { timeout: 10000 })
      .not.toBeNull();
  });

  test("deleting a department soft-deletes it, recoverable from Trash", async ({ page }) => {
    const dept = await prisma.department.findUniqueOrThrow({ where: { id: departmentId! } });

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/camp-structure");
    await page.getByRole("tab", { name: "Departments" }).click();
    await expect(page.getByText(dept.name)).toBeVisible({ timeout: 10000 });

    // Plain `div` + hasText matches every ancestor that contains this text,
    // not just the department's own Card — .first() then grabs the grid
    // wrapper (document order lists outer ancestors before their children),
    // which holds every department's Delete button and trips a strict-mode
    // violation once more than one department exists on the page. Scope to
    // the Card's distinguishing class so it resolves to just this card.
    const card = page.locator("div.cursor-pointer", { hasText: dept.name }).first();
    await card.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();

    await expect
      .poll(async () => (await prisma.department.findUniqueOrThrow({ where: { id: departmentId! } })).deletedAt, { timeout: 10000 })
      .not.toBeNull();

    await page.goto("/admin/trash");
    // Table.tsx dual-renders a desktop <td> and a mobile card <dd> from the
    // same data — scope to whichever copy is actually visible at this viewport.
    await expect(visibleText(page, dept.name)).toBeVisible({ timeout: 10000 });
  });

  test("deleting a hostel with an occupied bed is blocked; unassigning then deleting cascades to its room and bed", async ({ page }) => {
    const hostel = await prisma.hostel.findUniqueOrThrow({ where: { id: hostelId! } });
    const venue = await prisma.venue.findUniqueOrThrow({ where: { id: venueId! } });

    await loginWithPassword(page, "owner@camply.com", "password123");
    // Accommodation management is its own page, not a tab under Camp Structure.
    await page.goto("/admin/accommodation");
    await page.locator("select").first().selectOption({ label: venue.name });
    await expect(page.getByText(hostel.name)).toBeVisible({ timeout: 10000 });

    // Same ancestor-matching trap as the department/tribe cards — scope to
    // the Hostel Card's own class (its child Room cards use "rounded-md",
    // not "rounded-lg", so this doesn't also match them). The Hostel's own
    // Delete button still precedes its Room's Delete button in DOM order
    // within that one card, so .first() reliably picks the hostel-level one.
    const hostelCard = page.locator("div.rounded-lg", { hasText: hostel.name }).first();
    await hostelCard.getByRole("button", { name: "Delete", exact: true }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();

    await expect(page.getByText(/bed\(s\) are still occupied/i)).toBeVisible({ timeout: 10000 });

    // Unassign the camper directly, then retry.
    await prisma.bed.update({ where: { id: bedId! }, data: { registrationId: null, status: "AVAILABLE" } });
    await prisma.registration.update({ where: { id: registrationId! }, data: { roomId: null } });
    await page.reload();
    await page.locator("select").first().selectOption({ label: venue.name });
    await expect(page.getByText(hostel.name)).toBeVisible({ timeout: 10000 });

    const hostelCard2 = page.locator("div.rounded-lg", { hasText: hostel.name }).first();
    await hostelCard2.getByRole("button", { name: "Delete", exact: true }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();

    await expect
      .poll(async () => (await prisma.hostel.findUniqueOrThrow({ where: { id: hostelId! } })).deletedAt, { timeout: 10000 })
      .not.toBeNull();
    const room = await prisma.room.findUniqueOrThrow({ where: { id: roomId! } });
    expect(room.deletedAt).not.toBeNull();
    const bed = await prisma.bed.findUniqueOrThrow({ where: { id: bedId! } });
    expect(bed.deletedAt).not.toBeNull();
  });
});
