import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ensureStaffQrToken, generateStaffQrToken, isStaffQrToken, regenerateStaffQrToken } from "../idToken";

const prisma = new PrismaClient();

let orgId: string;
let campId: string;

async function makeStaff() {
  const user = await prisma.user.create({
    data: { email: `idtoken-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "PARENT", organizationId: orgId },
  });
  return prisma.staffProfile.create({
    data: {
      userId: user.id,
      organizationId: orgId,
      campId,
      type: "TEACHER",
      status: "APPROVED",
      firstName: "Test",
      lastName: "Staffer",
      phone: "555-0000",
      email: user.email,
    },
  });
}

beforeEach(async () => {
  const org = await prisma.organization.create({ data: { name: `IdToken Org ${Date.now()}-${Math.random()}` } });
  orgId = org.id;

  const camp = await prisma.camp.create({
    data: {
      name: `${Date.now()}`,
      slug: `idtoken-test-${Date.now()}-${Math.random()}`,
      year: 2026,
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 11, 31),
      organizationId: orgId,
    },
  });
  campId = camp.id;
});

afterEach(async () => {
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
});

describe("generateStaffQrToken / isStaffQrToken", () => {
  it("always carries the STF- prefix", () => {
    for (let i = 0; i < 10; i++) {
      const token = generateStaffQrToken();
      expect(token.startsWith("STF-")).toBe(true);
      expect(isStaffQrToken(token)).toBe(true);
    }
  });

  it("does not classify a camper-style token as a staff token", () => {
    expect(isStaffQrToken("aB3dEf9012345")).toBe(false);
  });

  it("generates distinct tokens across calls", () => {
    const a = generateStaffQrToken();
    const b = generateStaffQrToken();
    expect(a).not.toBe(b);
  });
});

describe("ensureStaffQrToken", () => {
  it("issues a token for a profile that has none", async () => {
    const profile = await makeStaff();
    expect(profile.qrToken).toBeNull();

    const token = await ensureStaffQrToken(prisma, profile.id);
    expect(token.startsWith("STF-")).toBe(true);

    const reloaded = await prisma.staffProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(reloaded.qrToken).toBe(token);
    expect(reloaded.qrIssuedAt).not.toBeNull();
  });

  it("is idempotent — returns the existing token without changing it", async () => {
    const profile = await makeStaff();
    const first = await ensureStaffQrToken(prisma, profile.id);
    const second = await ensureStaffQrToken(prisma, profile.id);
    expect(second).toBe(first);
  });
});

describe("regenerateStaffQrToken", () => {
  it("issues a new token, replacing the old one", async () => {
    const profile = await makeStaff();
    const original = await ensureStaffQrToken(prisma, profile.id);

    const regenerated = await regenerateStaffQrToken(prisma, { staffProfileId: profile.id, actorId: profile.userId });
    expect(regenerated).not.toBe(original);
    expect(regenerated.startsWith("STF-")).toBe(true);

    const reloaded = await prisma.staffProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(reloaded.qrToken).toBe(regenerated);
  });

  it("writes an audit log entry", async () => {
    const profile = await makeStaff();
    await ensureStaffQrToken(prisma, profile.id);
    await regenerateStaffQrToken(prisma, { staffProfileId: profile.id, actorId: profile.userId });

    const logs = await prisma.auditLog.findMany({ where: { organizationId: orgId, action: "STAFF_QR_REGENERATED" } });
    expect(logs.length).toBe(1);
  });
});
