import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { appRouter } from "../../root";

const prisma = new PrismaClient();
let orgId = "";
let campId = "";
let campusId = "";
let tribeId = "";
let otherTribeId = "";
let adminId = "";
let teacherId = "";
let volunteerId = "";
let campusRepId = "";
let registrationIds: string[] = [];

function callerAs(role: "ADMIN" | "TEACHER" | "VOLUNTEER" | "CAMPUS_REPRESENTATIVE", userId: string) {
  return appRouter.createCaller({
    prisma,
    session: { user: { id: userId, email: "camp-points@test.com", role, organizationId: orgId }, expires: "" },
  });
}

beforeEach(async () => {
  const stamp = `${Date.now()}-${Math.random()}`;
  const org = await prisma.organization.create({ data: { name: `Camp Points ${stamp}` } });
  orgId = org.id;
  const camp = await prisma.camp.create({ data: {
    name: `Camp Points ${stamp}`, slug: `camp-points-${stamp}`, year: 2026,
    startDate: new Date(2026, 0, 1), endDate: new Date(2026, 11, 31),
    organizationId: orgId, status: "OPEN", approvalMode: "AUTO",
  } });
  campId = camp.id;
  const campus = await prisma.campus.create({ data: {
    name: `Campus ${stamp}`, slug: `points-campus-${stamp}`, campusCode: `P${Date.now()}`,
    address: "Test", city: "Test", country: "Test", organizationId: orgId,
  } });
  campusId = campus.id;
  tribeId = (await prisma.tribe.create({ data: { campId, name: `Judah ${stamp}` } })).id;
  otherTribeId = (await prisma.tribe.create({ data: { campId, name: `Levi ${stamp}` } })).id;
  adminId = (await prisma.user.create({ data: {
    email: `points-admin-${stamp}@test.com`, password: "x", role: "ADMIN", organizationId: orgId,
  } })).id;
  const teacher = await prisma.user.create({ data: {
    email: `points-teacher-${stamp}@test.com`, password: "x", role: "TEACHER", organizationId: orgId,
  } });
  teacherId = teacher.id;
  const profile = await prisma.staffProfile.create({ data: {
    userId: teacher.id, organizationId: orgId, campId, type: "TEACHER", status: "APPROVED",
    firstName: "Tribe", lastName: "Head", phone: "+2348000000000", email: teacher.email,
    assignedTribeId: tribeId,
  } });
  const position = await prisma.position.create({ data: { name: "Tribe Head", campId, grantsAwardPoints: true } });
  await prisma.positionAssignment.create({ data: { positionId: position.id, staffId: profile.id } });
  const volunteer = await prisma.user.create({ data: {
    email: `points-volunteer-${stamp}@test.com`, password: "x", role: "VOLUNTEER", organizationId: orgId,
  } });
  volunteerId = volunteer.id;
  await prisma.staffProfile.create({ data: {
    userId: volunteer.id, organizationId: orgId, campId, type: "VOLUNTEER", status: "APPROVED",
    firstName: "Tribe", lastName: "Assistant", phone: "+2348000000001", email: volunteer.email,
    assignedTribeId: tribeId,
  } });
  const campusRep = await prisma.user.create({ data: {
    email: `points-campus-rep-${stamp}@test.com`, password: "x", role: "CAMPUS_REPRESENTATIVE", organizationId: orgId,
    managedCampuses: { connect: { id: campusId } },
  } });
  campusRepId = campusRep.id;

  registrationIds = [];
  for (let index = 0; index < 5; index++) {
    const parent = await prisma.user.create({ data: {
      email: `points-parent-${index}-${stamp}@test.com`, password: "x", role: "PARENT", organizationId: orgId,
    } });
    const camper = await prisma.camper.create({ data: {
      name: `Camper ${index}`, firstName: "Camper", lastName: `${index}`,
      dateOfBirth: new Date(2013, 0, index + 1), gender: index % 2 ? "FEMALE" : "MALE",
      userId: parent.id, organizationId: orgId, homeCampusId: campusId,
    } });
    const registration = await prisma.registration.create({ data: {
      camperId: camper.id, campId, campusId, tribeId, status: "APPROVED",
      registrationNumber: `CP-${index}-${Date.now()}`, qrToken: `CP-QR-${index}-${stamp}`,
    } });
    registrationIds.push(registration.id);
  }
});

