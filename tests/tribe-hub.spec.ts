import { test, expect } from "@playwright/test";
import { hashPassword } from "../src/lib/auth";
import { getFixtureOrgContext, loginWithPassword, prisma } from "./helpers";

test.describe("Tribe operations hub", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);
  let tribeId = "";
  let teacherUserId = "";
  let teacherProfileId = "";
  let camperUserId = "";
  let camperId = "";
  let registrationId = "";
  let teacherEmail = "";
  let camperName = "";

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    const stamp = Date.now();
    teacherEmail = `tribe-head-${stamp}@camply.test`;
    camperName = `Tribe Leader Camper ${stamp}`;
    const tribe = await prisma.tribe.create({ data: { campId: ctx.campId, name: `E2E Tribe Hub ${stamp}`, color: "#7C3AED" } });
    tribeId = tribe.id;
    const teacher = await prisma.user.create({ data: { email: teacherEmail, password: await hashPassword("password123"), role: "TEACHER", organizationId: ctx.organizationId } });
    teacherUserId = teacher.id;
    const profile = await prisma.staffProfile.create({ data: { userId: teacher.id, organizationId: ctx.organizationId, campId: ctx.campId, type: "TEACHER", status: "APPROVED", firstName: "Tribe", lastName: "Head", gender: "MALE", phone: "08000000008", email: teacherEmail } });
    teacherProfileId = profile.id;
    const parent = await prisma.user.create({ data: { email: `tribe-camper-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId: ctx.organizationId } });
    camperUserId = parent.id;
    const camper = await prisma.camper.create({ data: { name: camperName, gender: "MALE", userId: parent.id, organizationId: ctx.organizationId, homeCampusId: ctx.campusId } });
    camperId = camper.id;
    const registration = await prisma.registration.create({ data: { camperId: camper.id, campId: ctx.campId, campusId: ctx.campusId, tribeId: tribe.id, status: "APPROVED", registrationNumber: `TRIBE-${stamp}` } });
    registrationId = registration.id;
  });

  test.afterAll(async () => {
    if (tribeId) await prisma.tribe.updateMany({ where: { id: tribeId }, data: { maleHeadId: null, maleCamperLeaderId: null } });
    if (registrationId) await prisma.registration.deleteMany({ where: { id: registrationId } });
    if (camperId) await prisma.camper.deleteMany({ where: { id: camperId } });
    if (teacherProfileId) await prisma.staffProfile.deleteMany({ where: { id: teacherProfileId } });
    await prisma.user.deleteMany({ where: { id: { in: [teacherUserId, camperUserId].filter(Boolean) } } });
    if (tribeId) await prisma.tribe.deleteMany({ where: { id: tribeId } });
  });

  test("admin assigns leaders and the teacher gets the complete own-tribe workspace", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("/admin/tribes");
    const hub = page.getByTestId("tribe-hub");
    await hub.getByLabel("Choose tribe").selectOption(tribeId);
    // Campers is the default tab now — Leadership assignment lives on Overview.
    await hub.getByRole("button", { name: "Overview", exact: true }).click();
    await hub.getByLabel("Assign Male teacher head").selectOption(teacherProfileId);
    await expect.poll(() => prisma.tribe.findUnique({ where: { id: tribeId } }).then((tribe) => tribe?.maleHeadId)).toBe(teacherProfileId);
    await hub.getByLabel("Assign Male camper leader").selectOption(registrationId);
    await expect.poll(() => prisma.tribe.findUnique({ where: { id: tribeId } }).then((tribe) => tribe?.maleCamperLeaderId)).toBe(registrationId);

    await page.context().clearCookies();
    await loginWithPassword(page, teacherEmail, "password123");
    await page.goto("/teacher/tribe");
    await expect(page.getByText(/E2E Tribe Hub/).first()).toBeVisible();
    for (const section of ["Overview", "Campers", "Teachers", "Attendance", "Points"]) {
      await expect(page.getByTestId("tribe-hub").getByRole("button", { name: section, exact: true })).toBeVisible();
    }
    await page.getByTestId("tribe-hub").getByRole("button", { name: "Campers", exact: true }).click();
    await expect(page.getByText(camperName)).toBeVisible();
    await page.getByTestId("tribe-hub").getByRole("button", { name: "Points", exact: true }).click();
    await expect(page.getByText("Point stations")).toBeVisible();
  });
});
