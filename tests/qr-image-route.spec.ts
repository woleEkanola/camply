import { test, expect } from "@playwright/test";
import { randomBytes } from "crypto";
import { prisma, getFixtureOrgContext } from "./helpers";

// PNG file signature — first 8 bytes are 89 50 4E 47 0D 0A 1A 0A, but the
// 4-byte "\x89PNG" magic is enough to confirm this is really a PNG.
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

test.describe("Public QR image route", () => {
  test.describe.configure({ mode: "serial" });

  const parentEmail = `e2e-qr-route-parent-${Date.now()}@camply.test`;
  const qrToken = randomBytes(24).toString("base64url");
  let userId: string | undefined;
  let camperId: string | undefined;
  let registrationId: string | undefined;

  test.beforeAll(async () => {
    const { organizationId, campId, campusId } = await getFixtureOrgContext();

    const parent = await prisma.user.create({
      data: { email: parentEmail, password: "unused", role: "PARENT", organizationId },
    });
    userId = parent.id;

    const camper = await prisma.camper.create({
      data: { name: "E2E QR Route Camper", userId: parent.id, organizationId, homeCampusId: campusId },
    });
    camperId = camper.id;

    const registration = await prisma.registration.create({
      data: {
        camperId: camper.id,
        campId,
        campusId,
        status: "APPROVED",
        registrationNumber: `E2E-QR-${Date.now()}`,
        qrToken,
      },
    });
    registrationId = registration.id;
  });

  test.afterAll(async () => {
    if (registrationId) await prisma.registration.deleteMany({ where: { id: registrationId } });
    if (camperId) await prisma.camper.deleteMany({ where: { id: camperId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  });

  test("serves a PNG for a valid token with no session/cookies", async ({ request }) => {
    const response = await request.get(`/api/qr/${qrToken}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/png");

    const body = await response.body();
    expect(Array.from(body.subarray(0, 4))).toEqual(PNG_MAGIC);
  });

  test("404s for a token that doesn't match any registration", async ({ request }) => {
    const response = await request.get(`/api/qr/not-a-real-token-${Date.now()}`);
    expect(response.status()).toBe(404);
  });
});
