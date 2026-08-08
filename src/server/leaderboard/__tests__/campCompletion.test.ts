import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { recordScoreEvent } from "../record";
import { rebuildLeaderboard } from "../aggregate";
import { awardCampCompletion, CAMP_COMPLETION_CATEGORY_ID } from "../dailyOps";

const prisma = new PrismaClient();

let orgId: string;
let campId: string;
let campusId: string;
let tribeId: string;
let registrationId: string;
let staffId: string;

async function makeCamp(endDate: Date) {
  const camp = await prisma.camp.create({
    data: {
      name: `${Date.now()}`,
      slug: `completion-${Date.now()}-${Math.random()}`,
      year: 2026,
      startDate: new Date(2026, 0, 1),
      endDate,
      organizationId: orgId,
      status: "OPEN",
      approvalMode: "AUTO",
    },
  });
  return camp.id;
}

beforeEach(async () => {
  const org = await prisma.organization.create({ data: { name: `Completion Org ${Date.now()}-${Math.random()}` } });
  orgId = org.id;

  // Ends in the future by default, so CAMP_END mode is a no-op unless a test
  // explicitly moves the date back.
  campId = await makeCamp(new Date(Date.now() + 7 * 24 * 60 * 60_000));

  const campus = await prisma.campus.create({
    data: {
      name: `Completion Campus ${Date.now()}`,
      slug: `completion-campus-${Date.now()}-${Math.random()}`,
      address: "1 Test St",
      city: "Testville",
      country: "Testland",
      organizationId: orgId,
      campusCode: "CMP",
    },
  });
  campusId = campus.id;

  const tribe = await prisma.tribe.create({ data: { campId, name: "Judah" } });
  tribeId = tribe.id;

  const parent = await prisma.user.create({
    data: { email: `completion-parent-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "PARENT", organizationId: orgId },
  });
  const camper = await prisma.camper.create({
    data: {
      name: "Completion Camper",
      firstName: "Completion",
      lastName: "Camper",
      dateOfBirth: new Date(2013, 5, 1),
      gender: "MALE",
      userId: parent.id,
      organizationId: orgId,
      homeCampusId: campusId,
    },
  });
  const registration = await prisma.registration.create({
    data: { camperId: camper.id, campId, campusId, tribeId, status: "CHECKED_IN" },
  });
  registrationId = registration.id;

  const staffUser = await prisma.user.create({
    data: { email: `completion-staff-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "TEACHER", organizationId: orgId },
  });
  const staff = await prisma.staffProfile.create({
    data: {
      userId: staffUser.id,
      organizationId: orgId,
      campId,
      type: "TEACHER",
      status: "APPROVED",
      firstName: "T",
      lastName: "Test",
      phone: "+1-555-0000",
      email: staffUser.email,
    },
  });
  staffId = staff.id;
});

afterEach(async () => {
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
});

