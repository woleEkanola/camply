import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

/**
 * Exercises the Campus Representative authorization gap fixed in this
 * refactor: tribe.assign (and document.review, same helper) used to only
 * check `role === LOCATION_ADMIN`/`CAMPUS_REPRESENTATIVE` with no
 * re-derivation of which campus the rep is actually scoped to, letting any
 * rep in the org act on any campus's registrations. `assertOrgAdminOrCampusRep`
 * (src/server/api/trpc/scoping.ts) now re-checks against the DB on every call.
 */
test.describe("Campus Representative scoping", () => {
  test.describe.configure({ mode: "serial" });

  const repAEmail = `e2e-repA-${Date.now()}@camply.test`;
  const repBEmail = `e2e-repB-${Date.now()}@camply.test`;
  const camperAParentEmail = `e2e-campera-parent-${Date.now()}@camply.test`;
  const camperBParentEmail = `e2e-camperb-parent-${Date.now()}@camply.test`;

  let campusAId: string;
  let campusBId: string;
  let repAId: string;
  let repBId: string;
  let registrationAId: string;
  let registrationBId: string;
  let tribeId: string;
  let camperAParentId: string;
  let camperBParentId: string;
  let camperAId: string;
  let camperBId: string;

  test.beforeAll(async () => {
    const { organizationId, campId } = await getFixtureOrgContext();

    const campusA = await prisma.campus.create({
      data: { name: `E2E Campus A ${Date.now()}`, slug: `e2e-campus-a-${Date.now()}`, address: "1 A St", city: "Testville", country: "Testland", organizationId },
    });
    campusAId = campusA.id;
    const campusB = await prisma.campus.create({
      data: { name: `E2E Campus B ${Date.now()}`, slug: `e2e-campus-b-${Date.now()}`, address: "1 B St", city: "Testville", country: "Testland", organizationId },
    });
    campusBId = campusB.id;

    const password = await bcrypt.hash("password123", 10);
    const repAUser = await prisma.user.create({
      data: { email: repAEmail, password, role: "CAMPUS_REPRESENTATIVE", organizationId, managedCampuses: { connect: { id: campusAId } } },
    });
    repAId = repAUser.id;
    const repBUser = await prisma.user.create({
      data: { email: repBEmail, password, role: "CAMPUS_REPRESENTATIVE", organizationId, managedCampuses: { connect: { id: campusBId } } },
    });
    repBId = repBUser.id;

    const parentA = await prisma.user.create({ data: { email: camperAParentEmail, password: "x", role: "PARENT", organizationId } });
    camperAParentId = parentA.id;
    const parentB = await prisma.user.create({ data: { email: camperBParentEmail, password: "x", role: "PARENT", organizationId } });
    camperBParentId = parentB.id;

    const camperA = await prisma.camper.create({ data: { name: "E2E Campus A Camper", userId: parentA.id, organizationId, homeCampusId: campusAId } });
    camperAId = camperA.id;
    const camperB = await prisma.camper.create({ data: { name: "E2E Campus B Camper", userId: parentB.id, organizationId, homeCampusId: campusBId } });
    camperBId = camperB.id;

    const registrationA = await prisma.registration.create({
      data: { camperId: camperA.id, campId, campusId: campusAId, status: "APPROVED", registrationNumber: `E2E-SCOPE-A-${Date.now()}` },
    });
    registrationAId = registrationA.id;
    const registrationB = await prisma.registration.create({
      data: { camperId: camperB.id, campId, campusId: campusBId, status: "APPROVED", registrationNumber: `E2E-SCOPE-B-${Date.now()}` },
    });
    registrationBId = registrationB.id;

    const tribe = await prisma.tribe.create({ data: { campId, name: `E2E Scoping Tribe ${Date.now()}` } });
    tribeId = tribe.id;
  });

  test.afterAll(async () => {
    await prisma.registration.deleteMany({ where: { id: { in: [registrationAId, registrationBId] } } });
    await prisma.tribe.deleteMany({ where: { id: tribeId } });
    await prisma.camper.deleteMany({ where: { id: { in: [camperAId, camperBId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [camperAParentId, camperBParentId, repAId, repBId] } } });
    await prisma.campus.deleteMany({ where: { id: { in: [campusAId, campusBId] } } });
  });

  test("a rep can assign a tribe on their own campus's registration", async ({ page }) => {
    await loginWithPassword(page, repAEmail, "password123");

    const res = await page.request.post("/api/trpc/tribe.assign?batch=1", {
      data: { "0": { json: { registrationId: registrationAId, tribeId } } },
      headers: { "Content-Type": "application/json" },
    });

    expect(res.ok()).toBe(true);
    const updated = await prisma.registration.findUniqueOrThrow({ where: { id: registrationAId } });
    expect(updated.tribeId).toBe(tribeId);
  });

  test("a rep is FORBIDDEN from assigning a tribe on another campus's registration", async ({ page }) => {
    await loginWithPassword(page, repAEmail, "password123");

    const res = await page.request.post("/api/trpc/tribe.assign?batch=1", {
      data: { "0": { json: { registrationId: registrationBId, tribeId } } },
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status()).toBe(403);
    const unchanged = await prisma.registration.findUniqueOrThrow({ where: { id: registrationBId } });
    expect(unchanged.tribeId).toBeNull();
  });

  test("the other rep can act on their own campus's registration", async ({ page }) => {
    await loginWithPassword(page, repBEmail, "password123");

    const res = await page.request.post("/api/trpc/tribe.assign?batch=1", {
      data: { "0": { json: { registrationId: registrationBId, tribeId } } },
      headers: { "Content-Type": "application/json" },
    });

    expect(res.ok()).toBe(true);
    const updated = await prisma.registration.findUniqueOrThrow({ where: { id: registrationBId } });
    expect(updated.tribeId).toBe(tribeId);
  });
});
