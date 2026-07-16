import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, fieldByLabel } from "./helpers";

test.describe("Accommodation: bulk-add beds", () => {
  test.describe.configure({ mode: "serial" });

  let organizationId: string;
  let venueId: string | undefined;
  let hostelId: string | undefined;
  let roomId: string | undefined;

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
  });

  test.afterAll(async () => {
    if (roomId) await prisma.bed.deleteMany({ where: { roomId } });
    if (roomId) await prisma.room.deleteMany({ where: { id: roomId } });
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
    await expect(page.getByText(room.name)).toBeVisible({ timeout: 10000 });

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
});
