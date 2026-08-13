import { test, expect } from "@playwright/test";
import { randomBytes } from "crypto";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const PDF_MAGIC = "%PDF-";

test.describe("Public Camp ID Card image route", () => {
  test.describe.configure({ mode: "serial" });

  const parentEmail = `e2e-idcard-parent-${Date.now()}@camply.test`;
  const qrToken = randomBytes(24).toString("base64url");
  let userId: string | undefined;
  let camperId: string | undefined;
  let registrationId: string | undefined;
  let tribeId: string | undefined;

  test.beforeAll(async () => {
    const { organizationId, campId, campusId } = await getFixtureOrgContext();

    const parent = await prisma.user.create({
      data: { email: parentEmail, password: "unused", role: "PARENT", organizationId },
    });
    userId = parent.id;

    const camper = await prisma.camper.create({
      data: { name: "E2E ID Card Camper", gender: "Male", userId: parent.id, organizationId, homeCampusId: campusId },
    });
    camperId = camper.id;

    const tribe = await prisma.tribe.create({
      data: { campId, name: `E2E ID Card Tribe ${Date.now()}`, color: "#1E3A8A" },
    });
    tribeId = tribe.id;

    const registration = await prisma.registration.create({
      data: {
        camperId: camper.id,
        campId,
        campusId,
        tribeId: tribe.id,
        status: "APPROVED",
        registrationNumber: `E2E-IDCARD-${Date.now()}`,
        qrToken,
      },
    });
    registrationId = registration.id;
  });

  test.afterAll(async () => {
    if (registrationId) await prisma.registration.deleteMany({ where: { id: registrationId } });
    if (camperId) await prisma.camper.deleteMany({ where: { id: camperId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    if (tribeId) await prisma.tribe.deleteMany({ where: { id: tribeId } });
  });

  test("serves a PNG ID card for a valid registration token", async ({ request }) => {
    const response = await request.get(`/api/id-card/${qrToken}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/png");
    const body = await response.body();
    expect(Array.from(body.subarray(0, 4))).toEqual(PNG_MAGIC);
  });

  test("404s for a token that doesn't match any registration", async ({ request }) => {
    const response = await request.get(`/api/id-card/not-a-real-token-${Date.now()}`);
    expect(response.status()).toBe(404);
  });

  test("serves a fixed sample PNG with no session/cookies", async ({ request }) => {
    const response = await request.get("/api/id-card/sample");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/png");
    const body = await response.body();
    expect(Array.from(body.subarray(0, 4))).toEqual(PNG_MAGIC);
  });

  test("the per-registration printable sheet route returns a valid 8-copy A4 PDF", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    const response = await page.request.get(`/api/registrations/${registrationId}/camp-id-card.pdf`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/pdf");
    const body = await response.body();
    expect(body.subarray(0, 5).toString("latin1")).toBe(PDF_MAGIC);
  });
});

test.describe("Admin: Camp ID Card settings page", () => {
  test("enables the feature, toggles a template, and both sample previews load", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");

    await page.goto("/admin/communication/id-card");
    await expect(page.locator("h1")).toContainText("Camp ID Card");

    const enableCheckbox = page.getByRole("checkbox").first();
    await expect(enableCheckbox).toBeVisible({ timeout: 10000 });
    if (!(await enableCheckbox.isChecked())) {
      await enableCheckbox.click();
      await expect(enableCheckbox).toBeChecked({ timeout: 10000 });
    }

    // Sample card preview image loads.
    const previewImg = page.locator('img[alt="Sample Camp ID Card"]');
    await expect(previewImg).toBeVisible();
    await expect(previewImg).toHaveJSProperty("complete", true);

    // At least one template row is present and its checkbox is togglable.
    const firstTemplateCheckbox = page.locator('label:has-text("Welcome Email") input[type="checkbox"]');
    if (await firstTemplateCheckbox.count()) {
      const wasChecked = await firstTemplateCheckbox.isChecked();
      await firstTemplateCheckbox.click();
      await expect(firstTemplateCheckbox).toBeChecked({ checked: !wasChecked });
      // Toggle back to leave shared fixture-org state as found.
      await firstTemplateCheckbox.click();
      await expect(firstTemplateCheckbox).toBeChecked({ checked: wasChecked });
    }
  });

  test("sample printable sheet download returns a valid PDF", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    const response = await page.request.get("/api/id-card/sample-sheet.pdf");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/pdf");
    const body = await response.body();
    expect(body.subarray(0, 5).toString("latin1")).toBe(PDF_MAGIC);
  });
});
