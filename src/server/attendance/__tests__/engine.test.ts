import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { markAttendance, markStaffAttendance } from "../engine";

const prisma = new PrismaClient();
let orgId: string;
let actorId: string;
let sessionId: string;
let registrationId: string;
let campId: string;
let campusId: string;
let tribeId: string;
let categoryId: string;
let ruleId: string;

beforeEach(async () => {
  const stamp = `${Date.now()}-${Math.random()}`;
  const org = await prisma.organization.create({ data: { name: `Attendance Org ${stamp}` } });
  orgId = org.id;
  const actor = await prisma.user.create({ data: { email: `attendance-actor-${stamp}@test.com`, password: "x", role: "ADMIN", organizationId: org.id } });
  actorId = actor.id;
  const parent = await prisma.user.create({ data: { email: `attendance-parent-${stamp}@test.com`, password: "x", role: "PARENT", organizationId: org.id } });
  const campus = await prisma.campus.create({ data: { name: `Campus ${stamp}`, slug: `attendance-campus-${stamp}`, address: "Test", city: "Test", country: "Test", campusCode: `A${Date.now()}`, organizationId: org.id } });
  campusId = campus.id;
  const camp = await prisma.camp.create({ data: { name: `Camp ${stamp}`, slug: `attendance-camp-${stamp}`, year: 2026, startDate: new Date(2026, 0, 1), endDate: new Date(2026, 11, 31), organizationId: org.id, status: "OPEN", approvalMode: "AUTO" } });
  campId = camp.id;
  const tribe = await prisma.tribe.create({ data: { campId: camp.id, name: `Tribe ${stamp}` } });
  tribeId = tribe.id;
  const camper = await prisma.camper.create({ data: { name: "Attendance Camper", firstName: "Attendance", lastName: "Camper", dateOfBirth: new Date(2013, 1, 1), gender: "MALE", userId: parent.id, organizationId: org.id, homeCampusId: campus.id } });
  const registration = await prisma.registration.create({ data: { camperId: camper.id, campId: camp.id, campusId: campus.id, tribeId: tribe.id, status: "CHECKED_IN" } });
  registrationId = registration.id;
  const category = await prisma.scoreCategory.create({ data: { campId: camp.id, key: "attendance", name: "Attendance", defaultPoints: 10 } });
  categoryId = category.id;
  const rule = await prisma.scoreRule.create({ data: { campId: camp.id, categoryId: category.id, trigger: "SESSION", subject: "REGISTRATION", points: 10, tiers: [{ maxMinutesLate: 10, points: 10 }, { maxMinutesLate: null, points: 4 }] } });
  ruleId = rule.id;
  const startsAt = new Date();
  const scored = await prisma.scoredSession.create({ data: { campId: camp.id, name: "Morning", date: startsAt, startsAt, graceMinutes: 10, tribeId: tribe.id, scope: "TRIBE", categoryId: category.id, ruleId: rule.id, status: "ACTIVE" } });
  const session = await prisma.attendanceSession.create({ data: { campId: camp.id, tribeId: tribe.id, name: "Morning", date: startsAt, startsAt, lateAfterMinutes: 10, createdById: actor.id, scoredSessionId: scored.id } });
  sessionId = session.id;
});

afterEach(async () => {
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
});

describe("markAttendance", () => {
  it("uses one record and reverses the leaderboard award when corrected to absent", async () => {
    const first = await markAttendance({ sessionId, registrationId, status: "PRESENT", source: "QR", actorId });
    expect(first.status).toBe("PRESENT");
    expect(first.scoreEventId).toBeTruthy();

    const corrected = await markAttendance({ sessionId, registrationId, status: "ABSENT", source: "MANUAL", actorId });
    expect(corrected.status).toBe("ABSENT");
    expect(await prisma.attendanceRecord.count({ where: { sessionId, registrationId } })).toBe(1);

    const events = await prisma.scoreEvent.findMany({ where: { registrationId } });
    expect(events).toHaveLength(2);
    expect(events.reduce((sum, event) => sum + event.points, 0)).toBe(0);
    expect(events.some((event) => event.reversesEventId === first.scoreEventId)).toBe(true);
  });

  it("keeps one staff record and rolls teacher attendance into individual, tribe, and campus scopes", async () => {
    const stamp = `${Date.now()}-${Math.random()}`;
    const user = await prisma.user.create({ data: { email: `attendance-teacher-${stamp}@test.com`, password: "x", role: "TEACHER", organizationId: orgId } });
    const staff = await prisma.staffProfile.create({ data: { userId: user.id, organizationId: orgId, campId, type: "TEACHER", status: "APPROVED", firstName: "Attendance", lastName: "Teacher", phone: "0801", email: user.email, teams: [], skills: [], assignedTribeId: tribeId, preferredCampusId: campusId } });
    const startsAt = new Date();
    const scored = await prisma.scoredSession.create({ data: { campId, name: "Teacher Briefing", date: startsAt, startsAt, graceMinutes: 10, tribeId, scope: "TRIBE", categoryId, ruleId, status: "ACTIVE", subjectAudience: "TEACHER" } });
    const session = await prisma.attendanceSession.create({ data: { campId, tribeId, name: "Teacher Briefing", date: startsAt, startsAt, lateAfterMinutes: 10, createdById: actorId, scoredSessionId: scored.id, audience: "TEACHER" } });

    const first = await markStaffAttendance({ sessionId: session.id, staffProfileId: staff.id, status: "PRESENT", source: "QR", actorId });
    expect(first.scoreEventId).toBeTruthy();
    const event = await prisma.scoreEvent.findUniqueOrThrow({ where: { id: first.scoreEventId! } });
    expect(event).toMatchObject({ staffProfileId: staff.id, tribeId, campusId, points: 10 });

    await markStaffAttendance({ sessionId: session.id, staffProfileId: staff.id, status: "ABSENT", source: "MANUAL", actorId });
    expect(await prisma.staffAttendanceRecord.count({ where: { sessionId: session.id, staffProfileId: staff.id } })).toBe(1);
    const events = await prisma.scoreEvent.findMany({ where: { staffProfileId: staff.id, scoredSessionId: scored.id } });
    expect(events.reduce((sum, item) => sum + item.points, 0)).toBe(0);
  });
});
