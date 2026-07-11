import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

test.describe("Accommodation: Auto Assign Rooms & Beds", () => {
  test.describe.configure({ mode: "serial" });

  let organizationId: string;
  let campId: string;
  let campusId: string;
  let venueId: string | undefined;

  let maleHostelId: string | undefined;
  let maleRoomId: string | undefined;
  let femaleHostelId: string | undefined;
  let femaleRoomId: string | undefined;

  let parentUserId: string | undefined;
  let camperId: string | undefined;
  let registrationId: string | undefined;
  let staffUserId: string | undefined;
  let staffProfileId: string | undefined;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;
    campusId = ctx.campusId;

    // A dedicated venue keeps the venue-picker dropdown unambiguous
    // regardless of what other specs have left behind in this shared dev DB.
    const venue = await prisma.venue.create({ data: { campId, name: `E2E Auto Bed Venue ${Date.now()}` } });
    venueId = venue.id;

    const maleHostel = await prisma.hostel.create({ data: { organizationId, venueId, name: `E2E Auto Male Hostel ${Date.now()}`, gender: "MALE" } });
    maleHostelId = maleHostel.id;
    const maleRoom = await prisma.room.create({ data: { hostelId: maleHostelId, name: "E2E Auto Male Room" } });
    maleRoomId = maleRoom.id;
    await prisma.bed.create({ data: { roomId: maleRoomId, label: "M-Bed 1" } });

    const femaleHostel = await prisma.hostel.create({ data: { organizationId, venueId, name: `E2E Auto Female Hostel ${Date.now()}`, gender: "FEMALE" } });
    femaleHostelId = femaleHostel.id;
    const femaleRoom = await prisma.room.create({ data: { hostelId: femaleHostelId, name: "E2E Auto Female Room" } });
    femaleRoomId = femaleRoom.id;
    await prisma.bed.create({ data: { roomId: femaleRoomId, label: "F-Bed 1" } });

    // Approved MALE camper, unassigned. Created directly via Prisma (not the
    // registration engine's submitRegistration) since this shared fixture
    // org has accumulated custom required FormFields over many prior e2e
    // sessions that this test doesn't care about filling in — see
    // tests/phase3-soft-delete.spec.ts for the same direct-create pattern.
    const parent = await prisma.user.create({
      data: { email: `e2e-autobed-parent-${Date.now()}@camply.test`, password: "x", role: "PARENT", organizationId, homeCampusId: campusId },
    });
    parentUserId = parent.id;
    const camper = await prisma.camper.create({
      data: { name: "E2E AutoBed Camper", userId: parent.id, organizationId, homeCampusId: campusId, gender: "MALE", dateOfBirth: new Date(2013, 5, 1) },
    });
    camperId = camper.id;
    const registration = await prisma.registration.create({
      data: { camperId: camper.id, campId, campusId, venueId, status: "APPROVED", registrationNumber: `E2E-AUTOBED-${Date.now()}` },
    });
    registrationId = registration.id;

    // Approved FEMALE teacher, unassigned.
    const staffUser = await prisma.user.create({
      data: { email: `e2e-autobed-staff-${Date.now()}@camply.test`, password: "x", role: "PARENT", organizationId },
    });
    staffUserId = staffUser.id;
    const staff = await prisma.staffProfile.create({
      data: {
        userId: staffUser.id,
        organizationId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: "E2E",
        lastName: "AutoBed Teacher",
        gender: "FEMALE",
        phone: "+1-555-0199",
        email: staffUser.email,
        assignedVenueId: venueId,
      },
    });
    staffProfileId = staff.id;
  });

  test.afterAll(async () => {
    if (maleRoomId) await prisma.bed.deleteMany({ where: { roomId: maleRoomId } });
    if (femaleRoomId) await prisma.bed.deleteMany({ where: { roomId: femaleRoomId } });
    if (maleRoomId) await prisma.room.deleteMany({ where: { id: maleRoomId } });
    if (femaleRoomId) await prisma.room.deleteMany({ where: { id: femaleRoomId } });
    if (maleHostelId) await prisma.hostel.deleteMany({ where: { id: maleHostelId } });
    if (femaleHostelId) await prisma.hostel.deleteMany({ where: { id: femaleHostelId } });
    if (registrationId) await prisma.registration.deleteMany({ where: { id: registrationId } });
    if (camperId) await prisma.camper.deleteMany({ where: { id: camperId } });
    if (parentUserId) await prisma.user.deleteMany({ where: { id: parentUserId } });
    if (staffProfileId) await prisma.staffProfile.deleteMany({ where: { id: staffProfileId } });
    if (staffUserId) await prisma.user.deleteMany({ where: { id: staffUserId } });
    if (venueId) await prisma.venue.deleteMany({ where: { id: venueId } });
  });

  test("assigns the male camper to the male hostel and the female teacher to the female hostel, respecting gender", async ({ page }) => {
    const venue = await prisma.venue.findUniqueOrThrow({ where: { id: venueId! } });

    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/camp-structure");
    await page.getByRole("tab", { name: "Accommodation" }).click();
    await page.locator("select").first().selectOption({ label: venue.name });

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Auto Assign Rooms & Beds" }).click();

    await expect(page.getByText(/assigned/i)).toBeVisible({ timeout: 15000 });

    const updatedReg = await prisma.registration.findUniqueOrThrow({ where: { id: registrationId! } });
    expect(updatedReg.roomId).toBe(maleRoomId);

    const updatedStaff = await prisma.staffProfile.findUniqueOrThrow({ where: { id: staffProfileId! } });
    expect(updatedStaff.assignedRoomId).toBe(femaleRoomId);
  });
});
