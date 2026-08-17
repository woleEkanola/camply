import { test, expect } from "@playwright/test";
import { randomBytes } from "crypto";
import { prisma, getFixtureOrgContext, loginWithOtp, onlyVisible } from "./helpers";

/**
 * Regression coverage for Part 3 — the new parent-facing documents page.
 * Before this, ID cards and acceptance letters only ever went out by
 * email; if that email never arrived, a parent had no way to get them.
 * Also covers the previously-nonexistent parent navigation (the
 * `dashboard` area returned `[]` from both navConfig.ts sidebar and
 * bottom-nav builders, so /dashboard/documents was an unreachable dead
 * end even once built) and the cross-tenant document-access guard.
 */
test.describe("Parent documents page", () => {
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now();
  let organizationId: string;
  let campId: string;
  let campusId: string;
  let tribeId: string;

  // Lowercase: the OTP route normalizes (lowercases) the email before its DB
  // lookup, so a mixed-case fixture email would never match the row created
  // here — this bit a first version of this spec (loginWithOtp always
  // failed with "No OTP appeared").
  const parentAEmail = `e2e-docs-parenta-${stamp}@camply.test`;
  const parentBEmail = `e2e-docs-parentb-${stamp}@camply.test`;
  let parentAUserId: string;
  let parentBUserId: string;

  let readyCamperId: string;
  let readyRegistrationId: string;
  let noTribeCamperId: string;
  let noTribeRegistrationId: string;
  let pendingCamperId: string;
  let pendingRegistrationId: string;

  let otherCamperId: string;
  let otherRegistrationId: string;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;
    campusId = ctx.campusId;

    const tribe = await prisma.tribe.create({ data: { campId, name: `E2E Docs Tribe ${stamp}` } });
    tribeId = tribe.id;

    const parentA = await prisma.user.create({ data: { email: parentAEmail, password: "x", role: "PARENT", organizationId, homeCampusId: campusId } });
    parentAUserId = parentA.id;
    const parentB = await prisma.user.create({ data: { email: parentBEmail, password: "x", role: "PARENT", organizationId, homeCampusId: campusId } });
    parentBUserId = parentB.id;

    // Fully ready: APPROVED, has a tribe, has a qrToken — both downloads work.
    const readyCamper = await prisma.camper.create({
      data: { name: "E2E Docs Ready Camper", userId: parentAUserId, organizationId, homeCampusId: campusId, gender: "MALE", dateOfBirth: new Date(2013, 5, 1) },
    });
    readyCamperId = readyCamper.id;
    const readyReg = await prisma.registration.create({
      data: {
        camperId: readyCamperId, campId, campusId, tribeId,
        status: "APPROVED", registrationNumber: `E2E-DOCS-READY-${stamp}`,
        qrToken: randomBytes(16).toString("hex"),
      },
    });
    readyRegistrationId = readyReg.id;

    // APPROVED, has a qrToken, but no tribe — acceptance letter should
    // still work, ID card should show "not ready" with an explanation.
    const noTribeCamper = await prisma.camper.create({
      data: { name: "E2E Docs No Tribe Camper", userId: parentAUserId, organizationId, homeCampusId: campusId, gender: "FEMALE", dateOfBirth: new Date(2013, 5, 1) },
    });
    noTribeCamperId = noTribeCamper.id;
    const noTribeReg = await prisma.registration.create({
      data: {
        camperId: noTribeCamperId, campId, campusId,
        status: "APPROVED", registrationNumber: `E2E-DOCS-NOTRIBE-${stamp}`,
        qrToken: randomBytes(16).toString("hex"),
      },
    });
    noTribeRegistrationId = noTribeReg.id;

    // PENDING — must not appear on the page at all.
    const pendingCamper = await prisma.camper.create({
      data: { name: "E2E Docs Pending Camper", userId: parentAUserId, organizationId, homeCampusId: campusId, gender: "MALE", dateOfBirth: new Date(2013, 5, 1) },
    });
    pendingCamperId = pendingCamper.id;
    const pendingReg = await prisma.registration.create({
      data: { camperId: pendingCamperId, campId, campusId, status: "PENDING", registrationNumber: `E2E-DOCS-PENDING-${stamp}` },
    });
    pendingRegistrationId = pendingReg.id;

    // A different parent's own APPROVED, tribe-having, ready registration —
    // used to prove parent A cannot reach parent B's document routes.
    const otherCamper = await prisma.camper.create({
      data: { name: "E2E Docs Other Camper", userId: parentBUserId, organizationId, homeCampusId: campusId, gender: "MALE", dateOfBirth: new Date(2013, 5, 1) },
    });
    otherCamperId = otherCamper.id;
    const otherReg = await prisma.registration.create({
      data: {
        camperId: otherCamperId, campId, campusId, tribeId,
        status: "APPROVED", registrationNumber: `E2E-DOCS-OTHER-${stamp}`,
        qrToken: randomBytes(16).toString("hex"),
      },
    });
    otherRegistrationId = otherReg.id;
  });

  test.afterAll(async () => {
    await prisma.registration.deleteMany({ where: { id: { in: [readyRegistrationId, noTribeRegistrationId, pendingRegistrationId, otherRegistrationId] } } });
    await prisma.camper.deleteMany({ where: { id: { in: [readyCamperId, noTribeCamperId, pendingCamperId, otherCamperId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [parentAUserId, parentBUserId] } } });
    if (tribeId) await prisma.tribe.deleteMany({ where: { id: tribeId } });
  });

  test("a parent reaches Documents via real navigation, sees ready and not-ready campers, and both downloads work", async ({ page }) => {
    await loginWithOtp(page, parentAEmail);
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });

    // The dashboard area had zero navigation before this feature — assert
    // the "Documents" link is real, reachable navigation, not a deep link.
    await onlyVisible(page.getByRole("link", { name: "Documents" })).first().click();
    await page.waitForURL(/\/dashboard\/documents/, { timeout: 15000 });
    // Match the page's h1 specifically. A bare "Documents" name is a substring
    // match, and this page also renders an h2 "Official Camper Documents", so the
    // unqualified locator is a strict-mode violation rather than a missing element.
    await expect(page.getByRole("heading", { name: "Documents & Downloads", level: 1 })).toBeVisible({ timeout: 15000 });

    // Ready camper: both links present. `div` + hasText matches every
    // ancestor div containing the camper's name (Card, CardBody, and the
    // page's outer wrappers all qualify) — anchor on the CardBody's own
    // `space-y-3` class instead of the camper name so exactly one node
    // matches.
    const readyCard = page.locator("h3", { hasText: "E2E Docs Ready Camper" }).locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' space-y-3 ')][1]");
    const idCardLink = readyCard.getByRole("link", { name: /Camp ID Card/i });
    const acceptanceLink = readyCard.getByRole("link", { name: /Acceptance Certificate/i });
    await expect(idCardLink).toBeVisible();
    await expect(acceptanceLink).toBeVisible();

    const idCardHref = await idCardLink.getAttribute("href");
    const acceptanceHref = await acceptanceLink.getAttribute("href");
    expect(idCardHref).toBe(`/api/registrations/${readyRegistrationId}/camp-id-card.pdf`);
    expect(acceptanceHref).toBe(`/api/registrations/${readyRegistrationId}/acceptance-letter`);

    const idCardResponse = await page.request.get(idCardHref!);
    expect(idCardResponse.status()).toBe(200);
    expect(idCardResponse.headers()["content-type"]).toContain("application/pdf");

    const acceptanceResponse = await page.request.get(acceptanceHref!);
    expect(acceptanceResponse.status()).toBe(200);
    expect(acceptanceResponse.headers()["content-type"]).toContain("application/pdf");

    // No-tribe camper: shown with a pending explanation, not hidden, and
    // its ID card link is specifically absent while acceptance letter
    // still works.
    const noTribeCard = page.locator("h3", { hasText: "E2E Docs No Tribe Camper" }).locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' space-y-3 ')][1]");
    // The badge reads "ID card awaiting tribe" (see src/app/dashboard/documents/page.tsx).
    // Match on the stable phrase rather than wording the page never used.
    await expect(noTribeCard.getByText(/awaiting tribe/i)).toBeVisible();
    await expect(noTribeCard.getByRole("link", { name: /Camp ID Card/i })).toHaveCount(0);
    const noTribeAcceptanceLink = noTribeCard.getByRole("link", { name: /Acceptance Certificate/i });
    await expect(noTribeAcceptanceLink).toBeVisible();
    const noTribeAcceptanceHref = await noTribeAcceptanceLink.getAttribute("href");
    const noTribeAcceptanceResponse = await page.request.get(noTribeAcceptanceHref!);
    expect(noTribeAcceptanceResponse.status()).toBe(200);

    // Pending camper: not approved yet, must not appear anywhere on the page.
    await expect(page.getByText("E2E Docs Pending Camper")).toHaveCount(0);
  });

  test("a different parent cannot fetch another family's document routes", async ({ page }) => {
    await loginWithOtp(page, parentBEmail);
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });

    const idCardResponse = await page.request.get(`/api/registrations/${readyRegistrationId}/camp-id-card.pdf`);
    expect(idCardResponse.status()).toBe(403);

    const acceptanceResponse = await page.request.get(`/api/registrations/${readyRegistrationId}/acceptance-letter`);
    expect(acceptanceResponse.status()).toBe(403);
  });
});
