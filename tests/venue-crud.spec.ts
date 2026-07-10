import { test, expect } from "@playwright/test";
import { prisma, loginWithPassword } from "./helpers";

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

    await page.getByRole("button", { name: "Add Venue" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Venue Name").fill(venueName);
    await dialog.getByLabel(/Capacity/).fill("120");
    await dialog.getByLabel("Registration Quota").fill("100");
    await dialog.getByRole("button", { name: "Add Venue", exact: true }).click();

    await expect(page.getByText(venueName)).toBeVisible({ timeout: 10000 });

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
});
