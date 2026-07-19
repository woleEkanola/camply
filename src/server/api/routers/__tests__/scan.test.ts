import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { appRouter } from "../../root";
import * as engine from "../../../registration/engine";

const prisma = new PrismaClient();

let orgId: string;
let campId: string;
let campusId: string;
let venueId: string;
let parentId: string;
let adminId: string;
let registrationId: string;
let qrToken: string;

beforeEach(async () => {
  const org = await prisma.organization.create({ data: { name: `Test Org ${Date.now()}-${Math.random()}` } });
  orgId = org.id;

  const camp = await prisma.camp.create({
    data: {
      name: `${Date.now()}`,
      slug: `test-${Date.now()}-${Math.random()}`,
      year: 2026,
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 11, 31),
      organizationId: orgId,
      status: "OPEN",
      approvalMode: "MANUAL",
      minAge: 10,
      maxAge: 17,
      ageCutoffDate: new Date(2026, 8, 1),
      orgCode: "TST",
    },
  });
  campId = camp.id;

  // Set active camp
  await prisma.organization.update({
    where: { id: orgId },
    data: { activeCampId: campId },
  });

  const campus = await prisma.campus.create({
    data: {
      name: `Test Campus ${Date.now()}`,
      slug: `test-campus-${Date.now()}-${Math.random()}`,
      address: "1 Test St",
      city: "Testville",
      country: "Testland",
      organizationId: orgId,
      campusCode: "TLC",
    },
  });
  campusId = campus.id;

  const venue = await prisma.venue.create({
    data: {
      name: `Test Venue ${Date.now()}`,
      campId,
      quota: 100,
    },
  });
  venueId = venue.id;

  const parent = await prisma.user.create({
    data: { email: `parent-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "PARENT", organizationId: orgId },
  });
  parentId = parent.id;

  const admin = await prisma.user.create({
    data: { email: `admin-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "ADMIN", organizationId: orgId, firstName: "Test", lastName: "Admin" },
  });
  adminId = admin.id;

  // Make an approved camper & registration
  const camper = await prisma.camper.create({
    data: {
      name: "Test Camper Scan",
      firstName: "Test",
      lastName: "Camper",
      gender: "Male",
      dateOfBirth: new Date(2013, 5, 1),
      userId: parentId,
      organizationId: orgId,
      homeCampusId: campusId,
    },
  });

  const draft = await engine.createDraft({ camperId: camper.id, campId, campusId, actorId: parentId });
  await engine.submitRegistration({ registrationId: draft.id, actorId: parentId });
  const approved = await engine.approveRegistration({ registrationId: draft.id, actorId: adminId });
  
  registrationId = approved.id;
  qrToken = approved.qrToken!;
});

