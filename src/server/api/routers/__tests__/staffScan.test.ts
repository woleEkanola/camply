import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { appRouter } from "../../root";
import { ensureStaffQrToken } from "../../../staff/idToken";

const prisma = new PrismaClient();

let orgId: string;
let campId: string;
let adminId: string;
let staffProfileId: string;
let staffQrToken: string;

async function makeStaff(status: "PENDING" | "APPROVED" = "APPROVED") {
  const user = await prisma.user.create({
    data: { email: `staffscan-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "TEACHER", organizationId: orgId },
  });
  const profile = await prisma.staffProfile.create({
    data: {
      userId: user.id,
      organizationId: orgId,
      campId,
      type: "TEACHER",
      status,
      firstName: "Test",
      lastName: "Teacher",
      phone: "555-0000",
      email: user.email,
    },
  });
  return profile;
}

beforeEach(async () => {
  const org = await prisma.organization.create({ data: { name: `StaffScan Org ${Date.now()}-${Math.random()}` } });
  orgId = org.id;

  const camp = await prisma.camp.create({
    data: {
      name: `${Date.now()}`,
      slug: `staffscan-test-${Date.now()}-${Math.random()}`,
      year: 2026,
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 11, 31),
      organizationId: orgId,
    },
  });
  campId = camp.id;
  await prisma.organization.update({ where: { id: orgId }, data: { activeCampId: campId } });

  const admin = await prisma.user.create({
    data: { email: `staffscan-admin-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "ADMIN", organizationId: orgId },
  });
  adminId = admin.id;

  const profile = await makeStaff("APPROVED");
  staffProfileId = profile.id;
  staffQrToken = await ensureStaffQrToken(prisma, profile.id);
});

afterEach(async () => {
  await prisma.staffScanEvent.deleteMany({ where: { staffProfile: { organizationId: orgId } } });
  await prisma.staffProfile.deleteMany({ where: { organizationId: orgId } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

function makeCaller() {
  return appRouter.createCaller({
    prisma,
    session: {
      user: { id: adminId, email: "admin@test.com", role: "ADMIN", organizationId: orgId },
      expires: "",
    },
  });
}

describe("scanRouter - processStaffScan", () => {
  it("checks a staff member in successfully and writes a StaffScanEvent", async () => {
    const caller = makeCaller();
    const result = await caller.scan.processStaffScan({
      organizationId: orgId,
      qrToken: staffQrToken,
      station: "Staff Check-In",
      stationId: "STAFF_CHECK_IN",
    });

    expect(result.result).toBe("SUCCESS");
    expect(result.actionPerformed).toBe("Checked In");
    expect(result.profile.id).toBe(staffProfileId);

    const event = await prisma.staffScanEvent.findFirst({ where: { staffProfileId } });
    expect(event).toBeTruthy();
    expect(event?.result).toBe("SUCCESS");
  });

  it("returns DUPLICATE for a second scan at the same station on the same day", async () => {
    const caller = makeCaller();
    await caller.scan.processStaffScan({
      organizationId: orgId,
      qrToken: staffQrToken,
      station: "Staff Check-In",
      stationId: "STAFF_CHECK_IN",
    });

    const second = await caller.scan.processStaffScan({
      organizationId: orgId,
      qrToken: staffQrToken,
      station: "Staff Check-In",
      stationId: "STAFF_CHECK_IN",
    });

    expect(second.result).toBe("DUPLICATE");
  });

  it("STAFF_LOOKUP does not trigger duplicate detection on repeated scans", async () => {
    const caller = makeCaller();
    const first = await caller.scan.processStaffScan({
      organizationId: orgId,
      qrToken: staffQrToken,
      station: "Identity Lookup",
      stationId: "STAFF_LOOKUP",
    });
    const second = await caller.scan.processStaffScan({
      organizationId: orgId,
      qrToken: staffQrToken,
      station: "Identity Lookup",
      stationId: "STAFF_LOOKUP",
    });

    expect(first.result).toBe("SUCCESS");
    expect(second.result).toBe("SUCCESS");
  });

  it("rejects a PENDING staff member's badge", async () => {
    const pending = await makeStaff("PENDING");
    const token = await ensureStaffQrToken(prisma, pending.id);
    const caller = makeCaller();

    await expect(
      caller.scan.processStaffScan({
        organizationId: orgId,
        qrToken: token,
        station: "Staff Check-In",
        stationId: "STAFF_CHECK_IN",
      })
    ).rejects.toThrow();
  });

  it("404s on an unrecognized staff token", async () => {
    const caller = makeCaller();
    await expect(
      caller.scan.processStaffScan({
        organizationId: orgId,
        qrToken: "STF-does-not-exist",
        station: "Staff Check-In",
        stationId: "STAFF_CHECK_IN",
      })
    ).rejects.toThrow();
  });
});

describe("scanRouter - processScan rejects staff badges at camper stations", () => {
  it("throws a clear error instead of a generic NOT_FOUND", async () => {
    const caller = makeCaller();
    await expect(
      caller.scan.processScan({
        organizationId: orgId,
        qrToken: staffQrToken,
        station: "Pickup Point",
      })
    ).rejects.toThrow(/staff badge/i);
  });
});
