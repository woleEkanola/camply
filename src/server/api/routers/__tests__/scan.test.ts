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
  it("reports when offline camper data is current or behind", async () => {
    const caller = appRouter.createCaller({
      prisma,
      session: {
        user: { id: adminId, email: "admin@test.com", role: "ADMIN", organizationId: orgId },
        expires: "",
      },
    });

    const current = await caller.scan.getOfflineSyncStatus({
      organizationId: orgId,
      lastSyncedAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(current.hasServerChanges).toBe(false);

    const behind = await caller.scan.getOfflineSyncStatus({
      organizationId: orgId,
      lastSyncedAt: "2000-01-01T00:00:00.000Z",
    });
    expect(behind.hasServerChanges).toBe(true);
    expect(behind.changedRecordCount).toBeGreaterThan(0);

    await prisma.registration.update({
      where: { id: registrationId },
      data: { status: "REJECTED" },
    });
    const delta = await caller.scan.getDeltaSyncData({
      organizationId: orgId,
      lastSyncedAt: "2000-01-01T00:00:00.000Z",
      profile: "FULL",
      scope: "ENTIRE_CAMP",
    });
    expect(delta.deletedRegistrationIds).toContain(registrationId);
    expect(delta.updatedCampers).toHaveLength(0);
  });

  it("processes Pickup Point boarding scan without mutating camp check-in status", async () => {
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
      stationId: "PICKUP_POINT",
    });

    expect(result.result).toBe("SUCCESS");
    expect(result.actionPerformed).toBe("Boarded the Bus");
    expect(result.registration.status).toBe("APPROVED");
    
    // Verify scan event is saved
    const event = await prisma.scanEvent.findFirst({
      where: { registrationId, station: "Pickup Point" },
    });
    expect(event).toBeTruthy();
    expect(event?.result).toBe("SUCCESS");

    // Verify registration status stays APPROVED
    const reg = await prisma.registration.findUnique({ where: { id: registrationId } });
    expect(reg?.status).toBe("APPROVED");
  });

  it("processes Camp Arrival scan and marks camper as CHECKED_IN", async () => {
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
      station: "Camp Arrival",
      stationId: "CAMP_ARRIVAL",
    });

    expect(result.result).toBe("SUCCESS");
    expect(result.actionPerformed).toBe("Checked In at Camp");
    expect(result.registration.status).toBe("CHECKED_IN");
    
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
      station: "Camp Arrival",
      stationId: "CAMP_ARRIVAL",
    });

    // Scan again (Duplicate)
    const duplicateResult = await caller.scan.processScan({
      organizationId: orgId,
      qrToken,
      station: "Camp Arrival",
      stationId: "CAMP_ARRIVAL",
    });

    expect(duplicateResult.result).toBe("DUPLICATE");
    expect(duplicateResult.originalStation).toBe("Camp Arrival");
    expect(duplicateResult.originalVolunteerName).toContain("Test");
    
    // Duplicate event should be logged in database
    const duplicateEvents = await prisma.scanEvent.findMany({
      where: { registrationId, station: "Camp Arrival", result: "DUPLICATE" },
    });
    expect(duplicateEvents).toHaveLength(1);
  });

  it("allows undoing a scan to revert state and remove duplicate lock", async () => {
    const caller = appRouter.createCaller({
      prisma,
      session: {
        user: { id: adminId, email: "admin@test.com", role: "ADMIN", organizationId: orgId },
        expires: "",
      },
    });

    // Scan at Camp Arrival
    const scanRes = await caller.scan.processScan({
      organizationId: orgId,
      qrToken,
      station: "Camp Arrival",
      stationId: "CAMP_ARRIVAL",
    });
    expect(scanRes.result).toBe("SUCCESS");

    const regAfterScan = await prisma.registration.findUnique({ where: { id: registrationId } });
    expect(regAfterScan?.status).toBe("CHECKED_IN");

    // Undo scan
    const undoRes = await caller.scan.undoScan({
      organizationId: orgId,
      scanEventId: scanRes.scanEventId,
    });
    expect(undoRes.success).toBe(true);

    const regAfterUndo = await prisma.registration.findUnique({ where: { id: registrationId } });
    expect(regAfterUndo?.status).toBe("APPROVED");

    // Re-scan should succeed now (no duplicate error)
    const rescan = await caller.scan.processScan({
      organizationId: orgId,
      qrToken,
      station: "Camp Arrival",
      stationId: "CAMP_ARRIVAL",
    });
    expect(rescan.result).toBe("SUCCESS");
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

  it("routine allergy notes (INFO severity) do not block scanning and are attached to the SUCCESS response", async () => {
    await prisma.camper.update({
      where: { id: (await prisma.registration.findUniqueOrThrow({ where: { id: registrationId } })).camperId! },
      data: { allergies: "Peanuts" },
    });

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
    if (result.result === "SUCCESS") {
      expect(result.medicalSeverity).toBe("INFO");
      expect(result.medicalFlags).toContain("allergies");
    }
  });

  it("critical medical conditions (anaphylaxis) block scanning with REQUIRES_MEDICAL_ACKNOWLEDGEMENT, acknowledging proceeds", async () => {
    await prisma.camper.update({
      where: { id: (await prisma.registration.findUniqueOrThrow({ where: { id: registrationId } })).camperId! },
      data: { allergies: "Severe peanut anaphylaxis" },
    });

    const caller = appRouter.createCaller({
      prisma,
      session: {
        user: { id: adminId, email: "admin@test.com", role: "ADMIN", organizationId: orgId },
        expires: "",
      },
    });

    const blocked = await caller.scan.processScan({
      organizationId: orgId,
      qrToken,
      station: "Pickup Point",
    });
    expect(blocked.result).toBe("REQUIRES_MEDICAL_ACKNOWLEDGEMENT");
    if (blocked.result === "REQUIRES_MEDICAL_ACKNOWLEDGEMENT") {
      expect(blocked.medicalSeverity).toBe("CRITICAL");
    }

    const acknowledged = await caller.scan.processScan({
      organizationId: orgId,
      qrToken,
      station: "Pickup Point",
      acknowledgedMedical: true,
    });
    expect(acknowledged.result).toBe("SUCCESS");
  });

  it("stationId overrides label substring-matching: a custom checkpoint named 'Lunch Gate' does not record a meal", async () => {
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
      station: "Lunch Gate", // label alone would substring-match "lunch" -> MEAL under legacy classification
      stationId: "CAMP_ARRIVAL", // but the typed id says this is really an arrival checkpoint
    });

    expect(result.result).toBe("SUCCESS");
    expect(result.actionPerformed).toBe("Checked In at Camp");

    const distributions = await prisma.mealDistribution.findMany({ where: { registrationId } });
    expect(distributions).toHaveLength(0); // no meal record should have been created

    const reg = await prisma.registration.findUnique({ where: { id: registrationId } });
    expect(reg?.status).toBe("CHECKED_IN");
  });

  it("stationId correctly classifies checkout even when the label doesn't say 'checkout'", async () => {
    const caller = appRouter.createCaller({
      prisma,
      session: {
        user: { id: adminId, email: "admin@test.com", role: "ADMIN", organizationId: orgId },
        expires: "",
      },
    });

    await prisma.registration.update({
      where: { id: registrationId },
      data: { status: "CHECKED_IN", checkedInAt: new Date(), checkedInById: adminId },
    });

    const promptResult = await caller.scan.processScan({
      organizationId: orgId,
      qrToken,
      station: "Front Desk",
      stationId: "CHECKOUT",
    });

    expect(promptResult.result).toBe("REQUIRES_CHECKOUT_DETAILS");

    const checkoutResult = await caller.scan.processScan({
      organizationId: orgId,
      qrToken,
      station: "Front Desk",
      stationId: "CHECKOUT",
      checkoutDetails: { collectorName: "Bob Smith", collectorRelationship: "Father" },
    });

    expect(checkoutResult.result).toBe("SUCCESS");
    const reg = await prisma.registration.findUnique({ where: { id: registrationId } });
    expect(reg?.checkedOutAt).toBeTruthy();
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

  it("bulkSyncOfflineScans uses stationId when present, overriding label-based classification", async () => {
    const caller = appRouter.createCaller({
      prisma,
      session: {
        user: { id: adminId, email: "admin@test.com", role: "ADMIN", organizationId: orgId },
        expires: "",
      },
    });

    const response = await caller.scan.bulkSyncOfflineScans({
      organizationId: orgId,
      scans: [
        {
          qrToken,
          station: "Lunch Gate",
          stationId: "CAMP_ARRIVAL",
          timestamp: new Date(2026, 6, 19, 8, 0, 0).toISOString(),
        },
      ],
    });

    expect(response.syncResults[0]?.status).toBe("SUCCESS");
    const distributions = await prisma.mealDistribution.findMany({ where: { registrationId } });
    expect(distributions).toHaveLength(0);
  });

  it("COLLECTIBLE stations record a scan without mutating registration status or writing a check-in audit entry", async () => {
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
      station: "Gift Bags",
      stationId: "COLLECTIBLES",
    });

    expect(result.result).toBe("SUCCESS");
    if (result.result === "SUCCESS") {
      expect(result.actionPerformed).toBe("Collected Gift Bags");
    }

    // Registration must stay APPROVED — collecting a gift is not a check-in.
    const reg = await prisma.registration.findUnique({ where: { id: registrationId } });
    expect(reg?.status).toBe("APPROVED");
    expect(reg?.checkedInAt).toBeNull();

    const auditLogs = await prisma.auditLog.findMany({ where: { registrationId, action: "CHECK_IN_COMPLETED" } });
    expect(auditLogs).toHaveLength(0);

    const event = await prisma.scanEvent.findFirst({ where: { registrationId, station: "Gift Bags" } });
    expect((event?.metadata as any)?.stationId).toBe("COLLECTIBLE");
  });

  it("COLLECTIBLE duplicate at the same checkpoint the same day is informational, not an error", async () => {
    const caller = appRouter.createCaller({
      prisma,
      session: {
        user: { id: adminId, email: "admin@test.com", role: "ADMIN", organizationId: orgId },
        expires: "",
      },
    });

    await caller.scan.processScan({ organizationId: orgId, qrToken, station: "Water Station", stationId: "COLLECTIBLES" });
    const dup = await caller.scan.processScan({ organizationId: orgId, qrToken, station: "Water Station", stationId: "COLLECTIBLES" });

    expect(dup.result).toBe("DUPLICATE");
    if (dup.result === "DUPLICATE") {
      expect(dup.message).toBe("Water Station already collected.");
    }
  });

  it("a different checkpoint name for the same camper on the same day is tracked separately, not a duplicate", async () => {
    const caller = appRouter.createCaller({
      prisma,
      session: {
        user: { id: adminId, email: "admin@test.com", role: "ADMIN", organizationId: orgId },
        expires: "",
      },
    });

    const first = await caller.scan.processScan({ organizationId: orgId, qrToken, station: "Gift Bags", stationId: "COLLECTIBLES" });
    const second = await caller.scan.processScan({ organizationId: orgId, qrToken, station: "Stationery Kit", stationId: "COLLECTIBLES" });

    expect(first.result).toBe("SUCCESS");
    expect(second.result).toBe("SUCCESS");
  });
});

