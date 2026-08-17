import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import * as regEngine from "../../registration/engine";
import * as tribeEngine from "../engine";
import * as effects from "../../registration/effects";

const prisma = new PrismaClient();

let orgId: string;
let campId: string;
let campusId: string;
let parentId: string;

async function makeCamper(gender = "MALE") {
  return prisma.camper.create({
    data: {
      name: "Tribe Test Camper",
      firstName: "Tribe",
      lastName: "Test",
      dateOfBirth: new Date(2013, 5, 1),
      gender,
      userId: parentId,
      organizationId: orgId,
      homeCampusId: campusId,
    },
  });
}

async function approvedRegistrationFor(camperId: string) {
  const draft = await regEngine.createDraft({ camperId: camperId, campId, campusId, actorId: parentId });
  return regEngine.submitRegistration({ registrationId: draft.id, actorId: parentId });
}

beforeEach(async () => {
  const org = await prisma.organization.create({ data: { name: `Tribe Org ${Date.now()}-${Math.random()}` } });
  orgId = org.id;

  const camp = await prisma.camp.create({
    data: {
      name: `${Date.now()}`,
      slug: `tribe-test-${Date.now()}-${Math.random()}`,
      year: 2026,
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 11, 31),
      organizationId: orgId,
      status: "OPEN",
      approvalMode: "AUTO",
      ageCutoffDate: new Date(2026, 8, 1),
      orgCode: "TRB",
      tribeAllocationEnabled: true,
      tribeAllocationMode: "MANUAL",
      tribeAllocationRules: [{ criterion: "POPULATION", enabled: true }],
    },
  });
  campId = camp.id;

  const campus = await prisma.campus.create({
    data: {
      name: `Tribe Campus ${Date.now()}`,
      slug: `tribe-campus-${Date.now()}-${Math.random()}`,
      address: "1 Test St",
      city: "Testville",
      country: "Testland",
      organizationId: orgId,
      campusCode: "TLC",
    },
  });
  campusId = campus.id;

  // Sole venue for the camp so approveRegistrationInTx auto-assigns it.
  await prisma.venue.create({
    data: {
      name: `Tribe Venue ${Date.now()}`,
      campId,
      quota: 100,
    },
  });

  const parent = await prisma.user.create({
    data: { email: `tribe-parent-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "PARENT", organizationId: orgId },
  });
  parentId = parent.id;
});

afterEach(async () => {
  // beforeEach creates a fresh Organization -> Camp/Campus -> Venue tree plus
  // a parent User per test case, but nothing ever deleted them — every run
  // left ~19 throwaway orgs sitting in the dev DB permanently. User has no
  // cascade from Organization (restrict), so delete it first; Organization's
  // cascade then takes care of Campus/Camp/Venue/Tribe/etc.
  // SideEffect has no FK/cascade relation to Registration (plain nullable
  // id column), so TRIBE_CHANGED effects enqueued by these tests would
  // otherwise leak into the DB permanently once their org is gone.
  await prisma.sideEffect.deleteMany({ where: { organizationId: orgId } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("tribe suggestion", () => {
  it("returns null when no tribes exist", async () => {
    const camper = await makeCamper();
    const registration = await approvedRegistrationFor(camper.id);
    const suggestion = await tribeEngine.suggestTribe(prisma, registration.id);
    expect(suggestion).toBeNull();
  });

  it("suggests the lower-population tribe when balancing by population", async () => {
    const tribeA = await prisma.tribe.create({ data: { campId, name: "Green" } });
    const tribeB = await prisma.tribe.create({ data: { campId, name: "Blue" } });

    // Pre-fill Green with a camper so Blue has lower population.
    const filler = await makeCamper();
    const fillerReg = await approvedRegistrationFor(filler.id);
    await tribeEngine.assignTribe({ registrationId: fillerReg.id, tribeId: tribeA.id, actorId: parentId });

    const camper = await makeCamper();
    const registration = await approvedRegistrationFor(camper.id);
    const suggestion = await tribeEngine.suggestTribe(prisma, registration.id);

    expect(suggestion?.tribeId).toBe(tribeB.id);
  });

  it("excludes tribes that are at max capacity", async () => {
    const full = await prisma.tribe.create({ data: { campId, name: "Full Tribe", maxCapacity: 1 } });
    const open = await prisma.tribe.create({ data: { campId, name: "Open Tribe" } });

    const filler = await makeCamper();
    const fillerReg = await approvedRegistrationFor(filler.id);
    await tribeEngine.assignTribe({ registrationId: fillerReg.id, tribeId: full.id, actorId: parentId });

    const camper = await makeCamper();
    const registration = await approvedRegistrationFor(camper.id);
    const suggestion = await tribeEngine.suggestTribe(prisma, registration.id);

    expect(suggestion?.tribeId).toBe(open.id);
  });
});

describe("automatic assignment on approval", () => {
  it("assigns a tribe automatically when the camp is in AUTOMATIC mode", async () => {
    await prisma.camp.update({ where: { id: campId }, data: { tribeAllocationMode: "AUTOMATIC" } });
    await prisma.tribe.create({ data: { campId, name: "Auto Tribe" } });

    const camper = await makeCamper();
    const registration = await approvedRegistrationFor(camper.id);

    expect(registration.status).toBe("APPROVED");
    const updated = await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } });
    expect(updated.tribeId).toBeTruthy();
    expect(updated.tribeAssignmentMethod).toBe("AUTOMATIC");
  });

  it("does not block approval when no tribes are configured", async () => {
    const camper = await makeCamper();
    const registration = await approvedRegistrationFor(camper.id);
    expect(registration.status).toBe("APPROVED");
  });
});

describe("bulk active-camper assignment", () => {
  it("includes CHECKED_IN campers, excludes COMPLETED campers, and preserves existing tribes", async () => {
    const originalTribe = await prisma.tribe.create({ data: { campId, name: "Original Tribe" } });
    await prisma.tribe.create({ data: { campId, name: "Available Tribe" } });

    const checkedInCamper = await makeCamper();
    const checkedInRegistration = await approvedRegistrationFor(checkedInCamper.id);
    await prisma.registration.update({ where: { id: checkedInRegistration.id }, data: { status: "CHECKED_IN", tribeId: null } });

    const completedCamper = await makeCamper();
    const completedRegistration = await approvedRegistrationFor(completedCamper.id);
    await prisma.registration.update({ where: { id: completedRegistration.id }, data: { status: "COMPLETED", tribeId: null } });

    const assignedCamper = await makeCamper();
    const assignedRegistration = await approvedRegistrationFor(assignedCamper.id);
    await tribeEngine.assignTribe({ registrationId: assignedRegistration.id, tribeId: originalTribe.id, actorId: parentId });

    const results = await tribeEngine.bulkAutoAssignTribes({ campId, actorId: parentId });

    expect(results.some((result) => result.registrationId === checkedInRegistration.id && result.tribeId)).toBe(true);
    expect(results.some((result) => result.registrationId === completedRegistration.id)).toBe(false);
    expect((await prisma.registration.findUniqueOrThrow({ where: { id: assignedRegistration.id } })).tribeId).toBe(originalTribe.id);
  });
});

describe("manual assignment and capacity enforcement", () => {
  it("rejects assignment to a full tribe", async () => {
    const tribe = await prisma.tribe.create({ data: { campId, name: "Tiny Tribe", maxCapacity: 1 } });

    const camperA = await makeCamper();
    const regA = await approvedRegistrationFor(camperA.id);
    await tribeEngine.assignTribe({ registrationId: regA.id, tribeId: tribe.id, actorId: parentId });

    const camperB = await makeCamper();
    const regB = await approvedRegistrationFor(camperB.id);

    await expect(
      tribeEngine.assignTribe({ registrationId: regB.id, tribeId: tribe.id, actorId: parentId })
    ).rejects.toBeInstanceOf(tribeEngine.TribeAllocationError);
  });

  it("records an audit event on assignment", async () => {
    const tribe = await prisma.tribe.create({ data: { campId, name: "Audited Tribe" } });
    const camper = await makeCamper();
    const registration = await approvedRegistrationFor(camper.id);

    await tribeEngine.assignTribe({ registrationId: registration.id, tribeId: tribe.id, actorId: parentId });

    const logs = await prisma.auditLog.findMany({ where: { registrationId: registration.id, action: { in: ["TRIBE_ASSIGNED", "TRIBE_CHANGED"] } } });
    expect(logs.length).toBeGreaterThan(0);
  });
});

describe("v3 Recommendation Engine (Decoupled Recommendation vs Assignment)", () => {
  it("populates suggestedTribeId without assigning tribeId during recommendTribe", async () => {
    const tribe = await prisma.tribe.create({ data: { campId, name: "Suggested Tribe" } });
    const camper = await makeCamper();
    const draft = await regEngine.createDraft({ camperId: camper.id, campId, campusId, actorId: parentId });

    const recommended = await tribeEngine.recommendTribe(draft.id, parentId);

    expect(recommended.suggestedTribeId).toBe(tribe.id);
    expect(recommended.tribeId).toBeNull();
    expect(recommended.tribeRecommendationStatus).toBe("SUGGESTED");
    expect(recommended.tribeRecommendationReason).toBeTruthy();
  });

  it("stores manual override while preserving original recommendation in overrideRecommendation", async () => {
    const tribeA = await prisma.tribe.create({ data: { campId, name: "Rec Tribe A" } });
    const tribeB = await prisma.tribe.create({ data: { campId, name: "Override Tribe B" } });
    const camper = await makeCamper();
    const draft = await regEngine.createDraft({ camperId: camper.id, campId, campusId, actorId: parentId });

    const rec = await tribeEngine.recommendTribe(draft.id, parentId);
    const targetOverride = rec.suggestedTribeId === tribeA.id ? tribeB.id : tribeA.id;
    const overridden = await tribeEngine.overrideRecommendation(draft.id, targetOverride, parentId, "Admin preferred different tribe");

    expect(overridden.suggestedTribeId).toBe(targetOverride);
    expect(overridden.tribeOriginalSuggestedId).toBe(rec.suggestedTribeId);
    expect(overridden.tribeRecommendationStatus).toBe("MANUAL_OVERRIDE");
  });

  it("converts suggestedTribeId to official tribeId on confirmAssignment", async () => {
    const tribe = await prisma.tribe.create({ data: { campId, name: "Confirmed Tribe" } });
    const camper = await makeCamper();
    const draft = await regEngine.createDraft({ camperId: camper.id, campId, campusId, actorId: parentId });

    await tribeEngine.recommendTribe(draft.id, parentId);
    const confirmed = await tribeEngine.confirmAssignment(draft.id, parentId);

    expect(confirmed.tribeId).toBe(tribe.id);
    expect(confirmed.tribeAssignedAt).toBeTruthy();
    expect(confirmed.tribeRecommendationStatus).toBe("ASSIGNED");
  });

  it("acceptRecommendation succeeds on the first click with no prior recommend/regenerate call", async () => {
    const tribe = await prisma.tribe.create({ data: { campId, name: "First Click Tribe" } });
    const camper = await makeCamper();
    const draft = await regEngine.createDraft({ camperId: camper.id, campId, campusId, actorId: parentId });

    // Deliberately skip recommendTribe/regenerate — mirrors a user clicking
    // "Accept Recommendation" while only the live (unpersisted) preview has been shown.
    const accepted = await tribeEngine.acceptRecommendation(draft.id, parentId);

    expect(accepted.suggestedTribeId).toBe(tribe.id);
    expect(accepted.tribeRecommendationStatus).toBe("ACCEPTED");
  });

  it("bulkSuggestTribes generates suggestions and bulkApplySuggestedTribes confirms assignments", async () => {
    await prisma.camp.update({ where: { id: campId }, data: { approvalMode: "MANUAL" } });
    const tribe = await prisma.tribe.create({ data: { campId, name: "Bulk Tribe" } });
    const camperA = await makeCamper();
    const draftA = await regEngine.createDraft({ camperId: camperA.id, campId, campusId, actorId: parentId });
    await regEngine.submitRegistration({ registrationId: draftA.id, actorId: parentId });

    const suggestResults = await tribeEngine.bulkSuggestTribes({ campId, actorId: parentId });
    expect(suggestResults.length).toBeGreaterThan(0);
    expect(suggestResults[0].suggestedTribeId).toBe(tribe.id);

    const applyResults = await tribeEngine.bulkApplySuggestedTribes({ campId, actorId: parentId });
    expect(applyResults.assigned.length).toBeGreaterThan(0);
    expect(applyResults.assigned[0].tribeId).toBe(tribe.id);
  });

  it("bulkApplySuggestedTribes does not move an already-assigned camper even when passed explicit registrationIds — the reported bug", async () => {
    const originalTribe = await prisma.tribe.create({ data: { campId, name: "Original" } });
    const otherTribe = await prisma.tribe.create({ data: { campId, name: "Other" } });
    const camper = await makeCamper();
    const registration = await approvedRegistrationFor(camper.id);
    await tribeEngine.assignTribe({ registrationId: registration.id, tribeId: originalTribe.id, actorId: parentId });

    // Suggest a *different* tribe for the already-assigned registration, then
    // try to apply it via the exact call shape the admin UI's "Apply Tribes"
    // button makes (explicit registrationIds) — this used to reassign
    // regardless of the existing tribeId.
    await prisma.registration.update({ where: { id: registration.id }, data: { suggestedTribeId: otherTribe.id } });

    const result = await tribeEngine.bulkApplySuggestedTribes({ campId, registrationIds: [registration.id], actorId: parentId });

    expect(result.assigned).toHaveLength(0);
    expect(result.skippedAlreadyAssigned).toEqual([registration.id]);
    const unchanged = await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } });
    expect(unchanged.tribeId).toBe(originalTribe.id);
  });

  it("bulkApplySuggestedTribes still assigns tribeless registrations in the same selection as a skipped one", async () => {
    // MANUAL approval mode: submitting alone doesn't reach APPROVED, so
    // autoAssignTribeOnApproval never fires for either registration below —
    // this camp has tribeAllocationEnabled, and under the default AUTO mode
    // submitRegistration auto-approves, which would auto-assign a tribe
    // before this test gets to it, defeating the "tribeless" premise.
    await prisma.camp.update({ where: { id: campId }, data: { approvalMode: "MANUAL" } });
    const originalTribe = await prisma.tribe.create({ data: { campId, name: "Original" } });
    const targetTribe = await prisma.tribe.create({ data: { campId, name: "Target" } });

    const assignedCamper = await makeCamper();
    const assignedReg = await approvedRegistrationFor(assignedCamper.id);
    await tribeEngine.assignTribe({ registrationId: assignedReg.id, tribeId: originalTribe.id, actorId: parentId });
    await prisma.registration.update({ where: { id: assignedReg.id }, data: { suggestedTribeId: targetTribe.id } });

    const freshCamper = await makeCamper();
    const freshReg = await approvedRegistrationFor(freshCamper.id);
    await prisma.registration.update({ where: { id: freshReg.id }, data: { suggestedTribeId: targetTribe.id } });

    const result = await tribeEngine.bulkApplySuggestedTribes({
      campId,
      registrationIds: [assignedReg.id, freshReg.id],
      actorId: parentId,
    });

    expect(result.skippedAlreadyAssigned).toEqual([assignedReg.id]);
    expect(result.assigned.map((r) => r.registrationId)).toEqual([freshReg.id]);
  });

  it("bulkApplySuggestedTribes with allowReassign:true moves an already-assigned camper and writes a TRIBE_CHANGED audit row", async () => {
    const originalTribe = await prisma.tribe.create({ data: { campId, name: "Original" } });
    const targetTribe = await prisma.tribe.create({ data: { campId, name: "Target" } });
    const camper = await makeCamper();
    const registration = await approvedRegistrationFor(camper.id);
    await tribeEngine.assignTribe({ registrationId: registration.id, tribeId: originalTribe.id, actorId: parentId });
    await prisma.registration.update({ where: { id: registration.id }, data: { suggestedTribeId: targetTribe.id } });

    const result = await tribeEngine.bulkApplySuggestedTribes({
      campId,
      registrationIds: [registration.id],
      actorId: parentId,
      allowReassign: true,
    });

    expect(result.assigned.map((r) => r.registrationId)).toEqual([registration.id]);
    const updated = await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } });
    expect(updated.tribeId).toBe(targetTribe.id);

    const changeLog = await prisma.auditLog.findFirst({
      where: { registrationId: registration.id, action: "TRIBE_CHANGED" },
      orderBy: { createdAt: "desc" },
    });
    expect(changeLog).toBeTruthy();
    expect((changeLog!.previousValue as any).tribeId).toBe(originalTribe.id);
    expect((changeLog!.newValue as any).tribeId).toBe(targetTribe.id);
  });

  it("isTribeLocked blocks a reassignment attempt unless explicitly overridden", async () => {
    const originalTribe = await prisma.tribe.create({ data: { campId, name: "Original" } });
    const targetTribe = await prisma.tribe.create({ data: { campId, name: "Target" } });
    const camper = await makeCamper();
    const registration = await approvedRegistrationFor(camper.id);
    await tribeEngine.assignTribe({ registrationId: registration.id, tribeId: originalTribe.id, actorId: parentId });
    await prisma.registration.update({ where: { id: registration.id }, data: { isTribeLocked: true, suggestedTribeId: targetTribe.id } });

    const result = await tribeEngine.bulkApplySuggestedTribes({
      campId,
      registrationIds: [registration.id],
      actorId: parentId,
      allowReassign: true,
    });

    expect(result.assigned).toHaveLength(0);
    expect(result.skippedLocked).toEqual([registration.id]);
    const unchanged = await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } });
    expect(unchanged.tribeId).toBe(originalTribe.id);

    // A direct assignTribe call for a locked registration is rejected the same way.
    await expect(
      tribeEngine.assignTribe({ registrationId: registration.id, tribeId: targetTribe.id, actorId: parentId })
    ).rejects.toThrow(/locked/i);
  });

  it("enqueues a TRIBE_CHANGED side effect only on a real reassignment, not on first-time assignment", async () => {
    // Approve before any tribe exists in the camp — approveRegistrationInTx
    // unconditionally calls confirmAssignmentInTx (not gated by
    // tribeAllocationEnabled), and suggestTribe returns null with nothing to
    // suggest, so the registration genuinely reaches APPROVED with no tribe.
    // Creating tribeA/B beforehand would let that same call auto-assign one
    // of them at approval time, making the "first assignment" below actually
    // a reassignment.
    const camper = await makeCamper();
    const registration = await approvedRegistrationFor(camper.id);
    const tribeA = await prisma.tribe.create({ data: { campId, name: "Tribe A" } });
    const tribeB = await prisma.tribe.create({ data: { campId, name: "Tribe B" } });

    // First-time assignment: covered by the approval email, no correction needed.
    await tribeEngine.assignTribe({ registrationId: registration.id, tribeId: tribeA.id, actorId: parentId });
    const afterFirst = await prisma.sideEffect.count({ where: { registrationId: registration.id, type: "TRIBE_CHANGED" } });
    expect(afterFirst).toBe(0);

    // Real reassignment: the correction email is warranted. Enqueueing also
    // kicks off processing immediately (fire-and-forget via setImmediate —
    // see enqueueTribeChangedEffect's doc comment), so don't assert a
    // specific status here; just confirm a TRIBE_CHANGED effect exists with
    // the right snapshot. The debounce test below exercises the QUEUED
    // window itself directly.
    await tribeEngine.reassignTribe({ registrationId: registration.id, tribeId: tribeB.id, actorId: parentId });
    const effect = await prisma.sideEffect.findFirst({ where: { registrationId: registration.id, type: "TRIBE_CHANGED" } });
    expect(effect).toBeTruthy();
    expect((effect!.payload as any).previousTribeId).toBe(tribeA.id);
    expect((effect!.payload as any).previousTribeName).toBe("Tribe A");
  });

  it("debounces enqueuing a TRIBE_CHANGED effect while one is already queued, refreshing the snapshot instead of duplicating", async () => {
    // Exercises enqueueTribeChangedEffect's own debounce branch directly,
    // against a manually-seeded QUEUED row — the real call path also kicks
    // off fire-and-forget processing (see its doc comment), which would
    // otherwise race this test's "still queued" premise: two reassignments
    // moments apart could easily land after the first has already finished
    // processing, in which case there's genuinely nothing left to debounce
    // against (a real duplicate is then correct, not a bug).
    const camper = await makeCamper();
    const registration = await approvedRegistrationFor(camper.id);
    const tribeA = await prisma.tribe.create({ data: { campId, name: "Tribe A" } });
    const tribeB = await prisma.tribe.create({ data: { campId, name: "Tribe B" } });

    await prisma.sideEffect.create({
      data: {
        registrationId: registration.id,
        type: "TRIBE_CHANGED",
        status: "QUEUED",
        payload: { previousTribeId: tribeA.id, previousTribeName: "Tribe A" },
      },
    });

    // The debounce path itself also kicks a fire-and-forget process of the
    // (now-updated) row, same as a fresh enqueue — but that kick needs
    // several sequential DB round trips (find, claim, run, mark done),
    // while the assertions below are one query immediately after a single
    // `await`, well ahead of it in practice.
    await effects.enqueueTribeChangedEffect({ registrationId: registration.id, previousTribeId: tribeB.id, previousTribeName: "Tribe B" });

    const all = await prisma.sideEffect.findMany({ where: { registrationId: registration.id, type: "TRIBE_CHANGED" } });
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe("QUEUED");
    expect((all[0].payload as any).previousTribeName).toBe("Tribe B");
  });
});