afterEach(async () => {
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("scanRouter - processScan", () => {
  it("processes standard arrival check-in successfully and updates state", async () => {
    const caller = appRouter.createCaller({
      prisma,
      session: {
        user: { id: adminId, email: "admin@test.com", role: "ADMIN", organizationId: orgId },
        expires: "",
      },
    });

    const result = await caller.scan.processScan({
      organizationId: orgId,
      qrToken,
      station: "Pickup Point",
    });

    expect(result.result).toBe("SUCCESS");
    expect(result.registration.status).toBe("CHECKED_IN");
    
    // Verify scan event is saved
    const event = await prisma.scanEvent.findFirst({
      where: { registrationId, station: "Pickup Point" },
    });
    expect(event).toBeTruthy();
    expect(event?.result).toBe("SUCCESS");

    // Verify Checked-in status on registration
    const reg = await prisma.registration.findUnique({ where: { id: registrationId } });
    expect(reg?.status).toBe("CHECKED_IN");
    expect(reg?.checkedInAt).toBeTruthy();
  });

  it("handles duplicate check-in scans by returning duplicate state rather than throwing an error", async () => {
    const caller = appRouter.createCaller({
      prisma,
      session: {
        user: { id: adminId, email: "admin@test.com", role: "ADMIN", organizationId: orgId },
        expires: "",
      },
    });

    // Scan once (Success)
    await caller.scan.processScan({
      organizationId: orgId,
      qrToken,
      station: "Pickup Point",
    });

    // Scan again (Duplicate)
    const duplicateResult = await caller.scan.processScan({
      organizationId: orgId,
      qrToken,
      station: "Pickup Point",
    });

    expect(duplicateResult.result).toBe("DUPLICATE");
    expect(duplicateResult.originalStation).toBe("Pickup Point");
    expect(duplicateResult.originalVolunteerName).toContain("Test"); // Should return volunteer name
    
    // Duplicate event should be logged in database
    const duplicateEvents = await prisma.scanEvent.findMany({
      where: { registrationId, station: "Pickup Point", result: "DUPLICATE" },
    });
    expect(duplicateEvents).toHaveLength(1);
  });

  it("checkout desk prompt works and updates state on submission", async () => {
    const caller = appRouter.createCaller({
      prisma,
      session: {
        user: { id: adminId, email: "admin@test.com", role: "ADMIN", organizationId: orgId },
        expires: "",
      },
    });

    // Set camper to checked in first
    await prisma.registration.update({
      where: { id: registrationId },
      data: { status: "CHECKED_IN", checkedInAt: new Date(), checkedInById: adminId },
    });

    // Initial scan to prompt details
    const promptResult = await caller.scan.processScan({
      organizationId: orgId,
      qrToken,
      station: "Checkout",
    });

    expect(promptResult.result).toBe("REQUIRES_CHECKOUT_DETAILS");
    expect(promptResult.registration).toBeTruthy();

    // Confirm checkout with guardian details
    const checkoutResult = await caller.scan.processScan({
      organizationId: orgId,
      qrToken,
      station: "Checkout",
      checkoutDetails: {
        collectorName: "Alice Smith",
        collectorRelationship: "Mother",
        details: { signatureDataUrl: "data:image/png;base64,abc" },
      },
    });

    expect(checkoutResult.result).toBe("SUCCESS");
    
    const reloadedReg = await prisma.registration.findUnique({ where: { id: registrationId } });
    expect(reloadedReg?.checkedOutAt).toBeTruthy();
    expect(reloadedReg?.checkoutCollectorName).toBe("Alice Smith");

    // Scan again to verify duplicate checkout is informational
    const dupCheckoutResult = await caller.scan.processScan({
      organizationId: orgId,
      qrToken,
      station: "Checkout",
    });

    expect(dupCheckoutResult.result).toBe("DUPLICATE");
    expect(dupCheckoutResult.originalStation).toBe("Checkout Desk");
    expect(dupCheckoutResult.metadata).toMatchObject({
      collectorName: "Alice Smith",
      collectorRelationship: "Mother",
    });
  });

  it("handles meals and prevents duplicates on the same day", async () => {
    const caller = appRouter.createCaller({
      prisma,
      session: {
        user: { id: adminId, email: "admin@test.com", role: "ADMIN", organizationId: orgId },
        expires: "",
      },
    });

    // Serve Breakfast
    const mealResult = await caller.scan.processScan({
      organizationId: orgId,
      qrToken,
      station: "Breakfast",
    });

    expect(mealResult.result).toBe("SUCCESS");
    expect(mealResult.actionPerformed).toBe("Served breakfast");

    const distributions = await prisma.mealDistribution.findMany({
      where: { registrationId, meal: "BREAKFAST" },
    });
    expect(distributions).toHaveLength(1);

    // Duplicate Breakfast check
    const dupMealResult = await caller.scan.processScan({
      organizationId: orgId,
      qrToken,
      station: "Breakfast",
    });

    expect(dupMealResult.result).toBe("DUPLICATE");
    expect(dupMealResult.originalStation).toBe("Breakfast");

    const distributionsPostDup = await prisma.mealDistribution.findMany({
      where: { registrationId, meal: "BREAKFAST" },
    });
    expect(distributionsPostDup).toHaveLength(1); // Should still be 1
  });

  it("bulkSyncOfflineScans processes a batch of chronologically sorted offline scans", async () => {
    const caller = appRouter.createCaller({
      prisma,
      session: {
        user: { id: adminId, email: "admin@test.com", role: "ADMIN", organizationId: orgId },
        expires: "",
      },
    });

    const timestamp1 = new Date(2026, 6, 19, 8, 0, 0).toISOString();
    const timestamp2 = new Date(2026, 6, 19, 8, 15, 0).toISOString();

    const response = await caller.scan.bulkSyncOfflineScans({
      organizationId: orgId,
      scans: [
        {
          qrToken,
          station: "Lekki Pickup Point",
          timestamp: timestamp1,
        },
        {
          qrToken,
          station: "Breakfast",
          timestamp: timestamp2,
        },
      ],
    });

    expect(response.syncResults).toHaveLength(2);
    expect(response.syncResults[0]?.status).toBe("SUCCESS");
    expect(response.syncResults[1]?.status).toBe("SUCCESS");

    // Verify both events were created in the DB
    const scanEvents = await prisma.scanEvent.findMany({
      where: { registrationId },
      orderBy: { timestamp: "asc" },
    });
    expect(scanEvents).toHaveLength(2);
    expect(scanEvents[0]?.station).toBe("Lekki Pickup Point");
    expect(scanEvents[1]?.station).toBe("Breakfast");

    const reg = await prisma.registration.findUnique({ where: { id: registrationId } });
    expect(reg?.status).toBe("CHECKED_IN");
  });
});