afterEach(async () => {
  await prisma.sideEffect.deleteMany({ where: { type: { startsWith: "SCORE_" } } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
});

afterAll(async () => prisma.$disconnect());

describe("Camp Points workspace", () => {
  it("awards a selected group once and updates camper, tribe, and campus totals", async () => {
    const admin = callerAs("ADMIN", adminId);
    const categories = await admin.campPoints.categories({ campId });
    const category = categories.find((row) => row.key.toUpperCase() === "GOOD_BEHAVIOUR") ?? categories[0];
    expect(category).toBeTruthy();
    const batch = await admin.campPoints.startBatch({ campId, categoryId: category!.id, tribeId, points: 12 });

    const first = await admin.campPoints.award({ batchId: batch.id, registrationIds, entryMethod: "SELECT" });
    const duplicate = await admin.campPoints.award({ batchId: batch.id, registrationIds, entryMethod: "SELECT" });
    expect(first).toMatchObject({ awarded: 5, duplicates: 0 });
    expect(duplicate).toMatchObject({ awarded: 0, duplicates: 5 });

    const events = await prisma.scoreEvent.findMany({ where: { scoredSessionId: batch.id } });
    expect(events).toHaveLength(5);
    expect(events.every((event) => event.registrationId && event.tribeId === tribeId && event.campusId === campusId)).toBe(true);
    expect(events.reduce((sum, event) => sum + event.points, 0)).toBe(60);
    expect((await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "TRIBE", subjectId: tribeId, day: null } }))?.totalPoints).toBe(60);
    expect((await prisma.leaderboardStat.findFirst({ where: { campId, subjectType: "CAMPUS", subjectId: campusId, day: null } }))?.totalPoints).toBe(60);
    expect(await prisma.leaderboardStat.count({ where: { campId, subjectType: "CAMPER", totalPoints: 12, day: null } })).toBe(5);
  });

  it("allows a granted tribe head only inside their assigned tribe", async () => {
    const teacher = callerAs("TEACHER", teacherId);
    const categories = await teacher.campPoints.categories({ campId });
    const category = categories[0]!;
    await expect(teacher.campPoints.startBatch({ campId, categoryId: category.id, tribeId })).resolves.toMatchObject({ tribeId });
    await expect(teacher.campPoints.startBatch({ campId, categoryId: category.id, tribeId: otherTribeId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(teacher.campPoints.startBatch({ campId, categoryId: category.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("uses the uppercase global attendance template, creates its missing camp rule, and scores only present or late", async () => {
    const admin = callerAs("ADMIN", adminId);
    const startsAt = new Date();
    const session = await admin.attendance.createSession({
      organizationId: orgId, campId, tribeId, name: "Morning attendance", date: startsAt, startsAt, lateAfterMinutes: 10,
    });
    expect(session.scoredSessionId).toBeTruthy();
    const scored = await prisma.scoredSession.findUnique({ where: { id: session.scoredSessionId! } });
    const category = scored ? await prisma.scoreCategory.findUnique({ where: { id: scored.categoryId } }) : null;
    const rule = scored?.ruleId ? await prisma.scoreRule.findUnique({ where: { id: scored.ruleId } }) : null;
    expect(category?.key.toUpperCase()).toBe("ATTENDANCE");
    expect(scored?.ruleId).toBeTruthy();

    await admin.attendance.mark({ sessionId: session.id, registrationId: registrationIds[0]!, status: "PRESENT", source: "MANUAL" });
    await admin.attendance.mark({ sessionId: session.id, registrationId: registrationIds[1]!, status: "LATE", source: "MANUAL" });
    await admin.attendance.mark({ sessionId: session.id, registrationId: registrationIds[2]!, status: "ABSENT", source: "MANUAL" });
    await admin.attendance.mark({ sessionId: session.id, registrationId: registrationIds[3]!, status: "EXCUSED", source: "MANUAL" });

    const events = await prisma.scoreEvent.findMany({ where: { scoredSessionId: session.scoredSessionId! } });
    expect(events).toHaveLength(2);
    expect(events.every((event) => event.points > 0)).toBe(true);
    expect(events.reduce((sum, event) => sum + event.points, 0)).toBe((rule?.points ?? 10) + Math.max(1, Math.round((rule?.points ?? 10) / 2)));
  });

  it("enforces teacher, volunteer-session, and campus-representative attendance scopes", async () => {
    const teacher = callerAs("TEACHER", teacherId);
    const volunteer = callerAs("VOLUNTEER", volunteerId);
    const campusRep = callerAs("CAMPUS_REPRESENTATIVE", campusRepId);
    const startsAt = new Date();
    const teacherSession = await teacher.attendance.createSession({
      organizationId: orgId, campId, tribeId, name: "Teacher-only attendance", date: startsAt,
      allowVolunteerAccess: false,
    });
    await expect(volunteer.attendance.sessionDetail({ id: teacherSession.id })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const sharedSession = await callerAs("ADMIN", adminId).attendance.createSession({
      organizationId: orgId, campId, tribeId, name: "Shared attendance", date: startsAt,
      allowVolunteerAccess: true,
    });
    await expect(volunteer.attendance.mark({
      sessionId: sharedSession.id, registrationId: registrationIds[0]!, status: "PRESENT", source: "MANUAL",
    })).resolves.toMatchObject({ status: "PRESENT" });

    await expect(campusRep.attendance.createSession({
      organizationId: orgId, campId, campusId, name: "Campus attendance", date: startsAt,
    })).resolves.toMatchObject({ campusId });
    await expect(campusRep.attendance.createSession({
      organizationId: orgId, campId, tribeId, name: "Outside rep scope", date: startsAt,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
