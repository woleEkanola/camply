import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

/**
 * Regression coverage for the real engine bug fixed in Part 2b
 * (src/server/accommodation/engine.ts): `reserveBedsForStaff` reads each
 * room's tribe occupancy *before* any camper has been placed, so its
 * GROUP_TOGETHER guard can miss and reserve a teacher a bed in a room a
 * different tribe's campers go on to fill during the camper phase. Once
 * that happens, the teacher's own reserved bed becomes tribe-blocked for
 * them — and unlike campers (who already had a fallback), staff previously
 * had no second attempt and were left stranded with a free bed sitting
 * right next to them.
 *
 * This reproduces the exact scenario proven at the engine/vitest level in
 * src/server/accommodation/__tests__/engine.test.ts ("saves a teacher
 * stranded in their own reserved bed's room once a different tribe's
 * camper takes the other bed in it") through the real admin UI: one MALE
 * hostel, two rooms of two beds each, one tribe-A teacher, three tribe-B
 * campers exactly filling the three non-reserved beds so one of them lands
 * in the teacher's reserved room.
 */
test.describe("Bed assignment: staff tribe fallback", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  const stamp = Date.now();
  let organizationId: string;
  let campId: string;
  let campusId: string;
  let venueId: string;
  let hostelId: string;
  let room1Id: string;
  let room2Id: string;
  let tribeAId: string;
  let tribeBId: string;

  let teacherUserId: string;
  let teacherProfileId: string;
  const camperIds: string[] = [];
  const registrationIds: string[] = [];
  const parentUserIds: string[] = [];

  let previousBedAllocationEnabled = false;
  let previousBedAllocationRules: unknown = null;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;
    campusId = ctx.campusId;

    const camp = await prisma.camp.findUniqueOrThrow({ where: { id: campId }, select: { bedAllocationEnabled: true, bedAllocationRules: true } });
    previousBedAllocationEnabled = camp.bedAllocationEnabled;
    previousBedAllocationRules = camp.bedAllocationRules;
    await prisma.camp.update({ where: { id: campId }, data: { bedAllocationEnabled: true, bedAllocationRules: [{ criterion: "GROUP_TOGETHER", enabled: true }] } });

    const venue = await prisma.venue.create({ data: { campId, name: `E2E Strand Venue ${stamp}` } });
    venueId = venue.id;

    const hostel = await prisma.hostel.create({ data: { organizationId, venueId, name: `E2E Strand Hostel ${stamp}`, gender: "MALE" } });
    hostelId = hostel.id;
    const room1 = await prisma.room.create({ data: { hostelId, name: "E2E Strand Room 1", displayOrder: 1 } });
    room1Id = room1.id;
    const room2 = await prisma.room.create({ data: { hostelId, name: "E2E Strand Room 2", displayOrder: 2 } });
    room2Id = room2.id;
    await prisma.bed.create({ data: { roomId: room1Id, label: "Bed A" } });
    await prisma.bed.create({ data: { roomId: room1Id, label: "Bed B" } });
    await prisma.bed.create({ data: { roomId: room2Id, label: "Bed A" } });
    await prisma.bed.create({ data: { roomId: room2Id, label: "Bed B" } });

    const tribeA = await prisma.tribe.create({ data: { campId, name: `E2E Strand Alpha ${stamp}`, code: `SA${String(stamp).slice(-5)}`, gender: "MIXED", maxCapacity: 50 } });
    tribeAId = tribeA.id;
    const tribeB = await prisma.tribe.create({ data: { campId, name: `E2E Strand Beta ${stamp}`, code: `SB${String(stamp).slice(-5)}`, gender: "MIXED", maxCapacity: 50 } });
    tribeBId = tribeB.id;

    // The teacher must be created (and thus reserved a bed) before any
    // camper is placed — reserveBedsForStaff runs first in
    // bulkAutoAssignBeds regardless of fixture creation order, but ordering
    // it this way here keeps the fixture's own narrative honest.
    const teacherUser = await prisma.user.create({
      data: { email: `e2e-strand-teacher-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId },
    });
    teacherUserId = teacherUser.id;
    const teacherProfile = await prisma.staffProfile.create({
      data: {
        userId: teacherUser.id,
        organizationId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: "E2E Strand",
        lastName: "Teacher",
        gender: "MALE",
        phone: "+1-555-0166",
        email: teacherUser.email,
        assignedVenueId: venueId,
        assignedTribeId: tribeAId,
      },
    });
    teacherProfileId = teacherProfile.id;

    // Three tribe-B campers exactly fill the three non-reserved beds — one
    // of them lands in Room 1 alongside the teacher's reserved bed.
    for (let i = 0; i < 3; i++) {
      const parent = await prisma.user.create({
        data: { email: `e2e-strand-parent-${i}-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId, homeCampusId: campusId },
      });
      parentUserIds.push(parent.id);
      const camper = await prisma.camper.create({
        data: { name: `E2E Strand Camper ${i}`, userId: parent.id, organizationId, homeCampusId: campusId, gender: "MALE", dateOfBirth: new Date(2013, 5, 1) },
      });
      camperIds.push(camper.id);
      const registration = await prisma.registration.create({
        data: { camperId: camper.id, campId, campusId, venueId, tribeId: tribeBId, status: "APPROVED", registrationNumber: `E2E-STRAND-${i}-${stamp}` },
      });
      registrationIds.push(registration.id);
    }
  });

  test.afterAll(async () => {
    await prisma.camp.update({ where: { id: campId }, data: { bedAllocationEnabled: previousBedAllocationEnabled, bedAllocationRules: previousBedAllocationRules as any } });
    await prisma.bed.deleteMany({ where: { roomId: { in: [room1Id, room2Id] } } });
    await prisma.registration.deleteMany({ where: { id: { in: registrationIds } } });
    await prisma.camper.deleteMany({ where: { id: { in: camperIds } } });
    await prisma.staffProfile.deleteMany({ where: { id: teacherProfileId } });
    await prisma.user.deleteMany({ where: { id: { in: [...parentUserIds, teacherUserId] } } });
    await prisma.room.deleteMany({ where: { id: { in: [room1Id, room2Id] } } });
    if (hostelId) await prisma.hostel.deleteMany({ where: { id: hostelId } });
    if (tribeAId) await prisma.tribe.deleteMany({ where: { id: tribeAId } });
    if (tribeBId) await prisma.tribe.deleteMany({ where: { id: tribeBId } });
    if (venueId) await prisma.venue.deleteMany({ where: { id: venueId } });
  });

  test("the reserved teacher still gets a bed, placed outside their own tribe's room, instead of being stranded", async ({ page }) => {
    const venue = await prisma.venue.findUniqueOrThrow({ where: { id: venueId } });

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/accommodation");
    await page.locator("select").first().selectOption({ label: venue.name });

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Assign Unassigned Rooms & Beds" }).click();

    // All four occupants (3 campers + 1 teacher) placed, zero failures —
    // the teacher is not among any exceptions.
    await expect(page.getByText(/^4 assigned\.?$/)).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/could not be placed/)).toHaveCount(0);

    const updatedTeacher = await prisma.staffProfile.findUniqueOrThrow({ where: { id: teacherProfileId } });
    expect(updatedTeacher.assignedRoomId, "teacher must not be left stranded with no bed").toBeTruthy();
    expect([room1Id, room2Id]).toContain(updatedTeacher.assignedRoomId);

    const updatedRegistrations = await prisma.registration.findMany({ where: { id: { in: registrationIds } } });
    expect(updatedRegistrations.every((r) => !!r.roomId), "every tribe-B camper must get a bed").toBe(true);

    // The actual bug fix: the teacher's assigned room is shared with at
    // least one tribe-B camper — i.e. they were placed outside their own
    // tribe's room block, which only happens via the ignoreTribe fallback.
    // Before the fix this scenario left the teacher with `bedId: null` and
    // no retry, even though a free bed sat right there in that room.
    const roommateTribes = updatedRegistrations.filter((r) => r.roomId === updatedTeacher.assignedRoomId).map((r) => r.tribeId);
    expect(roommateTribes.length, "teacher's room must actually hold a tribe-B camper").toBeGreaterThan(0);
    expect(roommateTribes.every((tribeId) => tribeId === tribeBId)).toBe(true);
    expect(updatedTeacher.assignedTribeId).toBe(tribeAId);
  });
});
