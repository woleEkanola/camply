import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

/**
 * ROOM_DOOR_SHEETS export kind — one A4 PDF page per room, meant to be
 * printed and pasted on the door so campers/staff can find their own room.
 */
test.describe("Room Door Sheets export", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  const stamp = `e2e-doorsheets-${Date.now()}`;
  let orgId: string;
  let campId: string;
  let campusId: string;
  let venueId: string;
  let hostelId: string;
  let roomId: string;
  let bedId: string;
  let camperUserEmail: string;
  let camperRegId: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    orgId = ctx.organizationId;
    campId = ctx.campId;
    campusId = ctx.campusId;

    const venue = await prisma.venue.create({ data: { campId, name: `${stamp} Venue` } });
    venueId = venue.id;
    const hostel = await prisma.hostel.create({ data: { organizationId: orgId, venueId, name: `${stamp} Hostel`, gender: "MALE" } });
    hostelId = hostel.id;
    const room = await prisma.room.create({ data: { hostelId, name: `${stamp} Room`, capacity: 2 } });
    roomId = room.id;
    const bed = await prisma.bed.create({ data: { roomId, label: "Bed 1" } });
    bedId = bed.id;
    await prisma.bed.create({ data: { roomId, label: "Bed 2" } }); // deliberately left empty

    camperUserEmail = `${stamp}-camper@camply.test`;
    const parent = await prisma.user.create({ data: { email: camperUserEmail, password: "x", role: "PARENT", organizationId: orgId, homeCampusId: campusId } });
    const camper = await prisma.camper.create({ data: { name: `${stamp} Camper`, userId: parent.id, organizationId: orgId, homeCampusId: campusId, gender: "Male" } });
    const reg = await prisma.registration.create({ data: { camperId: camper.id, campId, campusId, status: "APPROVED", roomId } });
    await prisma.bed.update({ where: { id: bedId }, data: { registrationId: reg.id } });
    camperRegId = reg.id;
  });

  test.afterAll(async () => {
    await prisma.exportJob.deleteMany({ where: { organizationId: orgId, kind: "ROOM_DOOR_SHEETS" } });
    await prisma.bed.deleteMany({ where: { roomId } });
    await prisma.room.deleteMany({ where: { id: roomId } });
    await prisma.hostel.deleteMany({ where: { id: hostelId } });
    await prisma.venue.deleteMany({ where: { id: venueId } });
    await prisma.registration.deleteMany({ where: { id: camperRegId } });
    await prisma.camper.deleteMany({ where: { name: { contains: stamp } } });
    await prisma.user.deleteMany({ where: { email: camperUserEmail } });
  });

  test("admin can generate and download a Room Door Sheets PDF", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/campers");

    await page.getByRole("button", { name: "Export", exact: true }).click();
    const picker = page.getByTestId("export-picker-panel");
    await expect(picker).toBeVisible();
    await picker.getByRole("button", { name: "Room Door Sheets", exact: true }).click();

    const dialog = page.getByTestId("dialog-panel");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Export", exact: true }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    await expect
      .poll(
        async () => {
          const j = await prisma.exportJob.findFirst({ where: { organizationId: orgId, kind: "ROOM_DOOR_SHEETS" }, orderBy: { createdAt: "desc" } });
          return j?.status;
        },
        { timeout: 30000 }
      )
      .toBe("DONE");

    const job = await prisma.exportJob.findFirstOrThrow({ where: { organizationId: orgId, kind: "ROOM_DOOR_SHEETS" }, orderBy: { createdAt: "desc" } });
    expect(job.fileSize).toBeGreaterThan(0);

    const response = await page.request.get(`/api/exports/${job.id}/download`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/pdf");
    const body = await response.body();
    expect(body.slice(0, 5).toString("utf-8")).toBe("%PDF-");
  });
});
