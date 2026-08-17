import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

/**
 * ROOMING_LIST export kind — flat spreadsheet of every occupant (campers and
 * staff together) with correction Flags (ROOM ONLY, GENDER MISMATCH,
 * INACTIVE STATUS), for offline correction and reallocation planning.
 */
test.describe("Rooming List export", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  const stamp = `e2e-roominglist-${Date.now()}`;
  let orgId: string;
  let campId: string;
  let campusId: string;
  let venueId: string;
  let hostelId: string;
  let roomId: string;
  let bedId: string;
  let camperUserEmail: string;
  let camperRegId: string;
  let teacherUserEmail: string;
  let teacherProfileId: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    orgId = ctx.organizationId;
    campId = ctx.campId;
    campusId = ctx.campusId;

    const venue = await prisma.venue.create({ data: { campId, name: `${stamp} Venue` } });
    venueId = venue.id;
    // Hostel is MALE-only — the camper below is deliberately Female, to
    // exercise the GENDER MISMATCH flag.
    const hostel = await prisma.hostel.create({ data: { organizationId: orgId, venueId, name: `${stamp} Hostel`, gender: "MALE" } });
    hostelId = hostel.id;
    const room = await prisma.room.create({ data: { hostelId, name: `${stamp} Room`, capacity: 2 } });
    roomId = room.id;
    const bed = await prisma.bed.create({ data: { roomId, label: "Bed 1" } });
    bedId = bed.id;

    camperUserEmail = `${stamp}-camper@camply.test`;
    const parent = await prisma.user.create({ data: { email: camperUserEmail, password: "x", role: "PARENT", organizationId: orgId, homeCampusId: campusId } });
    const camper = await prisma.camper.create({ data: { name: `${stamp} Camper`, userId: parent.id, organizationId: orgId, homeCampusId: campusId, gender: "Female" } });
    const reg = await prisma.registration.create({ data: { camperId: camper.id, campId, campusId, status: "APPROVED", roomId } });
    await prisma.bed.update({ where: { id: bedId }, data: { registrationId: reg.id } });
    camperRegId = reg.id;

    teacherUserEmail = `${stamp}-teacher@camply.test`;
    const teacherUser = await prisma.user.create({ data: { email: teacherUserEmail, password: "x", role: "TEACHER", organizationId: orgId } });
    const teacher = await prisma.staffProfile.create({
      data: {
        userId: teacherUser.id,
        organizationId: orgId,
        campId,
        type: "TEACHER",
        status: "APPROVED",
        firstName: `${stamp}`,
        lastName: "Teacher",
        email: teacherUserEmail,
        phone: "+1-555-0901",
        gender: "MALE",
        assignedHostelId: hostelId,
        assignedRoomId: roomId,
      },
    });
    teacherProfileId = teacher.id;
  });

  test.afterAll(async () => {
    await prisma.exportJob.deleteMany({ where: { organizationId: orgId, kind: "ROOMING_LIST" } });
    await prisma.bed.deleteMany({ where: { id: bedId } });
    await prisma.staffProfile.deleteMany({ where: { id: teacherProfileId } });
    await prisma.room.deleteMany({ where: { id: roomId } });
    await prisma.hostel.deleteMany({ where: { id: hostelId } });
    await prisma.venue.deleteMany({ where: { id: venueId } });
    await prisma.registration.deleteMany({ where: { id: camperRegId } });
    await prisma.camper.deleteMany({ where: { name: { contains: stamp } } });
    await prisma.user.deleteMany({ where: { email: { in: [camperUserEmail, teacherUserEmail] } } });
  });

  test("admin can export a Rooming List CSV containing both campers and staff, with a gender-mismatch flag", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campers");

    await page.getByRole("button", { name: "Export", exact: true }).click();
    const picker = page.getByTestId("export-picker-panel");
    await expect(picker).toBeVisible();
    await picker.getByRole("button", { name: "Rooming List", exact: true }).click();

    const dialog = page.getByTestId("dialog-panel");
    await expect(dialog).toBeVisible();
    // Default format is XLSX for this kind's descriptor order — switch to CSV so the test can read cell text directly.
    await dialog.getByLabel("CSV", { exact: true }).click();
    await dialog.getByRole("button", { name: "Export", exact: true }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    await expect
      .poll(
        async () => {
          const j = await prisma.exportJob.findFirst({ where: { organizationId: orgId, kind: "ROOMING_LIST" }, orderBy: { createdAt: "desc" } });
          return j?.status;
        },
        { timeout: 30000 }
      )
      .toBe("DONE");

    const job = await prisma.exportJob.findFirstOrThrow({ where: { organizationId: orgId, kind: "ROOMING_LIST" }, orderBy: { createdAt: "desc" } });
    expect(job.fileSize).toBeGreaterThan(0);

    const response = await page.request.get(`/api/exports/${job.id}/download`);
    expect(response.status()).toBe(200);
    const body = await response.body();
    const text = body.toString("utf-8");

    expect(text).toContain("Hostel");
    expect(text).toContain("Occupant Type");
    expect(text).toContain("Flags");
    expect(text).toContain(`${stamp} Camper`);
    expect(text).toContain(`${stamp} Teacher`);
    expect(text).toContain("GENDER MISMATCH");
  });
});