describe("scanRouter - processStaffScan", () => {
  async function approvedStaff(type: "TEACHER" | "VOLUNTEER" = "TEACHER") {
    const user = await prisma.user.create({
      data: { email: `staff-${Date.now()}-${Math.random()}@test.com`, password: "x", role: type, organizationId: orgId },
    });
    return prisma.staffProfile.create({
      data: {
        userId: user.id,
        organizationId: orgId,
        campId,
        type,
        status: "APPROVED",
        firstName: "Longstaff",
        lastName: "Teacher",
        phone: "08000000000",
        email: user.email,
        teams: [],
        skills: [],
        preferredCampusId: campusId,
        qrToken: `STF-${Date.now()}-${Math.random()}`,
        approvedAt: new Date(),
      },
    });
  }

  function caller() {
    return appRouter.createCaller({
      prisma,
      session: { user: { id: adminId, email: "admin@test.com", role: "ADMIN", organizationId: orgId }, expires: "" },
    });
  }

  it("atomically serves one teacher lunch across concurrent scanners", async () => {
    const staff = await approvedStaff("TEACHER");
    const input = { organizationId: orgId, qrToken: `https://camp.test/badge?token=${staff.qrToken}`, station: "Lunch Station", stationId: "LUNCH" as const };
    const results = await Promise.all([caller().scan.processStaffScan(input), caller().scan.processStaffScan(input)]);

    expect(results.map((result) => result.result).sort()).toEqual(["DUPLICATE", "SUCCESS"]);
    expect(results.every((result) => result.subject.role === "TEACHER")).toBe(true);
    expect(await prisma.staffMealDistribution.count({ where: { staffProfileId: staff.id, meal: "LUNCH" } })).toBe(1);
    expect(await prisma.staffScanEvent.count({ where: { staffProfileId: staff.id, station: "Lunch Station", result: "SUCCESS" } })).toBe(1);
  });

  it("identifies volunteers and refuses camper-only operations without an operational write", async () => {
    const staff = await approvedStaff("VOLUNTEER");
    const lookup = await caller().scan.processStaffScan({ organizationId: orgId, qrToken: staff.qrToken!, station: "Identity Lookup", stationId: "IDENTITY_LOOKUP" });
    expect(lookup.result).toBe("SUCCESS");
    expect(lookup.subject.role).toBe("VOLUNTEER");
    expect("history" in lookup && (lookup.history?.length ?? 0)).toBeGreaterThan(0);

    const before = await prisma.staffScanEvent.count({ where: { staffProfileId: staff.id } });
    const unsupported = await caller().scan.processStaffScan({ organizationId: orgId, qrToken: staff.qrToken!, station: "Checkout Desk", stationId: "CHECKOUT" });
    expect(unsupported.result).toBe("NOT_APPLICABLE");
    expect(unsupported.message).toMatch(/camper checkout/i);
    expect(await prisma.staffScanEvent.count({ where: { staffProfileId: staff.id } })).toBe(before);
  });
});

