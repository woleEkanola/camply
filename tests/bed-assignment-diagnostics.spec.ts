import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

/**
 * Regression coverage for the bed-assignment diagnostics gap
 * (src/server/accommodation/engine.ts's suggestBed / bulkAutoAssignBeds,
 * surfaced in AccommodationManager.tsx): before this fix, a failed
 * placement produced a hardcoded "no matching-gender bed available" string
 * regardless of the real reason, and `results.length - assigned` counted
 * already-assigned people as failures. Now each failure carries a real
 * BedFailureReason (src/lib/bedFailureMessages.ts) and the UI renders it.
 */
test.describe("Bed assignment: real diagnostics", () => {
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now();
  let organizationId: string;
  let campId: string;
  let campusId: string;
  let venueId: string;

  let maleHostelId: string;
  let maleRoomId: string;
  let maleBedId: string;
  let femaleHostelId: string;
  let femaleRoomId: string;

  let preassignedParentId: string | undefined;
  let preassignedCamperId: string | undefined;
  let preassignedRegistrationId: string | undefined;

  let overflowParentId: string | undefined;
  let overflowCamperId: string | undefined;
  let overflowRegistrationId: string | undefined;

  let genderlessStaffUserId: string | undefined;
  let genderlessStaffProfileId: string | undefined;

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
    // GROUP_TOGETHER off: this scenario is about gender diagnostics, not
    // tribe coverage, and bulkAutoAssignBeds refuses to run at all if any
    // occupant at this venue lacks a tribe while GROUP_TOGETHER is on.
    await prisma.camp.update({ where: { id: campId }, data: { bedAllocationEnabled: true, bedAllocationRules: [{ criterion: "GROUP_TOGETHER", enabled: false }] } });

    const venue = await prisma.venue.create({ data: { campId, name: `E2E Diag Venue ${stamp}` } });
    venueId = venue.id;

    // Only gendered hostels — no MIXED capacity — so a genderless occupant
    // has structurally nowhere to go (MISSING_GENDER), and a single MALE
    // bed lets a second MALE camper exhaust it (NO_FREE_BEDS).
    const maleHostel = await prisma.hostel.create({ data: { organizationId, venueId, name: `E2E Diag Male Hostel ${stamp}`, gender: "MALE" } });
    maleHostelId = maleHostel.id;
    const maleRoom = await prisma.room.create({ data: { hostelId: maleHostelId, name: "E2E Diag Male Room" } });
    maleRoomId = maleRoom.id;
    const maleBed = await prisma.bed.create({ data: { roomId: maleRoomId, label: "M-Bed 1" } });
    maleBedId = maleBed.id;

    const femaleHostel = await prisma.hostel.create({ data: { organizationId, venueId, name: `E2E Diag Female Hostel ${stamp}`, gender: "FEMALE" } });
    femaleHostelId = femaleHostel.id;
    const femaleRoom = await prisma.room.create({ data: { hostelId: femaleHostelId, name: "E2E Diag Female Room" } });
    femaleRoomId = femaleRoom.id;
    await prisma.bed.create({ data: { roomId: femaleRoomId, label: "F-Bed 1" } });

    // Already-assigned MALE camper, occupying the venue's sole MALE bed
    // *before* the run — bulkAutoAssignBeds only ever queries roomId: null,
    // so this row never enters the batch at all. That's the real mechanism
    // behind "an already-placed person is not counted as a failure": they
    // don't appear in the run's results, so AccommodationManager's
    // `results.length - assigned` (the old, buggy count) would have wrongly
    // implied one more failure than actually happened, while the fixed
    // `!r.bedId && !r.preserved` filter — and this test — correctly shows
    // zero exceptions attributable to them.
    const preParent = await prisma.user.create({
      data: { email: `e2e-diag-preassigned-parent-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId, homeCampusId: campusId },
    });
    preassignedParentId = preParent.id;
    const preCamper = await prisma.camper.create({
      data: { name: "E2E Diag Preassigned Camper", userId: preParent.id, organizationId, homeCampusId: campusId, gender: "MALE", dateOfBirth: new Date(2013, 5, 1) },
    });
    preassignedCamperId = preCamper.id;
    const preReg = await prisma.registration.create({
      data: { camperId: preCamper.id, campId, campusId, venueId, roomId: maleRoomId, status: "APPROVED", registrationNumber: `E2E-DIAG-PRE-${stamp}` },
    });
    preassignedRegistrationId = preReg.id;
    await prisma.bed.update({ where: { id: maleBedId }, data: { status: "OCCUPIED", registrationId: preReg.id } });

    // Second MALE camper, unassigned — the venue's only MALE bed is already
    // taken by the pre-assigned camper above, so this one must fail with
    // NO_FREE_BEDS ("a gender-eligible hostel exists, but every bed in it is
    // taken").
    const overflowParent = await prisma.user.create({
      data: { email: `e2e-diag-overflow-parent-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId, homeCampusId: campusId },
    });
    overflowParentId = overflowParent.id;
    const overflowCamper = await prisma.camper.create({
      data: { name: "E2E Diag Overflow Camper", userId: overflowParent.id, organizationId, homeCampusId: campusId, gender: "MALE", dateOfBirth: new Date(2013, 5, 1) },
    });
    overflowCamperId = overflowCamper.id;
    const overflowReg = await prisma.registration.create({
      data: { camperId: overflowCamper.id, campId, campusId, venueId, status: "APPROVED", registrationNumber: `E2E-DIAG-OVF-${stamp}` },
    });
    overflowRegistrationId = overflowReg.id;

    // Approved teacher with NO gender on file, assigned to this venue —
    // must fail with MISSING_GENDER ("their own gender doesn't normalize").
    const staffUser = await prisma.user.create({
      data: { email: `e2e-diag-staff-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId },
    });
    genderlessStaffUserId = staffUser.id;
    const staffProfile = await prisma.staffProfile.create({
      data: {
        userId: staffUser.id,
        organizationId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: "E2E Diag",
        lastName: "Genderless Teacher",
        gender: null,
        phone: "+1-555-0188",
        email: staffUser.email,
        assignedVenueId: venueId,
      },
    });
    genderlessStaffProfileId = staffProfile.id;
  });

  test.afterAll(async () => {
    await prisma.camp.update({ where: { id: campId }, data: { bedAllocationEnabled: previousBedAllocationEnabled, bedAllocationRules: previousBedAllocationRules as any } });

    if (preassignedRegistrationId) await prisma.registration.deleteMany({ where: { id: preassignedRegistrationId } });
    if (preassignedCamperId) await prisma.camper.deleteMany({ where: { id: preassignedCamperId } });
    if (preassignedParentId) await prisma.user.deleteMany({ where: { id: preassignedParentId } });

    if (overflowRegistrationId) await prisma.registration.deleteMany({ where: { id: overflowRegistrationId } });
    if (overflowCamperId) await prisma.camper.deleteMany({ where: { id: overflowCamperId } });
    if (overflowParentId) await prisma.user.deleteMany({ where: { id: overflowParentId } });

    if (genderlessStaffProfileId) await prisma.staffProfile.deleteMany({ where: { id: genderlessStaffProfileId } });
    if (genderlessStaffUserId) await prisma.user.deleteMany({ where: { id: genderlessStaffUserId } });

    if (maleRoomId) { await prisma.bed.deleteMany({ where: { roomId: maleRoomId } }); await prisma.room.deleteMany({ where: { id: maleRoomId } }); }
    if (femaleRoomId) { await prisma.bed.deleteMany({ where: { roomId: femaleRoomId } }); await prisma.room.deleteMany({ where: { id: femaleRoomId } }); }
    if (maleHostelId) await prisma.hostel.deleteMany({ where: { id: maleHostelId } });
    if (femaleHostelId) await prisma.hostel.deleteMany({ where: { id: femaleHostelId } });
    if (venueId) await prisma.venue.deleteMany({ where: { id: venueId } });
  });

  test("names each unplaceable person with a real reason and action, and leaves the pre-assigned camper out of it", async ({ page }) => {
    const venue = await prisma.venue.findUniqueOrThrow({ where: { id: venueId } });

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/accommodation");
    await page.locator("select").first().selectOption({ label: venue.name });

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Assign Unassigned Rooms & Beds" }).click();

    // Nobody new gets a bed this run (the sole MALE bed is already taken,
    // the FEMALE bed has no eligible occupant) — both exceptions surface.
    await expect(page.getByText(/^0 assigned, 2 could not be placed/)).toBeVisible({ timeout: 15000 });

    const exceptionsList = page.locator("ul.list-disc");
    await expect(exceptionsList.getByText(/E2E Diag Genderless Teacher \(Staff\) — No gender on file/)).toBeVisible();
    await expect(exceptionsList.getByText(/E2E Diag Overflow Camper \(Camper\) — No free bed of their gender/)).toBeVisible();

    // The pre-assigned camper never entered the batch at all — not named
    // anywhere in the exceptions list, and their existing bed is untouched.
    await expect(exceptionsList.getByText(/E2E Diag Preassigned Camper/)).toHaveCount(0);
    const preassignedReg = await prisma.registration.findUniqueOrThrow({ where: { id: preassignedRegistrationId! } });
    expect(preassignedReg.roomId).toBe(maleRoomId);
    const preassignedBed = await prisma.bed.findUniqueOrThrow({ where: { id: maleBedId } });
    expect(preassignedBed.registrationId).toBe(preassignedRegistrationId);

    // The overflow camper and genderless teacher were correctly left
    // unassigned, not silently dropped.
    const overflowReg = await prisma.registration.findUniqueOrThrow({ where: { id: overflowRegistrationId! } });
    expect(overflowReg.roomId).toBeNull();
    const teacherProfile = await prisma.staffProfile.findUniqueOrThrow({ where: { id: genderlessStaffProfileId! } });
    expect(teacherProfile.assignedRoomId).toBeNull();
  });
});
