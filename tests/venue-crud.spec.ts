import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword, visibleText } from "./helpers";

test.describe("Admin: Venue CRUD scoped to a Camp", () => {
  test.describe.configure({ mode: "serial" });

  const venueName = `E2E Venue ${Date.now()}`;
  let venueId: string | undefined;

  test.afterAll(async () => {
    if (venueId) {
      await prisma.hostel.deleteMany({ where: { venueId } });
      await prisma.venue.deleteMany({ where: { id: venueId } });
    }
  });

  test("owner can create a venue under the active camp with quota/capacity set", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/venues");

    await page.getByRole("button", { name: "Add Venue" }).first().click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Venue Name").fill(venueName);
    await dialog.getByLabel(/Capacity/).fill("120");
    await dialog.getByLabel("Registration Quota").fill("100");
    await dialog.getByRole("button", { name: "Add Venue", exact: true }).click();

    await expect(visibleText(page, venueName)).toBeVisible({ timeout: 10000 });

    const venue = await prisma.venue.findFirstOrThrow({ where: { name: venueName } });
    venueId = venue.id;
    expect(venue.quota).toBe(100);
    expect(venue.capacity).toBe(120);
    expect(venue.campId).toBeTruthy();
  });

  test("hostels created for this venue are scoped to it, not to a campus", async ({ page }) => {
    test.skip(!venueId, "depends on previous test's venue fixture");
    const hostel = await prisma.hostel.create({
      data: { organizationId: (await prisma.venue.findUniqueOrThrow({ where: { id: venueId! }, include: { camp: true } })).camp.organizationId, venueId: venueId!, name: "E2E Venue Hostel" },
    });
    expect(hostel.venueId).toBe(venueId);

    const fetched = await prisma.hostel.findUniqueOrThrow({ where: { id: hostel.id } });
    expect(fetched.venueId).toBe(venueId);
  });

  test("deleting a venue with a live registration assigned to it is blocked", async ({ page }) => {
    test.skip(!venueId, "depends on the first test's venue fixture");
    const { organizationId, campId, campusId } = await getFixtureOrgContext();

    const parentEmail = `e2e-venue-delete-parent-${Date.now()}@camply.test`;
    const parent = await prisma.user.create({ data: { email: parentEmail, password: "x", role: "PARENT", organizationId } });
    const camper = await prisma.camper.create({ data: { name: "E2E Venue-Block Camper", userId: parent.id, organizationId, homeCampusId: campusId } });
    const registration = await prisma.registration.create({
      data: { camperId: camper.id, campId, campusId, venueId, status: "APPROVED", registrationNumber: `E2E-VENUE-BLOCK-${Date.now()}` },
    });

    try {
      await loginWithPassword(page, "owner@camply.com", "password123");
      await page.goto("/admin/venues");

      const row = page.locator("tr", { hasText: venueName });
      await row.getByRole("button", { name: "Delete" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();

      await expect(page.getByText(/registration.*assigned to it/i).first()).toBeVisible({ timeout: 10000 });
      await expect(prisma.venue.findUniqueOrThrow({ where: { id: venueId! } })).resolves.toMatchObject({ deletedAt: null });
    } finally {
      await prisma.registration.deleteMany({ where: { id: registration.id } });
      await prisma.camper.deleteMany({ where: { id: camper.id } });
      await prisma.user.deleteMany({ where: { id: parent.id } });
    }
  });

  test("deleting an empty venue soft-deletes it and cascades to its hostels", async ({ page }) => {
    test.skip(!venueId, "depends on the first test's venue fixture");

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/venues");

    const row = page.locator("tr", { hasText: venueName });
    await row.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();

    // visibleText, not a raw getByText — Table.tsx dual-renders a desktop <td>
    // and a mobile card <div> from the same data; while the delete mutation's
    // refetch is still in flight both stale copies are briefly in the DOM at
    // once, which strict-mode-violates a bare (not.)toBeVisible() check.
    await expect(visibleText(page, venueName)).not.toBeVisible({ timeout: 10000 });

    const deletedVenue = await prisma.venue.findUniqueOrThrow({ where: { id: venueId! } });
    expect(deletedVenue.deletedAt).not.toBeNull();

    const hostels = await prisma.hostel.findMany({ where: { venueId: venueId! } });
    expect(hostels.length).toBeGreaterThan(0);
    for (const hostel of hostels) {
      expect(hostel.deletedAt).not.toBeNull();
    }
  });
});
