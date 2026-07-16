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
let adminId: string;

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

  const admin = await prisma.user.create({
    data: { email: `admin-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "ADMIN", organizationId: orgId },
  });
  adminId = admin.id;
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

describe("campus registration quota (SignupLink-scoped)", () => {
  async function makeSignupLink(overrides: Partial<{ quota: number; quotaFullBehavior: string }> = {}) {
    // Campus quota tests need the Venue's own quota out of the way so the
    // Venue capacity check (quota=1 by default in beforeEach) never
    // interferes with these campus-scoped assertions.
    await prisma.venue.update({ where: { id: venueId }, data: { quota: 100 } });
    return prisma.signupLink.create({
      data: {
        token: `tok-${Date.now()}-${Math.random()}`,
        campusId,
        campId,
        quota: overrides.quota ?? 1,
        quotaFullBehavior: overrides.quotaFullBehavior ?? "CLOSE",
      },
    });
  }

  it("blocks submission with CAMPUS_QUOTA_REACHED once quota is hit (CLOSE behavior)", async () => {
    await makeSignupLink({ quota: 1, quotaFullBehavior: "CLOSE" });

    const camperA = await makeCamper();
    const draftA = await engine.createDraft({ camperId: camperA.id, campId, campusId, actorId: parentId });
    await engine.submitRegistration({ registrationId: draftA.id, actorId: parentId });

    const camperB = await makeCamper();
    const draftB = await engine.createDraft({ camperId: camperB.id, campId, campusId, actorId: parentId });

    await expect(engine.submitRegistration({ registrationId: draftB.id, actorId: parentId })).rejects.toMatchObject({
      name: "RegistrationValidationError",
      failures: expect.arrayContaining([expect.objectContaining({ code: "CAMPUS_QUOTA_REACHED" })]),
    });

    const reloadedB = await prisma.registration.findUniqueOrThrow({ where: { id: draftB.id } });
    expect(reloadedB.status).toBe("DRAFT");
  });

  it("WAITLIST behavior allows submission past quota, then waitlists the excess at approval", async () => {
    await makeSignupLink({ quota: 1, quotaFullBehavior: "WAITLIST" });

    const camperA = await makeCamper();
    const draftA = await engine.createDraft({ camperId: camperA.id, campId, campusId, actorId: parentId });
    const pendingA = await engine.submitRegistration({ registrationId: draftA.id, actorId: parentId });

    const camperB = await makeCamper();
    const draftB = await engine.createDraft({ camperId: camperB.id, campId, campusId, actorId: parentId });
    const pendingB = await engine.submitRegistration({ registrationId: draftB.id, actorId: parentId });
    expect(pendingB.status).toBe("PENDING"); // submission itself is not gated for WAITLIST behavior

    const approvedA = await engine.approveRegistration({ registrationId: pendingA.id, actorId: parentId });
    expect(approvedA.status).toBe("APPROVED");

    const approvedB = await engine.approveRegistration({ registrationId: pendingB.id, actorId: parentId });
    expect(approvedB.status).toBe("WAITLISTED");

    const auditRow = await prisma.auditLog.findFirst({
      where: { registrationId: approvedB.id, action: "REGISTRATION_WAITLISTED" },
    });
    expect((auditRow?.newValue as any)?.reason).toBe("CAMPUS_QUOTA_REACHED");
  });

  it("quota=0 means unlimited — no gate at submission or approval", async () => {
    await makeSignupLink({ quota: 0, quotaFullBehavior: "CLOSE" });

    const camperA = await makeCamper();
    const draftA = await engine.createDraft({ camperId: camperA.id, campId, campusId, actorId: parentId });
    const pendingA = await engine.submitRegistration({ registrationId: draftA.id, actorId: parentId });

    const camperB = await makeCamper();
    const draftB = await engine.createDraft({ camperId: camperB.id, campId, campusId, actorId: parentId });
    const pendingB = await engine.submitRegistration({ registrationId: draftB.id, actorId: parentId });

    const approvedA = await engine.approveRegistration({ registrationId: pendingA.id, actorId: parentId });
    const approvedB = await engine.approveRegistration({ registrationId: pendingB.id, actorId: parentId });
    expect(approvedA.status).toBe("APPROVED");
    expect(approvedB.status).toBe("APPROVED");
  });

  it("a rejected registration frees its slot for the next submission (CLOSE behavior)", async () => {
    await makeSignupLink({ quota: 1, quotaFullBehavior: "CLOSE" });

    const camperA = await makeCamper();
    const draftA = await engine.createDraft({ camperId: camperA.id, campId, campusId, actorId: parentId });
    const pendingA = await engine.submitRegistration({ registrationId: draftA.id, actorId: parentId });
    await engine.rejectRegistration({ registrationId: pendingA.id, actorId: parentId, reason: "Ineligible" });

    const camperB = await makeCamper();
    const draftB = await engine.createDraft({ camperId: camperB.id, campId, campusId, actorId: parentId });
    const pendingB = await engine.submitRegistration({ registrationId: draftB.id, actorId: parentId });
    expect(pendingB.status).toBe("PENDING");
  });

  it("does not exceed campus quota when submitting concurrently (CLOSE, quota=1)", async () => {
    await makeSignupLink({ quota: 1, quotaFullBehavior: "CLOSE" });

    const camperA = await makeCamper();
    const camperB = await makeCamper();
    const draftA = await engine.createDraft({ camperId: camperA.id, campId, campusId, actorId: parentId });
    const draftB = await engine.createDraft({ camperId: camperB.id, campId, campusId, actorId: parentId });

    const results = await Promise.allSettled([
      engine.submitRegistration({ registrationId: draftA.id, actorId: parentId }),
      engine.submitRegistration({ registrationId: draftB.id, actorId: parentId }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const pipelineCount = await prisma.registration.count({
      where: { campusId, campId, status: { in: ["SUBMITTED", "PENDING", "APPROVED"] } },
    });
    expect(pipelineCount).toBe(1);
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

describe("two-step approval workflow", () => {
  async function makePending() {
    const camper = await makeCamper();
    const draft = await engine.createDraft({ camperId: camper.id, campId, campusId, actorId: parentId });
    return engine.submitRegistration({ registrationId: draft.id, actorId: parentId });
  }

  async function enableTwoStep() {
    await prisma.organization.update({ where: { id: orgId }, data: { approvalWorkflow: "TWO_STEP" } });
  }

  it("blocks a non-admin actor from approving directly in a TWO_STEP org", async () => {
    await enableTwoStep();
    const pending = await makePending();

    // parentId is not an org admin — mirrors a campus rep (or the parent
    // themselves) attempting the final-approve action.
    await expect(
      engine.approveRegistration({ registrationId: pending.id, actorId: parentId })
    ).rejects.toMatchObject({ name: "RegistrationEngineError", code: "ADMIN_APPROVAL_REQUIRED" });

    const reloaded = await prisma.registration.findUniqueOrThrow({ where: { id: pending.id } });
    expect(reloaded.status).toBe("PENDING");
  });

  it("lets an admin approve without a prior endorsement, recording it as an override", async () => {
    await enableTwoStep();
    const pending = await makePending();

    const approved = await engine.approveRegistration({ registrationId: pending.id, actorId: adminId });
    expect(approved.status).toBe("APPROVED");

    const auditRow = await prisma.auditLog.findFirst({ where: { registrationId: approved.id, action: "REGISTRATION_APPROVED" } });
    expect((auditRow?.newValue as any)?.twoStepOverride).toBe(true);
  });

  it("does not flag an override when the admin approves an endorsed registration", async () => {
    await enableTwoStep();
    const pending = await makePending();

    await engine.endorseRegistration({ registrationId: pending.id, actorId: parentId });
    const approved = await engine.approveRegistration({ registrationId: pending.id, actorId: adminId });
    expect(approved.status).toBe("APPROVED");

    const auditRow = await prisma.auditLog.findFirst({ where: { registrationId: approved.id, action: "REGISTRATION_APPROVED" } });
    expect((auditRow?.newValue as any)?.twoStepOverride).toBe(false);
  });

  it("endorseRegistration records a recommendation without changing status or sending an email", async () => {
    await enableTwoStep();
    const pending = await makePending();

    const review = await engine.endorseRegistration({ registrationId: pending.id, actorId: parentId, notes: "Looks good" });
    expect(review.verificationStatus).toBe("COMPLETED");
    expect(review.recommendation).toBe("APPROVE");
    expect(review.verifiedById).toBe(parentId);
    expect(review.reviewNotes).toBe("Looks good");

    const reloaded = await prisma.registration.findUniqueOrThrow({ where: { id: pending.id } });
    expect(reloaded.status).toBe("PENDING");
    expect(reloaded.registrationNumber).toBeNull();

    const sideEffects = await prisma.sideEffect.findMany({ where: { registrationId: pending.id, type: "REGISTRATION_APPROVED" } });
    expect(sideEffects).toHaveLength(0);

    const auditRows = await prisma.auditLog.findMany({ where: { registrationId: pending.id, action: "REGISTRATION_ENDORSED" } });
    expect(auditRows).toHaveLength(1);
  });

  it("endorseRegistration is idempotent — a second call is a no-op with no duplicate audit event", async () => {
    await enableTwoStep();
    const pending = await makePending();

    await engine.endorseRegistration({ registrationId: pending.id, actorId: parentId });
    await engine.endorseRegistration({ registrationId: pending.id, actorId: parentId });

    const auditRows = await prisma.auditLog.findMany({ where: { registrationId: pending.id, action: "REGISTRATION_ENDORSED" } });
    expect(auditRows).toHaveLength(1);
  });

  it("endorseRegistration rejects a non-PENDING registration", async () => {
    await enableTwoStep();
    const camper = await makeCamper();
    const draft = await engine.createDraft({ camperId: camper.id, campId, campusId, actorId: parentId });

    await expect(
      engine.endorseRegistration({ registrationId: draft.id, actorId: parentId })
    ).rejects.toMatchObject({ name: "RegistrationEngineError", code: "NOT_PENDING" });
  });

  it("endorseRegistration rejects when the org is not TWO_STEP", async () => {
    const pending = await makePending();

    await expect(
      engine.endorseRegistration({ registrationId: pending.id, actorId: parentId })
    ).rejects.toMatchObject({ name: "RegistrationEngineError", code: "NOT_TWO_STEP" });
  });

  it("does not auto-approve on submit for an AUTO camp when the org is TWO_STEP", async () => {
    await enableTwoStep();
    await prisma.camp.update({ where: { id: campId }, data: { approvalMode: "AUTO" } });
    const camper = await makeCamper();
    const draft = await engine.createDraft({ camperId: camper.id, campId, campusId, actorId: parentId });

    const result = await engine.submitRegistration({ registrationId: draft.id, actorId: parentId });
    expect(result.status).toBe("PENDING");
  });

  it("resets a stale endorsement when the registration is resubmitted after a correction request", async () => {
    await enableTwoStep();
    const pending = await makePending();
    await engine.endorseRegistration({ registrationId: pending.id, actorId: parentId });

    const requiresAction = await engine.requestCorrection({ registrationId: pending.id, actorId: adminId, message: "Fix the DOB" });
    expect(requiresAction.status).toBe("REQUIRES_ACTION");

    await engine.resubmitRegistration({ registrationId: requiresAction.id, actorId: parentId });

    const review = await prisma.registrationReview.findUnique({ where: { registrationId: pending.id } });
    expect(review?.verificationStatus).toBe("NOT_STARTED");
    expect(review?.recommendation).toBeNull();
  });

  it("still lets a non-admin approve directly when the org is SINGLE_STEP (regression)", async () => {
    // org defaults to SINGLE_STEP — no enableTwoStep() call.
    const pending = await makePending();
    const approved = await engine.approveRegistration({ registrationId: pending.id, actorId: parentId });
    expect(approved.status).toBe("APPROVED");
  });
});
