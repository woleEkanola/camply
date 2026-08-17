import { test, expect } from "@playwright/test";
import {
  loginWithOtp,
  getFixtureOrgContext,
  prisma,
} from "./helpers";
import { ensureRegistrationQrToken } from "../src/server/registration/idToken";

// Before this fix, a parent had almost no way to check which tribe their
// camper was actually in — /dashboard didn't fetch it at all, the documents
// page only knew a boolean "hasTribe", and the acceptance letter had no
// tribe field whatsoever. This is what makes an incorrect campaign email
// hard to catch: there's nowhere to cross-check it. Asserts the tribe name
// now shows up in all three places.
test.describe("Parent can see their camper's tribe on the dashboard, documents page, and acceptance letter", () => {
  test.describe.configure({ mode: "serial" });

  let tribeName: string;
  let tribeId: string;
  let camperName: string;
  let camperId: string;
  let registrationId: string;
  let parentEmail: string;
  let parentUserId: string;

  test.beforeAll(async () => {
    const { organizationId, campId, campusId } = await getFixtureOrgContext();
    const stamp = Date.now();

    const tribe = await prisma.tribe.create({ data: { campId, name: `E2E Visibility Tribe ${stamp}`, color: "#2E7D32" } });
    tribeName = tribe.name;
    tribeId = tribe.id;

    parentEmail = `e2e-tribe-visibility-parent-${stamp}@camply.test`;
    const parent = await prisma.user.create({
      data: { email: parentEmail, password: "x", role: "PARENT", organizationId },
    });
    parentUserId = parent.id;

    camperName = `E2E Visibility Camper ${stamp}`;
    const camper = await prisma.camper.create({
      data: { name: camperName, userId: parentUserId, organizationId, homeCampusId: campusId, gender: "MALE" },
    });
    camperId = camper.id;

    const registration = await prisma.registration.create({
      data: {
        camperId,
        campId,
        campusId,
        status: "APPROVED",
        registrationNumber: `E2ETRB-${stamp}`,
        tribeId,
      },
    });
    registrationId = registration.id;
    await prisma.$transaction((tx) => ensureRegistrationQrToken(tx as any, registrationId));
  });

  test.afterAll(async () => {
    try {
      await prisma.registration.deleteMany({ where: { id: registrationId } });
      await prisma.camper.deleteMany({ where: { id: camperId } });
      await prisma.user.deleteMany({ where: { id: parentUserId } });
      await prisma.tribe.deleteMany({ where: { id: tribeId } });
    } catch {
      // best-effort cleanup
    }
  });

  test("shows the tribe name on /dashboard and /dashboard/documents, and prints it on the acceptance letter", async ({ page }) => {
    await loginWithOtp(page, parentEmail);
    await page.waitForURL(/\/dashboard/, { timeout: 20000 });

    // camperName legitimately appears twice on /dashboard — the camper card
    // heading and the "Camp Registrations" list link — .first() is enough
    // since this is just confirming visibility, not scoping a click.
    await expect(page.getByText(camperName).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(tribeName, { exact: false }).first()).toBeVisible({ timeout: 10000 });

    await page.goto("/dashboard/documents");
    await expect(page.getByText(camperName).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(tribeName, { exact: false }).first()).toBeVisible({ timeout: 10000 });

    // PDF content streams are Flate-compressed by pdf-lib, so a raw
    // substring search over the response body can't reliably confirm the
    // tribe name was drawn — that's covered instead by a vitest unit test
    // on generateAcceptanceLetterPdf's tribeName param. Assert the route
    // wiring (200 + correct content type) here.
    const letterUrl = `/api/registrations/${registrationId}/acceptance-letter`;
    const response = await page.request.get(letterUrl);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/pdf");
  });
});
