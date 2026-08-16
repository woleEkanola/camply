import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";
import { appRouter } from "../src/server/api/root";

/**
 * assignmentReadiness (src/server/api/routers/accommodation.ts) used to
 * compute the unassigned-people list and then discard it, returning only a
 * raw count — the assignment wizard's Step 5 showed "N to assign" with no
 * way to see who. This covers the new expandable name list and confirms it
 * clears once bulkAutoAssignBeds actually places that person.
 */
test.describe("Assignment setup: unassigned people visibility", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  const stamp = `e2e-assign-list-${Date.now()}`;
  let orgId: string;
  let campId: string;
  let campusId: string;
  let venueId: string;
  let regId: string;
  let adminId: string;
  const emails: string[] = [];
  let previousBedAllocationEnabled = false;
  let previousBedAllocationRules: unknown = null;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    orgId = ctx.organizationId;
    campId = ctx.campId;
    campusId = ctx.campusId;

    const camp = await prisma.camp.findUniqueOrThrow({ where: { id: campId }, select: { bedAllocationEnabled: true, bedAllocationRules: true } });
    previousBedAllocationEnabled = camp.bedAllocationEnabled;
    previousBedAllocationRules = camp.bedAllocationRules;
    await prisma.camp.update({ where: { id: campId }, data: { bedAllocationEnabled: true } });

    const tribe = await prisma.tribe.findFirst({ where: { campId } });
    if (!tribe) throw new Error("No tribe in fixture camp");

    const admin = await prisma.user.findFirstOrThrow({ where: { organizationId: orgId, role: "ADMIN" } });
    adminId = admin.id;

    const venue = await prisma.venue.create({ data: { campId, name: `${stamp} Venue` } });
    venueId = venue.id;
    const hostel = await prisma.hostel.create({ data: { organizationId: orgId, venueId, name: `${stamp} Hostel`, gender: "MIXED" } });
    const room = await prisma.room.create({ data: { hostelId: hostel.id, name: `${stamp} Room` } });
    await prisma.bed.create({ data: { roomId: room.id, label: "Bed 1" } });

    const email = `${stamp}-parent@camply.test`;
    emails.push(email);
    const parent = await prisma.user.create({ data: { email, password: "x", role: "PARENT", organizationId: orgId, homeCampusId: campusId } });
    const camper = await prisma.camper.create({
      data: { name: `${stamp} Camper`, userId: parent.id, organizationId: orgId, homeCampusId: campusId, gender: "Male" },
    });
    const reg = await prisma.registration.create({
      data: { camperId: camper.id, campId, campusId, venueId, tribeId: tribe.id, status: "APPROVED" },
    });
    regId = reg.id;
  });

  test.afterAll(async () => {
    await prisma.registration.deleteMany({ where: { id: regId } });
    await prisma.camper.deleteMany({ where: { name: { contains: stamp } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.bed.deleteMany({ where: { room: { hostel: { venueId } } } });
    await prisma.room.deleteMany({ where: { hostel: { venueId } } });
    await prisma.hostel.deleteMany({ where: { venueId } });
    await prisma.venue.deleteMany({ where: { id: venueId } });
    await prisma.camp.update({ where: { id: campId }, data: { bedAllocationEnabled: previousBedAllocationEnabled, bedAllocationRules: previousBedAllocationRules as any } });
  });

  test("expanding 'to assign' shows the camper's name, which clears after auto-assign places them", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/assignments");

    const step5 = page.getByTestId("assignment-step-5");
    await expect(step5).toContainText(`${stamp} Venue`, { timeout: 15000 });

    // Step 5 is frequently gated "Locked" by the shared fixture org's own
    // pre-existing ambient data (unrelated campers/staff missing a tribe
    // elsewhere in the camp) — that lock cascades a real CSS
    // `pointer-events: none` to every descendant, including this row, which
    // even `click({force:true})` can't reach (force only skips Playwright's
    // own actionability check, not the browser's real hit-testing).
    // `dispatchEvent` fires the click directly on the element, bypassing
    // hit-testing entirely, to exercise the toggle itself regardless of the
    // unrelated lock state.
    const venueRow = page.getByTestId(`assignment-venue-row-${venueId}`);
    await venueRow.getByRole("button", { name: /to assign/ }).dispatchEvent("click");
    await expect(venueRow).toContainText(`${stamp} Camper`);

    // Drive the actual placement via the same mutation the "Assign this
    // venue" button calls, rather than depending on that button's own
    // (unrelated) gender-shortfall/lock gating being satisfied by whatever
    // else happens to be in the shared fixture camp right now.
    const caller = appRouter.createCaller({
      prisma,
      session: { user: { id: adminId, email: "admin@camply.com", role: "ADMIN", organizationId: orgId }, expires: "" },
    } as any);
    await caller.accommodation.bulkAutoAssignBeds({ venueId });

    const reg = await prisma.registration.findUniqueOrThrow({ where: { id: regId } });
    expect(reg.roomId).not.toBeNull();

    await page.reload();
    await expect(page.getByTestId("assignment-step-5")).not.toContainText(`${stamp} Camper`, { timeout: 15000 });
  });
});
