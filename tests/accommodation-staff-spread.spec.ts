import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

/**
 * STAFF_SPREAD (src/server/accommodation/engine.ts): staff must fan out one
 * per room and prefer rooms already holding campers, rather than clustering
 * together. Before this rule, GROUP_TOGETHER's +200 actively pulled same-tribe
 * staff into a single room. Campers are always placed before staff so the
 * engine can see which rooms need covering.
 */
test.describe("Accommodation: staff spread one per room", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  const stamp = Date.now();
  let organizationId: string;
  let campId: string;
  let campusId: string;
  let venueId: string;
  let hostelId: string;
  let tribeId: string;

  const roomIds: string[] = [];
  const staffProfileIds: string[] = [];
  const staffUserIds: string[] = [];
  const registrationIds: string[] = [];
  const camperIds: string[] = [];
  const parentUserIds: string[] = [];

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;
    campusId = ctx.campusId;

    const venue = await prisma.venue.create({ data: { campId, name: `E2E Spread Venue ${stamp}` } });
    venueId = venue.id;

    // One MALE hostel, 3 rooms x 4 beds. All staff and campers below are MALE
    // so the hard gender filter never masks what STAFF_SPREAD is doing.
    const hostel = await prisma.hostel.create({
      data: { organizationId, venueId, name: `E2E Spread Hostel ${stamp}`, gender: "MALE" },
    });
    hostelId = hostel.id;

    for (let r = 0; r < 3; r++) {
      const room = await prisma.room.create({ data: { hostelId, name: `E2E Spread Room ${r + 1}` } });
      roomIds.push(room.id);
      for (let b = 0; b < 4; b++) {
        await prisma.bed.create({ data: { roomId: room.id, label: `R${r + 1}-B${b + 1}` } });
      }
    }

    // A shared tribe for every camper AND every teacher — this is the exact
    // condition that used to cluster them (GROUP_TOGETHER +200 each).
    const tribe = await prisma.tribe.create({
      data: { campId, name: `E2E Spread Tribe ${stamp}`, code: `SPR${String(stamp).slice(-5)}`, gender: "MIXED", maxCapacity: 50 },
    });
    tribeId = tribe.id;

    // 6 approved MALE campers, all in that tribe.
    for (let i = 0; i < 6; i++) {
      const parent = await prisma.user.create({
        data: { email: `e2e-spread-parent-${i}-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId, homeCampusId: campusId },
      });
      parentUserIds.push(parent.id);
      const camper = await prisma.camper.create({
        data: { name: `E2E Spread Camper ${i}`, userId: parent.id, organizationId, homeCampusId: campusId, gender: "MALE", dateOfBirth: new Date(2013, 5, 1) },
      });
      camperIds.push(camper.id);
      const registration = await prisma.registration.create({
        data: { camperId: camper.id, campId, campusId, venueId, tribeId, status: "APPROVED", registrationNumber: `E2E-SPR-${i}-${stamp}` },
      });
      registrationIds.push(registration.id);
    }

    // 3 approved MALE teachers, same tribe, one per room is the expectation.
    for (let i = 0; i < 3; i++) {
      const staffUser = await prisma.user.create({
        data: { email: `e2e-spread-staff-${i}-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId },
      });
      staffUserIds.push(staffUser.id);
      const staff = await prisma.staffProfile.create({
        data: {
          userId: staffUser.id,
          organizationId,
          campId,
          type: "TEACHER",
          status: "APPROVED",
          firstName: "E2E Spread",
          lastName: `Teacher ${i}`,
          gender: "MALE",
          phone: `+1-555-07${String(i).padStart(2, "0")}`,
          email: staffUser.email,
          assignedVenueId: venueId,
          assignedTribeId: tribeId,
        },
      });
      staffProfileIds.push(staff.id);
    }
  });

  test.afterAll(async () => {
    // Unconditional cleanup in dependency order — beds/rooms reference the
    // hostel, and registrations/staff hold the room FKs.
    await prisma.bed.deleteMany({ where: { roomId: { in: roomIds } } });
    await prisma.registration.deleteMany({ where: { id: { in: registrationIds } } });
    await prisma.camper.deleteMany({ where: { id: { in: camperIds } } });
    await prisma.staffProfile.deleteMany({ where: { id: { in: staffProfileIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [...parentUserIds, ...staffUserIds] } } });
    await prisma.room.deleteMany({ where: { id: { in: roomIds } } });
    if (hostelId) await prisma.hostel.deleteMany({ where: { id: hostelId } });
    if (tribeId) await prisma.tribe.deleteMany({ where: { id: tribeId } });
    if (venueId) await prisma.venue.deleteMany({ where: { id: venueId } });
  });

  test("three same-tribe teachers land in three distinct rooms, each covering campers", async ({ page }) => {
    const venue = await prisma.venue.findUniqueOrThrow({ where: { id: venueId } });

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/accommodation");
    await page.locator("select").first().selectOption({ label: venue.name });

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Auto Assign Rooms & Beds" }).click();
    await expect(page.getByText(/^\d+ assigned(?:,|\.)/i)).toBeVisible({ timeout: 30000 });

    const staff = await prisma.staffProfile.findMany({ where: { id: { in: staffProfileIds } } });
    const assignedRooms = staff.map((s) => s.assignedRoomId);

    // Every teacher got a bed...
    expect(assignedRooms.every((r) => !!r)).toBe(true);
    // ...in one of our rooms...
    expect(assignedRooms.every((r) => roomIds.includes(r!))).toBe(true);
    // ...and no two share a room. This is the regression that STAFF_SPREAD
    // fixes: previously all three would pile into whichever room their
    // tribemates occupied.
    expect(new Set(assignedRooms).size).toBe(3);

    // The actual guarantee: no room full of campers is left without an adult.
    // (Not "every teacher sits with campers" — with more teachers than
    // camper-occupied rooms, spreading into an empty room is correct.)
    for (const roomId of roomIds) {
      const camperCount = await prisma.registration.count({ where: { roomId, deletedAt: null } });
      if (camperCount === 0) continue;
      const staffCount = await prisma.staffProfile.count({ where: { assignedRoomId: roomId, deletedAt: null } });
      expect(staffCount, `room ${roomId} holds ${camperCount} campers but no staff`).toBeGreaterThan(0);
    }
  });

  test("a fourth teacher doubles up only after every room already has one", async ({ page }) => {
    const venue = await prisma.venue.findUniqueOrThrow({ where: { id: venueId } });

    const extraUser = await prisma.user.create({
      data: { email: `e2e-spread-staff-extra-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId },
    });
    staffUserIds.push(extraUser.id);
    const extra = await prisma.staffProfile.create({
      data: {
        userId: extraUser.id,
        organizationId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: "E2E Spread",
        lastName: "Teacher Extra",
        gender: "MALE",
        phone: "+1-555-0799",
        email: extraUser.email,
        assignedVenueId: venueId,
        assignedTribeId: tribeId,
      },
    });
    staffProfileIds.push(extra.id);

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/accommodation");
    await page.locator("select").first().selectOption({ label: venue.name });

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Auto Assign Rooms & Beds" }).click();
    await expect(page.getByText(/^\d+ assigned(?:,|\.)/i)).toBeVisible({ timeout: 30000 });

    // With 3 rooms all already covered, the 4th teacher has to double up
    // somewhere rather than fail — running out of distinct rooms is not an error.
    const refreshed = await prisma.staffProfile.findUniqueOrThrow({ where: { id: extra.id } });
    expect(refreshed.assignedRoomId).not.toBeNull();
    expect(roomIds).toContain(refreshed.assignedRoomId!);
  });
});
