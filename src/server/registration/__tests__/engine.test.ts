import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import * as engine from "../engine";
import { RegistrationValidationError } from "../validation";
import { IllegalTransitionError, canTransition } from "../stateMachine";
import { calculateAge } from "../validation";

const prisma = new PrismaClient();

let orgId: string;
let campId: string;
let campusId: string;
let venueId: string;
let parentId: string;

async function makeCamper(overrides: Partial<{ dateOfBirth: Date }> = {}) {
  const camper = await prisma.camper.create({
    data: {
      name: "Test Camper",
      firstName: "Test",
      lastName: "Camper",
      gender: "Male",
      dateOfBirth: overrides.dateOfBirth ?? new Date(2013, 5, 1),
      userId: parentId,
      organizationId: orgId,
      homeCampusId: campusId,
    },
  });
  return camper;
}

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
      quota: 1,
    },
  });
  venueId = venue.id;

  const parent = await prisma.user.create({
    data: { email: `parent-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "PARENT", organizationId: orgId },
  });
  parentId = parent.id;
});

afterEach(async () => {
  // beforeEach creates a fresh Organization -> Camp/Campus -> Venue tree plus
  // a parent User per test case, but nothing ever deleted them — every run
  // left ~19 throwaway orgs sitting in the dev DB permanently. User has no
  // cascade from Organization (restrict), so delete it first; Organization's
  // cascade then takes care of Campus/Camp/Venue/DocumentRequirement/etc.
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("state machine", () => {
  it("allows legal transitions", () => {
    expect(canTransition("DRAFT", "SUBMITTED")).toBe(true);
    expect(canTransition("PENDING", "APPROVED")).toBe(true);
    expect(canTransition("APPROVED", "CHECKED_IN")).toBe(true);
  });

  it("rejects illegal transitions", () => {
    expect(canTransition("DRAFT", "APPROVED")).toBe(false);
    expect(canTransition("ARCHIVED", "PENDING")).toBe(false);
    expect(canTransition("COMPLETED", "DRAFT")).toBe(false);
  });
});

describe("age calculation", () => {
  it("computes age at the cutoff date, not today", () => {
    const dob = new Date(2013, 5, 15); // June 15 2013
    const cutoff = new Date(2026, 8, 1); // Sept 1 2026 -> already had birthday -> 13
    expect(calculateAge(dob, cutoff)).toBe(13);

    const cutoffBeforeBirthday = new Date(2026, 4, 1); // May 1 2026 -> not yet had birthday -> 12
    expect(calculateAge(dob, cutoffBeforeBirthday)).toBe(12);
  });
});

describe("submission pipeline", () => {
  it("rejects a camper who is too young at the cutoff date", async () => {
    const camper = await makeCamper({ dateOfBirth: new Date(2020, 0, 1) }); // ~6 at cutoff
    const draft = await engine.createDraft({ camperId: camper.id, campId, campusId, actorId: parentId });

    await expect(engine.submitRegistration({ registrationId: draft.id, actorId: parentId })).rejects.toBeInstanceOf(
      RegistrationValidationError
    );
  });

  it("moves DRAFT -> PENDING on submit for a valid, eligible camper (manual approval mode)", async () => {
    const camper = await makeCamper();
    const draft = await engine.createDraft({ camperId: camper.id, campId, campusId, actorId: parentId });

    const submitted = await engine.submitRegistration({ registrationId: draft.id, actorId: parentId });
    expect(submitted.status).toBe("PENDING");
  });

  it("auto-approves and assigns a registration number when the camp uses AUTO approval", async () => {
    await prisma.camp.update({ where: { id: campId }, data: { approvalMode: "AUTO" } });
    const camper = await makeCamper();
    const draft = await engine.createDraft({ camperId: camper.id, campId, campusId, actorId: parentId });

    const result = await engine.submitRegistration({ registrationId: draft.id, actorId: parentId });
    expect(result.status).toBe("APPROVED");
    expect(result.registrationNumber).toMatch(/^TST-.+-TLC-\d{5}$/);
    expect(result.qrToken).toBeTruthy();
  });

  it("rejects duplicate registrations for the same camper+camp", async () => {
    const camper = await makeCamper();
    const first = await engine.createDraft({ camperId: camper.id, campId, campusId, actorId: parentId });
    await engine.submitRegistration({ registrationId: first.id, actorId: parentId });

    // createDraft is idempotent per camper+camp, so this returns the same draft/pending row.
    const second = await engine.createDraft({ camperId: camper.id, campId, campusId, actorId: parentId });
    expect(second.id).toBe(first.id);
  });

  it("re-submitting an already-PENDING registration is a no-op — no error, no duplicate audit event or side effect", async () => {
    const camper = await makeCamper();
    const draft = await engine.createDraft({ camperId: camper.id, campId, campusId, actorId: parentId });
    const pending = await engine.submitRegistration({ registrationId: draft.id, actorId: parentId });
    expect(pending.status).toBe("PENDING");

    const retried = await engine.submitRegistration({ registrationId: draft.id, actorId: parentId });
    expect(retried.status).toBe("PENDING");
    expect(retried.id).toBe(pending.id);

    const submittedEvents = await prisma.auditLog.findMany({
      where: { registrationId: pending.id, action: "REGISTRATION_SUBMITTED" },
    });
    expect(submittedEvents).toHaveLength(1);

    const sideEffects = await prisma.sideEffect.findMany({
      where: { registrationId: pending.id, type: "REGISTRATION_SUBMITTED" },
    });
    expect(sideEffects).toHaveLength(1);
  });

  it("re-submitting an already-SUBMITTED registration is a no-op (mid-transaction race window)", async () => {
    const camper = await makeCamper();
    const draft = await engine.createDraft({ camperId: camper.id, campId, campusId, actorId: parentId });
    await prisma.registration.update({ where: { id: draft.id }, data: { status: "SUBMITTED" } });

    const result = await engine.submitRegistration({ registrationId: draft.id, actorId: parentId });
    expect(result.status).toBe("SUBMITTED");
  });

  it("still throws IllegalTransitionError for a genuinely illegal re-submit (e.g. already APPROVED)", async () => {
    const camper = await makeCamper();
    const draft = await engine.createDraft({ camperId: camper.id, campId, campusId, actorId: parentId });
    const pending = await engine.submitRegistration({ registrationId: draft.id, actorId: parentId });
    await engine.approveRegistration({ registrationId: pending.id, actorId: parentId });

    await expect(
      engine.submitRegistration({ registrationId: pending.id, actorId: parentId })
    ).rejects.toBeInstanceOf(IllegalTransitionError);
  });
});

describe("approval workflow", () => {
  it("approves a pending registration and assigns number + QR", async () => {
    const camper = await makeCamper();
    const draft = await engine.createDraft({ camperId: camper.id, campId, campusId, actorId: parentId });
    const pending = await engine.submitRegistration({ registrationId: draft.id, actorId: parentId });

    const approved = await engine.approveRegistration({ registrationId: pending.id, actorId: parentId });
    expect(approved.status).toBe("APPROVED");
    expect(approved.registrationNumber).toBeTruthy();
    expect(approved.qrToken).toBeTruthy();

    const auditRows = await prisma.auditLog.findMany({ where: { registrationId: approved.id } });
    expect(auditRows.some((r) => r.action === "REGISTRATION_APPROVED")).toBe(true);
  });

  it("throws IllegalTransitionError when approving a DRAFT directly", async () => {
    const camper = await makeCamper();
    const draft = await engine.createDraft({ camperId: camper.id, campId, campusId, actorId: parentId });
    await expect(engine.approveRegistration({ registrationId: draft.id, actorId: parentId })).rejects.toBeInstanceOf(
      IllegalTransitionError
    );
  });

  it("does not exceed venue capacity when approving concurrently (quota=1)", async () => {
    const camperA = await makeCamper();
    const camperB = await makeCamper();

    const draftA = await engine.createDraft({ camperId: camperA.id, campId, campusId, actorId: parentId });
    const draftB = await engine.createDraft({ camperId: camperB.id, campId, campusId, actorId: parentId });
    const pendingA = await engine.submitRegistration({ registrationId: draftA.id, actorId: parentId });
    const pendingB = await engine.submitRegistration({ registrationId: draftB.id, actorId: parentId });

    const [resultA, resultB] = await Promise.all([
      engine.approveRegistration({ registrationId: pendingA.id, actorId: parentId }),
      engine.approveRegistration({ registrationId: pendingB.id, actorId: parentId }),
    ]);

    const statuses = [resultA.status, resultB.status].sort();
    // Exactly one should be APPROVED and the other WAITLISTED — the camp's sole venue has quota 1.
    expect(statuses).toEqual(["APPROVED", "WAITLISTED"]);

    const approvedCount = await prisma.registration.count({ where: { venueId, status: "APPROVED" } });
    expect(approvedCount).toBe(1);
  });
});

describe("rejection and correction workflow", () => {
  it("rejects a pending registration with a reason", async () => {
    const camper = await makeCamper();
    const draft = await engine.createDraft({ camperId: camper.id, campId, campusId, actorId: parentId });
    const pending = await engine.submitRegistration({ registrationId: draft.id, actorId: parentId });

    const rejected = await engine.rejectRegistration({ registrationId: pending.id, actorId: parentId, reason: "Missing docs" });
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.rejectionReason).toBe("Missing docs");
  });

  it("allows resubmission after a correction request", async () => {
    const camper = await makeCamper();
    const draft = await engine.createDraft({ camperId: camper.id, campId, campusId, actorId: parentId });
    const pending = await engine.submitRegistration({ registrationId: draft.id, actorId: parentId });

    const requiresAction = await engine.requestCorrection({
      registrationId: pending.id,
      actorId: parentId,
      message: "Please re-upload the birth certificate.",
    });
    expect(requiresAction.status).toBe("REQUIRES_ACTION");

    const resubmitted = await engine.resubmitRegistration({ registrationId: requiresAction.id, actorId: parentId });
    expect(resubmitted.status).toBe("PENDING");
    expect(resubmitted.correctionRequest).toBeNull();
  });
});
