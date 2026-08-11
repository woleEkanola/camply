import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, fieldByLabel } from "./helpers";

test.describe("Accommodation: bulk-add beds", () => {
  test.describe.configure({ mode: "serial" });

  let organizationId: string;
  let venueId: string | undefined;
  let hostelId: string | undefined;
  let roomId: string | undefined;
  let secondRoomId: string | undefined;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;

    // A dedicated venue (rather than reusing the shared fixture venue) keeps
    // the venue-picker dropdown unambiguous regardless of what other specs
    // have left behind in this shared dev DB.
    const venue = await prisma.venue.create({ data: { campId: ctx.campId, name: `E2E Bulk Bed Venue ${Date.now()}` } });
    venueId = venue.id;
    const hostel = await prisma.hostel.create({ data: { organizationId, venueId, name: `E2E Bulk Bed Hostel ${Date.now()}` } });
    hostelId = hostel.id;
    const room = await prisma.room.create({ data: { hostelId, name: "E2E Bulk Bed Room" } });
    roomId = room.id;
    const secondRoom = await prisma.room.create({ data: { hostelId, name: "E2E Bulk Bed Room 2" } });
    secondRoomId = secondRoom.id;
  });

  test.afterAll(async () => {
    if (hostelId) await prisma.bed.deleteMany({ where: { room: { hostelId } } });
    if (hostelId) await prisma.room.deleteMany({ where: { hostelId } });
    if (hostelId) await prisma.hostelFloor.deleteMany({ where: { hostelId } });
    if (hostelId) await prisma.hostel.deleteMany({ where: { id: hostelId } });
    if (venueId) await prisma.venue.deleteMany({ where: { id: venueId } });
  });

  test("admin can bulk-create beds in a numbered sequence", async ({ page }) => {
    const venue = await prisma.venue.findUniqueOrThrow({ where: { id: venueId! } });
    const room = await prisma.room.findUniqueOrThrow({ where: { id: roomId! } });

    await loginWithPassword(page, "owner@camply.com", "password123");
    // Accommodation management is its own page, not a tab under Camp Structure.
    await page.goto("/admin/accommodation");
    await page.locator("select").first().selectOption({ label: venue.name });
    await expect(page.getByText(room.name, { exact: true })).toBeVisible({ timeout: 10000 });

    const roomCard = page.locator("div.rounded-md", { hasText: room.name }).first();
    await roomCard.getByRole("button", { name: "+ Add Beds" }).click();

    // BulkBedDialog's Input fields have no explicit id, so <label> isn't
    // associated via htmlFor — getByLabel can't find them. Walk from the
    // label text to its field instead (see fieldByLabel's doc comment).
    await fieldByLabel(page, "Prefix").fill("E2E Bed");
    await fieldByLabel(page, "Start at").fill("1");
    await fieldByLabel(page, "How many").fill("5");
    await page.getByRole("button", { name: /Create 5 Beds/i }).click();

    await expect
      .poll(async () => prisma.bed.count({ where: { roomId: roomId! } }), { timeout: 10000 })
      .toBe(5);

    const beds = await prisma.bed.findMany({ where: { roomId: roomId! }, orderBy: { label: "asc" } });
    expect(beds.map((b) => b.label)).toEqual(["E2E Bed 1", "E2E Bed 2", "E2E Bed 3", "E2E Bed 4", "E2E Bed 5"]);
  });

  test("admin can add a bed across every standard room", async ({ page }) => {
    const venue = await prisma.venue.findUniqueOrThrow({ where: { id: venueId! } });
    const before = await prisma.bed.count({ where: { roomId: secondRoomId! } });
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/accommodation");
    await page.locator("select").first().selectOption({ label: venue.name });
    await page.getByRole("button", { name: "Adjust beds" }).click();
    await page.getByRole("button", { name: "Add beds", exact: true }).click();
    await expect(page.getByText(/beds added across 2 rooms/i)).toBeVisible({ timeout: 10000 });
    await expect.poll(() => prisma.bed.count({ where: { roomId: secondRoomId! } })).toBe(before + 1);
  });

  test("admin can create a floor, rooms, and beds atomically", async ({ page }) => {
    const venue = await prisma.venue.findUniqueOrThrow({ where: { id: venueId! } });
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/accommodation");
    await page.locator("select").first().selectOption({ label: venue.name });
    await page.getByRole("button", { name: "Set up floors" }).click();
    await fieldByLabel(page, "Room prefix").fill("E2EG");
    await fieldByLabel(page, "Start number").fill("1");
    await fieldByLabel(page, "Number of rooms").fill("2");
    await fieldByLabel(page, "Beds per room").fill("2");
    await page.getByRole("button", { name: "Create structure" }).click();
    await expect(page.getByText("Ground Floor")).toBeVisible({ timeout: 10000 });
    await expect.poll(() => prisma.room.count({ where: { hostelId: hostelId!, name: { startsWith: "E2EG" } } })).toBe(2);
    await expect.poll(() => prisma.bed.count({ where: { room: { hostelId: hostelId!, name: { startsWith: "E2EG" } } } })).toBe(4);
  });
});