describe("awardCampCompletion", () => {
  it("MANUAL mode awards nothing automatically, but the forced admin action sweeps everyone", async () => {
    await prisma.leaderboardSettings.create({ data: { campId, completionMode: "MANUAL" } });

    const auto = await awardCampCompletion(campId);
    expect(auto.skipped).toBe("MODE");
    expect(auto.campers).toBe(0);

    const forced = await awardCampCompletion(campId, { force: true });
    expect(forced.campers).toBe(1);
    expect(forced.staff).toBe(1);
  });

  it("never double-credits, even across a mode change and a repeated sweep", async () => {
    await prisma.leaderboardSettings.create({ data: { campId, completionMode: "MANUAL" } });

    await awardCampCompletion(campId, { force: true });
    const second = await awardCampCompletion(campId, { force: true });
    // recordScoreEvent short-circuits on the idempotencyKey, so a repeat run
    // records zero new events rather than throwing.
    expect(second.campers).toBe(0);
    expect(second.staff).toBe(0);

    await prisma.leaderboardSettings.update({ where: { campId }, data: { completionMode: "CHECKOUT" } });
    await prisma.registration.update({ where: { id: registrationId }, data: { checkedOutAt: new Date() } });
    const third = await awardCampCompletion(campId);
    expect(third.campers).toBe(0);

    const events = await prisma.scoreEvent.findMany({ where: { campId, categoryId: CAMP_COMPLETION_CATEGORY_ID, registrationId } });
    expect(events.length).toBe(1);
  });

  it("CHECKOUT mode only credits registrations that actually checked out", async () => {
    await prisma.leaderboardSettings.create({ data: { campId, completionMode: "CHECKOUT" } });

    const beforeCheckout = await awardCampCompletion(campId);
    expect(beforeCheckout.campers).toBe(0);

    await prisma.registration.update({ where: { id: registrationId }, data: { checkedOutAt: new Date() } });
    const afterCheckout = await awardCampCompletion(campId);
    expect(afterCheckout.campers).toBe(1);
  });

  it("CAMP_END mode waits for the camp end date to pass", async () => {
    await prisma.leaderboardSettings.create({ data: { campId, completionMode: "CAMP_END" } });

    const tooEarly = await awardCampCompletion(campId);
    expect(tooEarly.skipped).toBe("MODE");

    await prisma.camp.update({ where: { id: campId }, data: { endDate: new Date(Date.now() - 24 * 60 * 60_000) } });
    const afterEnd = await awardCampCompletion(campId);
    expect(afterEnd.campers).toBe(1);
    expect(afterEnd.staff).toBe(1);
  });

  it("transitions CHECKED_IN registrations to COMPLETED, and reports those it cannot", async () => {
    // A second camper who never checked in: earns the points, but APPROVED
    // cannot legally reach COMPLETED, so their status must stay put.
    const parent2 = await prisma.user.create({
      data: { email: `completion-parent2-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "PARENT", organizationId: orgId },
    });
    const camper2 = await prisma.camper.create({
      data: {
        name: "Never Checked In",
        firstName: "Never",
        lastName: "CheckedIn",
        dateOfBirth: new Date(2013, 5, 1),
        gender: "MALE",
        userId: parent2.id,
        organizationId: orgId,
        homeCampusId: campusId,
      },
    });
    const approvedOnly = await prisma.registration.create({
      data: { camperId: camper2.id, campId, campusId, tribeId, status: "APPROVED" },
    });

    await prisma.leaderboardSettings.create({ data: { campId, completionMode: "MANUAL" } });
    const result = await awardCampCompletion(campId, { force: true });

    expect(result.campers).toBe(2); // both scored
    expect(result.completed).toBe(1); // only the CHECKED_IN one transitioned
    expect(result.notCheckedIn).toBe(1);

    const checkedIn = await prisma.registration.findUniqueOrThrow({ where: { id: registrationId } });
    const untouched = await prisma.registration.findUniqueOrThrow({ where: { id: approvedOnly.id } });
    expect(checkedIn.status).toBe("COMPLETED");
    expect(untouched.status).toBe("APPROVED");

    // The transition is audited through the engine's own logEvent.
    const audit = await prisma.auditLog.findFirst({
      where: { registrationId, action: "REGISTRATION_COMPLETED" },
    });
    expect(audit).not.toBeNull();
  });

  it("re-running after everyone is COMPLETED is a clean no-op", async () => {
    await prisma.leaderboardSettings.create({ data: { campId, completionMode: "MANUAL" } });
    await awardCampCompletion(campId, { force: true });

    const second = await awardCampCompletion(campId, { force: true });
    expect(second.campers).toBe(0); // idempotencyKey short-circuits the points
    expect(second.completed).toBe(0); // already COMPLETED, so nothing to move
    expect(second.notCheckedIn).toBe(0); // COMPLETED is not counted as a failure

    const audits = await prisma.auditLog.count({ where: { registrationId, action: "REGISTRATION_COMPLETED" } });
    expect(audits).toBe(1);
  });

  it("uses the configured completionPoints", async () => {
    await prisma.leaderboardSettings.create({ data: { campId, completionMode: "MANUAL", completionPoints: 123 } });
    await awardCampCompletion(campId, { force: true });

    const event = await prisma.scoreEvent.findFirstOrThrow({
      where: { campId, categoryId: CAMP_COMPLETION_CATEGORY_ID, registrationId },
    });
    expect(event.points).toBe(123);
  });
});

describe("composite scoring — per-category and campus", () => {
  it("a category-weighted metric changes the camper ordering independently of raw points", async () => {
    // Second camper: fewer total points, but all of them in Bible Quiz.
    const parent2 = await prisma.user.create({
      data: { email: `completion-parent2-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "PARENT", organizationId: orgId },
    });
    const camper2 = await prisma.camper.create({
      data: {
        name: "Quiz Camper",
        firstName: "Quiz",
        lastName: "Camper",
        dateOfBirth: new Date(2013, 5, 1),
        gender: "MALE",
        userId: parent2.id,
        organizationId: orgId,
        homeCampusId: campusId,
      },
    });
    const registration2 = await prisma.registration.create({
      data: { camperId: camper2.id, campId, campusId, tribeId, status: "CHECKED_IN" },
    });

    await recordScoreEvent({ campId, registrationId, tribeId, campusId, categoryId: "seed-cat-cleaning", points: 100, source: "MANUAL" });
    await recordScoreEvent({ campId, registrationId: registration2.id, tribeId, campusId, categoryId: "seed-cat-bible-quiz", points: 20, source: "MANUAL" });

    // Weight Bible Quiz exclusively — the lower-scoring camper should win.
    await prisma.leaderboardSettings.create({
      data: { campId, camperMetricWeights: { "cat:seed-cat-bible-quiz": 100 } },
    });
    await prisma.$transaction(async (tx) => rebuildLeaderboard(tx, campId));

    const s1 = await prisma.leaderboardStat.findFirstOrThrow({ where: { campId, subjectType: "CAMPER", subjectId: registrationId, day: null } });
    const s2 = await prisma.leaderboardStat.findFirstOrThrow({ where: { campId, subjectType: "CAMPER", subjectId: registration2.id, day: null } });
    expect(s2.compositeScore!).toBeGreaterThan(s1.compositeScore!);
  });

  it("campuses now get derived stats and a composite score of their own", async () => {
    await recordScoreEvent({ campId, registrationId, tribeId, campusId, categoryId: "seed-cat-teamwork", points: 30, source: "MANUAL" });
    await prisma.leaderboardSettings.create({ data: { campId, campusMetricWeights: { totalPoints: 100 } } });
    await prisma.$transaction(async (tx) => rebuildLeaderboard(tx, campId));

    const stat = await prisma.leaderboardStat.findFirstOrThrow({ where: { campId, subjectType: "CAMPUS", subjectId: campusId, day: null } });
    expect(stat.totalPoints).toBe(30);
    // Previously always null — CAMPUS was skipped by computeCompositeScores.
    expect(stat.compositeScore).not.toBeNull();
  });
});