describe("scanRouter - reports", () => {
  it("getMealReport, getArrivalsReport, and getCollectiblesReport aggregate correctly for a seeded day", async () => {
    const caller = appRouter.createCaller({
      prisma,
      session: {
        user: { id: adminId, email: "admin@test.com", role: "ADMIN", organizationId: orgId },
        expires: "",
      },
    });

    // Meals
    await caller.scan.processScan({ organizationId: orgId, qrToken, station: "Breakfast", stationId: "BREAKFAST" });

    // Arrivals — Pickup Point (a campus name) + Camp Arrival auto-triggered by the meal scan above
    await caller.scan.processScan({ organizationId: orgId, qrToken, station: "Maryland Campus", stationId: "PICKUP_POINT" });

    // Collectibles
    await caller.scan.processScan({ organizationId: orgId, qrToken, station: "Gift Bags", stationId: "COLLECTIBLES" });

    const mealReport = await caller.scan.getMealReport({ organizationId: orgId, campId });
    expect(mealReport.breakfast).toBe(1);
    expect(mealReport.lunch).toBe(0);

    const arrivalsAll = await caller.scan.getArrivalsReport({ organizationId: orgId, campId });
    expect(arrivalsAll.byType.PICKUP_POINT).toBe(1);
    expect(arrivalsAll.rows.some((r) => r.station === "Maryland Campus")).toBe(true);
    expect(arrivalsAll.total).toBeGreaterThanOrEqual(1);

    const arrivalsFiltered = await caller.scan.getArrivalsReport({ organizationId: orgId, campId, stationId: "PICKUP_POINT" });
    expect(arrivalsFiltered.total).toBe(1);
    expect(arrivalsFiltered.rows).toHaveLength(1);

    const collectiblesReport = await caller.scan.getCollectiblesReport({ organizationId: orgId, campId });
    expect(collectiblesReport.total).toBe(1);
    expect(collectiblesReport.rows[0]).toMatchObject({ station: "Gift Bags", count: 1 });
  });

  it("rejects a caller from another organization", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: `Other Org ${Date.now()}` } });
    const otherAdmin = await prisma.user.create({
      data: { email: `other-admin-${Date.now()}@test.com`, password: "x", role: "ADMIN", organizationId: otherOrg.id, firstName: "Other", lastName: "Admin" },
    });

    const caller = appRouter.createCaller({
      prisma,
      session: {
        user: { id: otherAdmin.id, email: otherAdmin.email, role: "ADMIN", organizationId: otherOrg.id },
        expires: "",
      },
    });

    await expect(caller.scan.getMealReport({ organizationId: orgId })).rejects.toThrow();

    await prisma.user.delete({ where: { id: otherAdmin.id } });
    await prisma.organization.delete({ where: { id: otherOrg.id } });
  });

  it("searches campers by name or registration number", async () => {
    const caller = appRouter.createCaller({
      prisma,
      session: {
        user: { id: adminId, email: "admin@test.com", role: "ADMIN", organizationId: orgId },
        expires: "",
      },
    });

    const byName = await caller.scan.searchCampers({ organizationId: orgId, query: "Test Camper" });
    expect(byName.length).toBeGreaterThanOrEqual(1);
    expect(byName[0].name).toBe("Test Camper Scan");
    expect(byName[0].registrationId).toBe(registrationId);
  });
});
