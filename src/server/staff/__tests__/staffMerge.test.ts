import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { mergeStaffProfilesInTx, StaffMergeError } from "../merge";

const prisma = new PrismaClient();
const stamp = `${Date.now()}-${Math.random()}`.replace(".", "-");

let organizationId = "";
let campId = "";
let campusId = "";
let venueId = "";
let hostelId = "";
let roomId = "";
let formFieldId = "";
let camperId = "";
let registrationAId = "";
let registrationBId = "";
let sessionId = "";
let tribeId = "";
let achievementDefId = "";

function randomPhone() {
  return `080${Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, "0")}`;
}

async function createStaff(label: string, overrides: Record<string, unknown> = {}) {
  const email = `${label}-${stamp}@camply.test`;
  const user = await prisma.user.create({ data: { email, password: "x", role: "TEACHER", organizationId } });
  const profile = await prisma.staffProfile.create({
    data: {
      userId: user.id,
      organizationId,
      campId,
      type: "TEACHER",
      status: "APPROVED",
      firstName: label,
      lastName: "Staff",
      phone: randomPhone(),
      email,
      ...overrides,
    },
  });
  return { userId: user.id, staffId: profile.id, email };
}

beforeAll(async () => {
  const organization = await prisma.organization.create({ data: { name: `StaffMerge ${stamp}`, slug: `staffmerge-${stamp}` } });
  organizationId = organization.id;
  const camp = await prisma.camp.create({
    data: {
      name: `StaffMerge ${stamp}`,
      slug: `staffmerge-camp-${stamp}`,
      year: 2026,
      startDate: new Date("2026-08-01"),
      endDate: new Date("2026-08-31"),
      organizationId,
      status: "OPEN",
      active: true,
      approvalMode: "AUTO",
    },
  });
  campId = camp.id;
  await prisma.organization.update({ where: { id: organizationId }, data: { activeCampId: campId } });

  const campus = await prisma.campus.create({
    data: { name: `StaffMerge Campus ${stamp}`, slug: `staffmerge-campus-${stamp}`, address: "1 Way", city: "Lagos", country: "NG", organizationId },
  });
  campusId = campus.id;

  const venue = await prisma.venue.create({ data: { name: `StaffMerge Venue ${stamp}`, campId } });
  venueId = venue.id;

  const hostel = await prisma.hostel.create({ data: { organizationId, venueId, name: `StaffMerge Hostel ${stamp}` } });
  hostelId = hostel.id;
  const room = await prisma.room.create({ data: { hostelId, name: `Room ${stamp}` } });
  roomId = room.id;

  const formField = await prisma.formField.create({
    data: { organizationId, audience: "TEACHER", source: "CUSTOM", name: `custom_${stamp}`, label: "Custom Field", type: "TEXT" },
  });
  formFieldId = formField.id;

  const parentUser = await prisma.user.create({ data: { email: `parent-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId } });
  const camperA = await prisma.camper.create({ data: { name: "Test Camper A", organizationId, userId: parentUser.id } as any });
  const camperB = await prisma.camper.create({ data: { name: "Test Camper B", organizationId, userId: parentUser.id } as any });
  camperId = camperA.id;
  const regA = await prisma.registration.create({ data: { camperId: camperA.id, campId, campusId, status: "APPROVED" } });
  registrationAId = regA.id;
  const regB = await prisma.registration.create({ data: { camperId: camperB.id, campId, campusId, status: "APPROVED" } });
  registrationBId = regB.id;

  const owner = await prisma.user.create({ data: { email: `owner-${stamp}@camply.test`, password: "x", role: "OWNER", organizationId } });
  const session = await prisma.attendanceSession.create({
    data: { campId, name: `Session ${stamp}`, date: new Date("2026-08-05"), audience: "TEACHER", createdById: owner.id },
  });
  sessionId = session.id;

  const tribe = await prisma.tribe.create({ data: { campId, name: `StaffMerge Tribe ${stamp}` } });
  tribeId = tribe.id;

  const achievementDef = await prisma.achievementDefinition.create({
    data: { campId, key: `merge-badge-${stamp}`, name: "Merge Badge", subjectType: "STAFF" },
  });
  achievementDefId = achievementDef.id;
});

afterAll(async () => {
  await prisma.registration.deleteMany({ where: { campId } });
  await prisma.camper.deleteMany({ where: { organizationId } });
  await prisma.staffProfile.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.tribe.deleteMany({ where: { campId } });
  await prisma.achievementDefinition.deleteMany({ where: { campId } });
  await prisma.attendanceSession.deleteMany({ where: { campId } });
  await prisma.room.deleteMany({ where: { id: roomId } });
  await prisma.hostel.deleteMany({ where: { id: hostelId } });
  await prisma.venue.deleteMany({ where: { id: venueId } });
  await prisma.formField.deleteMany({ where: { id: formFieldId } });
  await prisma.campus.deleteMany({ where: { id: campusId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await prisma.$disconnect();
});

describe("mergeStaffProfilesInTx — guards", () => {
  it("refuses a self-merge", async () => {
    const a = await createStaff("SelfA");
    await prisma.$transaction(async (tx) => {
      await expect(mergeStaffProfilesInTx(tx, { sourceId: a.staffId, targetId: a.staffId, actorId: null })).rejects.toThrow(StaffMergeError);
    });
  });

  it("refuses a cross-camp merge", async () => {
    const otherCamp = await prisma.camp.create({
      data: {
        name: `OtherCamp ${stamp}`, slug: `othercamp-${stamp}`, year: 2027,
        startDate: new Date("2027-08-01"), endDate: new Date("2027-08-31"),
        organizationId, status: "OPEN", active: true, approvalMode: "AUTO",
      },
    });
    const a = await createStaff("CrossCampA");
    const otherUser = await prisma.user.create({ data: { email: `crosscampb-${stamp}@camply.test`, password: "x", role: "TEACHER", organizationId } });
    const b = await prisma.staffProfile.create({
      data: { userId: otherUser.id, organizationId, campId: otherCamp.id, type: "TEACHER", status: "APPROVED", firstName: "CrossCampB", lastName: "Staff", phone: randomPhone(), email: otherUser.email },
    });
    await prisma.$transaction(async (tx) => {
      await expect(mergeStaffProfilesInTx(tx, { sourceId: a.staffId, targetId: b.id, actorId: null })).rejects.toThrow(StaffMergeError);
    });
    await prisma.staffProfile.deleteMany({ where: { id: b.id } });
    await prisma.camp.deleteMany({ where: { id: otherCamp.id } });
  });

  it("refuses a cross-type merge unless allowCrossType is set", async () => {
    const a = await createStaff("TypeA", { type: "TEACHER" });
    const b = await createStaff("TypeB", { type: "VOLUNTEER" });
    await prisma.$transaction(async (tx) => {
      await expect(mergeStaffProfilesInTx(tx, { sourceId: a.staffId, targetId: b.staffId, actorId: null })).rejects.toThrow(StaffMergeError);
    });
    const result = await prisma.$transaction((tx) =>
      mergeStaffProfilesInTx(tx, { sourceId: a.staffId, targetId: b.staffId, actorId: null, allowCrossType: true })
    );
    expect(result.targetId).toBe(b.staffId);
  });

  it("refuses merging away a sitting Camp Commandant", async () => {
    const dept = await prisma.department.create({ data: { organizationId, campId, name: `CommandDept-${stamp}` } });
    const position = await prisma.position.create({ data: { campId, departmentId: dept.id, name: "Camp Commandant", leadershipRole: "COMMANDANT" } });
    const commandant = await createStaff("Commandant");
    const other = await createStaff("NotCommandant");
    await prisma.positionAssignment.create({ data: { positionId: position.id, staffId: commandant.staffId, isCurrent: true } });
    await prisma.$transaction(async (tx) => {
      await expect(mergeStaffProfilesInTx(tx, { sourceId: commandant.staffId, targetId: other.staffId, actorId: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });
});

describe("mergeStaffProfilesInTx — happy path with every relation", () => {
  it("moves every relation, resolves collisions, and reports one counter per relation", async () => {
    const source = await createStaff("HpSource", { preferredCampusId: campusId, skills: ["Music"], teams: ["Alpha"] });
    const target = await createStaff("HpTarget", { preferredCampusId: campusId, skills: ["Teaching"], teams: ["Beta"] });

    // StaffFieldValue: source has an answer, target doesn't -> moved
    await prisma.staffFieldValue.create({ data: { fieldId: formFieldId, staffProfileId: source.staffId, value: "Answer" } });

    // TeacherCamperAssignment: no collision -> moved
    await prisma.teacherCamperAssignment.create({ data: { staffProfileId: source.staffId, registrationId: registrationAId } });

    // StaffAttendanceRecord: no collision -> moved
    await prisma.staffAttendanceRecord.create({
      data: { sessionId, staffProfileId: source.staffId, status: "PRESENT", recordedById: source.staffId },
    });

    // StaffMealDistribution: no collision -> moved
    await prisma.staffMealDistribution.create({
      data: { campId, staffProfileId: source.staffId, meal: "LUNCH", date: new Date("2026-08-05"), servedById: source.staffId },
    });

    // Bed: source has one, target has none -> transferred
    const bed = await prisma.bed.create({ data: { roomId, label: `Bed-${stamp}`, staffProfileId: source.staffId, status: "OCCUPIED" as any } });

    // PositionAssignment: source holds a seat -> moved
    const dept = await prisma.department.create({ data: { organizationId, campId, name: `HpDept-${stamp}` } });
    const position = await prisma.position.create({ data: { campId, departmentId: dept.id, name: `HpRole-${stamp}` } });
    await prisma.positionAssignment.create({ data: { positionId: position.id, staffId: source.staffId, isCurrent: true } });

    // StaffScanEvent
    const owner = await prisma.user.findFirstOrThrow({ where: { organizationId, role: "OWNER" } });
    await prisma.staffScanEvent.create({ data: { staffProfileId: source.staffId, campId, station: "CHECK_IN", scannedById: owner.id, result: "SUCCESS" } });

    // Checklist item + execution
    const checklistItem = await prisma.departmentChecklistItem.create({
      data: { departmentId: dept.id, title: "Task", assignedStaffId: source.staffId },
    });
    await prisma.departmentChecklistExecution.create({
      data: {
        executionKey: `exec-${stamp}`, checklistItemId: checklistItem.id, departmentId: dept.id, campId,
        date: new Date("2026-08-05"), taskTitle: "Task", routine: "ONE_TIME", assignmentType: "PERSON",
        assignedStaffId: source.staffId, assignedNameSnapshot: "HpSource Staff",
      },
    });

    // Tribe headship
    await prisma.tribe.update({ where: { id: tribeId }, data: { maleHeadId: source.staffId } });

    // reportsTo: give source a supervisor
    const supervisor = await createStaff("Supervisor");
    await prisma.staffProfile.update({ where: { id: source.staffId }, data: { reportsToId: supervisor.staffId } });
    // and a direct report of source
    const report = await createStaff("DirectReport");
    await prisma.staffProfile.update({ where: { id: report.staffId }, data: { reportsToId: source.staffId } });

    // ScoreEvent + LeaderboardStat total
    await prisma.scoreEvent.create({
      data: { campId, staffProfileId: source.staffId, categoryId: "attendance", points: 50, source: "MANUAL", day: new Date("2026-08-05") },
    });
    await prisma.leaderboardStat.create({ data: { campId, subjectType: "STAFF", subjectId: source.staffId, day: null, totalPoints: 50 } });

    // AchievementAward: no collision -> moved
    await prisma.achievementAward.create({ data: { definitionId: achievementDefId, campId, subjectKey: `S:${source.staffId}` } });

    // qrToken: source has one, target doesn't -> adopted
    await prisma.staffProfile.update({ where: { id: source.staffId }, data: { qrToken: `STF-${stamp}-source`, qrIssuedAt: new Date() } });

    const result = await prisma.$transaction((tx) => mergeStaffProfilesInTx(tx, { sourceId: source.staffId, targetId: target.staffId, actorId: owner.id }));

    expect(result.fieldValuesMoved).toBe(1);
    expect(result.camperAssignmentsMoved).toBe(1);
    expect(result.attendanceRecordsMoved).toBe(1);
    expect(result.mealDistributionsMoved).toBe(1);
    expect(result.bedTransferred).toBe(true);
    expect(result.positionAssignmentsMoved).toBe(1);
    expect(result.scanEventsMoved).toBe(1);
    expect(result.checklistItemsMoved).toBe(1);
    expect(result.checklistExecutionsMoved).toBe(1);
    expect(result.tribeHeadshipsMoved).toBe(1);
    expect(result.directReportsMoved).toBe(1);
    expect(result.reportsToAdopted).toBe(true);
    expect(result.scoreEventsMoved).toBe(1);
    expect(result.pointsMoved).toBe(50);
    expect(result.achievementsMoved).toBe(1);
    expect(result.qrTokenAdopted).toBe(true);

    // Verify actual DB state, not just counters.
    const refreshedTarget = await prisma.staffProfile.findUniqueOrThrow({ where: { id: target.staffId } });
    expect(refreshedTarget.qrToken).toBe(`STF-${stamp}-source`);
    expect(refreshedTarget.preferredCampusId).toBe(campusId);
    expect(refreshedTarget.skills.sort()).toEqual(["Music", "Teaching"].sort());
    expect(refreshedTarget.teams.sort()).toEqual(["Alpha", "Beta"].sort());
    expect(refreshedTarget.reportsToId).toBe(supervisor.staffId);

    const refreshedSource = await prisma.staffProfile.findUniqueOrThrow({ where: { id: source.staffId } });
    expect(refreshedSource.deletedAt).not.toBeNull();
    expect(refreshedSource.qrToken).toBeNull();

    const refreshedBed = await prisma.bed.findUniqueOrThrow({ where: { id: bed.id } });
    expect(refreshedBed.staffProfileId).toBe(target.staffId);

    const refreshedReport = await prisma.staffProfile.findUniqueOrThrow({ where: { id: report.staffId } });
    expect(refreshedReport.reportsToId).toBe(target.staffId);

    const targetTotalStat = await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "STAFF", subjectId: target.staffId, day: null } });
    expect(targetTotalStat?.totalPoints).toBe(50);
    const sourceStats = await prisma.leaderboardStat.findMany({ where: { campId, subjectType: "STAFF", subjectId: source.staffId } });
    expect(sourceStats).toHaveLength(0);

    const movedScoreEvent = await prisma.scoreEvent.findFirstOrThrow({ where: { campId, staffProfileId: target.staffId } });
    expect(movedScoreEvent.points).toBe(50);

    const movedExecution = await prisma.departmentChecklistExecution.findUniqueOrThrow({ where: { executionKey: `exec-${stamp}` } });
    expect(movedExecution.assignedNameSnapshot).toBe("HpTarget Staff");

    const refreshedTribe = await prisma.tribe.findUniqueOrThrow({ where: { id: tribeId } });
    expect(refreshedTribe.maleHeadId).toBe(target.staffId);
  });
});

describe("mergeStaffProfilesInTx — collision handling", () => {
  it("StaffFieldValue: drops the source's answer when the target already has a non-blank one, backfills when the target's is blank", async () => {
    const source = await createStaff("FVSource");
    const targetBlank = await createStaff("FVTargetBlank");
    const targetFilled = await createStaff("FVTargetFilled");

    await prisma.staffFieldValue.create({ data: { fieldId: formFieldId, staffProfileId: source.staffId, value: "SourceAnswer" } });
    await prisma.staffFieldValue.create({ data: { fieldId: formFieldId, staffProfileId: targetFilled.staffId, value: "TargetAnswer" } });

    const owner = await prisma.user.findFirstOrThrow({ where: { organizationId, role: "OWNER" } });
    const result = await prisma.$transaction((tx) =>
      mergeStaffProfilesInTx(tx, { sourceId: source.staffId, targetId: targetFilled.staffId, actorId: owner.id })
    );
    expect(result.fieldValuesDropped).toBe(1);
    const survivingValue = await prisma.staffFieldValue.findFirstOrThrow({ where: { staffProfileId: targetFilled.staffId, fieldId: formFieldId } });
    expect(survivingValue.value).toBe("TargetAnswer");

    // Fresh source for the backfill case.
    const source2 = await createStaff("FVSource2");
    await prisma.staffFieldValue.create({ data: { fieldId: formFieldId, staffProfileId: source2.staffId, value: "SourceAnswer2" } });
    await prisma.staffFieldValue.create({ data: { fieldId: formFieldId, staffProfileId: targetBlank.staffId, value: "" } });
    const result2 = await prisma.$transaction((tx) =>
      mergeStaffProfilesInTx(tx, { sourceId: source2.staffId, targetId: targetBlank.staffId, actorId: owner.id })
    );
    expect(result2.fieldValuesBackfilled).toBe(1);
    const backfilled = await prisma.staffFieldValue.findFirstOrThrow({ where: { staffProfileId: targetBlank.staffId, fieldId: formFieldId } });
    expect(backfilled.value).toBe("SourceAnswer2");
  });

  it("TeacherCamperAssignment: drops the colliding source assignment, keeps the target's", async () => {
    const source = await createStaff("CASource");
    const target = await createStaff("CATarget");
    await prisma.teacherCamperAssignment.create({ data: { staffProfileId: source.staffId, registrationId: registrationBId } });
    await prisma.teacherCamperAssignment.create({ data: { staffProfileId: target.staffId, registrationId: registrationBId } });

    const owner = await prisma.user.findFirstOrThrow({ where: { organizationId, role: "OWNER" } });
    const result = await prisma.$transaction((tx) => mergeStaffProfilesInTx(tx, { sourceId: source.staffId, targetId: target.staffId, actorId: owner.id }));
    expect(result.camperAssignmentsDropped).toBe(1);
    expect(result.camperAssignmentsMoved).toBe(0);
    const remaining = await prisma.teacherCamperAssignment.findMany({ where: { registrationId: registrationBId } });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.staffProfileId).toBe(target.staffId);
  });

  it("StaffAttendanceRecord: upgrades a target ABSENT record from a source PRESENT one on the same session", async () => {
    const source = await createStaff("AttSource");
    const target = await createStaff("AttTarget");
    await prisma.staffAttendanceRecord.create({ data: { sessionId, staffProfileId: source.staffId, status: "PRESENT", recordedById: source.staffId } });
    await prisma.staffAttendanceRecord.create({ data: { sessionId, staffProfileId: target.staffId, status: "ABSENT", recordedById: target.staffId } });

    const owner = await prisma.user.findFirstOrThrow({ where: { organizationId, role: "OWNER" } });
    const result = await prisma.$transaction((tx) => mergeStaffProfilesInTx(tx, { sourceId: source.staffId, targetId: target.staffId, actorId: owner.id }));
    expect(result.attendanceRecordsUpgraded).toBe(1);
    expect(result.attendanceRecordsDropped).toBe(1);
    const survivor = await prisma.staffAttendanceRecord.findFirstOrThrow({ where: { sessionId, staffProfileId: target.staffId } });
    expect(survivor.status).toBe("PRESENT");
  });

  it("Bed: frees the source's bed instead of transferring when the target already holds one", async () => {
    const source = await createStaff("BedSource");
    const target = await createStaff("BedTarget");
    const room2 = await prisma.room.create({ data: { hostelId, name: `Room2-${stamp}` } });
    const sourceBed = await prisma.bed.create({ data: { roomId: room2.id, label: `SBed-${stamp}`, staffProfileId: source.staffId, status: "OCCUPIED" as any } });
    await prisma.bed.create({ data: { roomId: room2.id, label: `TBed-${stamp}`, staffProfileId: target.staffId, status: "OCCUPIED" as any } });

    const owner = await prisma.user.findFirstOrThrow({ where: { organizationId, role: "OWNER" } });
    const result = await prisma.$transaction((tx) => mergeStaffProfilesInTx(tx, { sourceId: source.staffId, targetId: target.staffId, actorId: owner.id }));
    expect(result.bedFreed).toBe(true);
    expect(result.bedTransferred).toBe(false);
    const refreshedSourceBed = await prisma.bed.findUniqueOrThrow({ where: { id: sourceBed.id } });
    expect(refreshedSourceBed.staffProfileId).toBeNull();
    expect(refreshedSourceBed.status).toBe("AVAILABLE");
    await prisma.room.deleteMany({ where: { id: room2.id } });
  });

  it("qrToken: retires the source's card without overwriting the target's when both have one issued", async () => {
    const source = await createStaff("QrSource", { qrToken: `STF-${stamp}-qrsource` } as any);
    const target = await createStaff("QrTarget", { qrToken: `STF-${stamp}-qrtarget` } as any);

    const owner = await prisma.user.findFirstOrThrow({ where: { organizationId, role: "OWNER" } });
    const result = await prisma.$transaction((tx) => mergeStaffProfilesInTx(tx, { sourceId: source.staffId, targetId: target.staffId, actorId: owner.id }));
    expect(result.qrTokenAdopted).toBe(false);
    expect(result.qrTokenRetired).toBe(true);
    const refreshedTarget = await prisma.staffProfile.findUniqueOrThrow({ where: { id: target.staffId } });
    expect(refreshedTarget.qrToken).toBe(`STF-${stamp}-qrtarget`);
  });

  it("reportsTo: does not adopt a chain that would create a cycle back to the target", async () => {
    const target = await createStaff("CycleTarget");
    const source = await createStaff("CycleSource");
    // target reports (indirectly) to source, so source.reportsToId must NOT be adopted onto target.
    await prisma.staffProfile.update({ where: { id: target.staffId }, data: { reportsToId: source.staffId } });
    await prisma.staffProfile.update({ where: { id: source.staffId }, data: { reportsToId: target.staffId } });

    const owner = await prisma.user.findFirstOrThrow({ where: { organizationId, role: "OWNER" } });
    const result = await prisma.$transaction((tx) => mergeStaffProfilesInTx(tx, { sourceId: source.staffId, targetId: target.staffId, actorId: owner.id }));
    expect(result.reportsToAdopted).toBe(false);
  });

  it("AchievementAward: drops the source's award when the target already holds one for the same definition", async () => {
    const source = await createStaff("AchSource");
    const target = await createStaff("AchTarget");
    await prisma.achievementAward.create({ data: { definitionId: achievementDefId, campId, subjectKey: `S:${source.staffId}` } });
    await prisma.achievementAward.create({ data: { definitionId: achievementDefId, campId, subjectKey: `S:${target.staffId}` } });

    const owner = await prisma.user.findFirstOrThrow({ where: { organizationId, role: "OWNER" } });
    const result = await prisma.$transaction((tx) => mergeStaffProfilesInTx(tx, { sourceId: source.staffId, targetId: target.staffId, actorId: owner.id }));
    expect(result.achievementsDropped).toBe(1);
    expect(result.achievementsMoved).toBe(0);
  });

  it("promotes a PENDING target to APPROVED when the source is APPROVED, carrying approvedAt/reviewerId", async () => {
    const source = await createStaff("PromoteSource", { status: "APPROVED", approvedAt: new Date("2026-07-01"), reviewerId: "reviewer-1" });
    const target = await createStaff("PromoteTarget", { status: "PENDING" });

    const owner = await prisma.user.findFirstOrThrow({ where: { organizationId, role: "OWNER" } });
    const result = await prisma.$transaction((tx) => mergeStaffProfilesInTx(tx, { sourceId: source.staffId, targetId: target.staffId, actorId: owner.id }));
    expect(result.statusPromoted).toBe(true);
    const refreshedTarget = await prisma.staffProfile.findUniqueOrThrow({ where: { id: target.staffId } });
    expect(refreshedTarget.status).toBe("APPROVED");
    expect(refreshedTarget.reviewerId).toBe("reviewer-1");
  });

  it("leaves the losing User row fully active and unmodified after the merge", async () => {
    const source = await createStaff("LoginSource");
    const target = await createStaff("LoginTarget");
    const owner = await prisma.user.findFirstOrThrow({ where: { organizationId, role: "OWNER" } });
    await prisma.$transaction((tx) => mergeStaffProfilesInTx(tx, { sourceId: source.staffId, targetId: target.staffId, actorId: owner.id }));

    const sourceUser = await prisma.user.findUniqueOrThrow({ where: { id: source.userId } });
    expect(sourceUser.active).toBe(true);
    expect(sourceUser.deletedAt).toBeNull();
    expect(sourceUser.email).toBe(source.email);
  });
});
