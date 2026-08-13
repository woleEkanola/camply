import { prisma } from "../db";
import { recordScoreEvent } from "../leaderboard/record";
import { evaluateRule } from "../leaderboard/rules";
import { resolveStaffScoreScope } from "../leaderboard/staffScope";

export type AttendanceSource = "QR" | "SEARCH" | "MANUAL" | "OFFLINE";
export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

export class AttendanceError extends Error {
  constructor(public code: "NOT_FOUND" | "CONFLICT" | "FORBIDDEN", message: string) {
    super(message);
  }
}

export async function markAttendance(input: {
  sessionId: string;
  registrationId: string;
  status?: AttendanceStatus;
  source: AttendanceSource;
  actorId: string;
  occurredAt?: Date;
  notes?: string | null;
}) {
  const occurredAt = input.occurredAt ?? new Date();
  const session = await prisma.attendanceSession.findUnique({ where: { id: input.sessionId } });
  if (!session) throw new AttendanceError("NOT_FOUND", "Attendance session not found.");
  if (session.status !== "OPEN") throw new AttendanceError("CONFLICT", "This attendance session is not open.");

  const registration = await prisma.registration.findFirst({
    where: { id: input.registrationId, campId: session.campId, deletedAt: null, status: { in: ["APPROVED", "CHECKED_IN", "COMPLETED"] } },
    select: { id: true, tribeId: true, campusId: true },
  });
  if (!registration) throw new AttendanceError("NOT_FOUND", "Eligible camper registration not found in this camp.");
  if (session.tribeId && registration.tribeId !== session.tribeId) throw new AttendanceError("FORBIDDEN", "This camper is not in the session's tribe.");

  const automaticStatus: AttendanceStatus = session.startsAt && occurredAt.getTime() > session.startsAt.getTime() + session.lateAfterMinutes * 60_000 ? "LATE" : "PRESENT";
  const status = input.status ?? automaticStatus;

  const { record, previousScoreEventId } = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "AttendanceSession" WHERE "id" = ${session.id} FOR UPDATE`;
    const fresh = await tx.attendanceSession.findUnique({ where: { id: session.id }, select: { status: true } });
    if (fresh?.status !== "OPEN") throw new AttendanceError("CONFLICT", "This attendance session is no longer open.");
    const existing = await tx.attendanceRecord.findUnique({ where: { sessionId_registrationId: { sessionId: session.id, registrationId: registration.id } } });
    const nextVersion = (existing?.scoreVersion ?? 0) + 1;
    const record = await tx.attendanceRecord.upsert({
      where: { sessionId_registrationId: { sessionId: session.id, registrationId: registration.id } },
      update: { status, source: input.source, markedAt: occurredAt, recordedAt: occurredAt, recordedById: input.actorId, updatedById: input.actorId, notes: input.notes, scoreVersion: nextVersion },
      create: { sessionId: session.id, registrationId: registration.id, status, source: input.source, markedAt: occurredAt, recordedAt: occurredAt, recordedById: input.actorId, updatedById: input.actorId, notes: input.notes, scoreVersion: nextVersion },
    });
    return { record, previousScoreEventId: existing?.scoreEventId ?? null };
  });

  let scoreEventId: string | null = null;
  if (session.scoredSessionId) {
    const scoredSession = await prisma.scoredSession.findUnique({ where: { id: session.scoredSessionId } });
    const rule = scoredSession?.ruleId ? await prisma.scoreRule.findUnique({ where: { id: scoredSession.ruleId } }) : null;
    if (scoredSession && rule?.enabled) {
      if (previousScoreEventId) {
        const previous = await prisma.scoreEvent.findUnique({ where: { id: previousScoreEventId } });
        if (previous) await recordScoreEvent({
          campId: session.campId, campusId: registration.campusId, tribeId: registration.tribeId, registrationId: registration.id,
          categoryId: previous.categoryId, points: -previous.points, source: "SYSTEM", occurredAt,
          createdById: input.actorId, reversesEventId: previous.id,
          idempotencyKey: `attendance:${session.id}:${registration.id}:reverse:v${record.scoreVersion}`,
          reason: `Attendance corrected to ${status}`,
        });
      }
      if (status !== "ABSENT" && status !== "EXCUSED") {
        const minutesLate = status === "LATE"
          ? Math.max(session.lateAfterMinutes + 1, session.startsAt ? (occurredAt.getTime() - session.startsAt.getTime()) / 60_000 : 1)
          : 0;
        const event = await recordScoreEvent({
          campId: session.campId, campusId: registration.campusId, tribeId: registration.tribeId, registrationId: registration.id,
          categoryId: scoredSession.categoryId, ruleId: rule.id, scoredSessionId: scoredSession.id,
          points: evaluateRule(rule, { minutesLate }), source: input.source === "MANUAL" ? "MANUAL" : "AUTO", occurredAt,
          createdById: input.actorId, idempotencyKey: `attendance:${session.id}:${registration.id}:v${record.scoreVersion}`,
          reason: `${status} via ${input.source}`,
        });
        scoreEventId = event?.id ?? null;
      }
      await prisma.attendanceRecord.update({ where: { id: record.id }, data: { scoreEventId } });
    }
  }

  return { ...record, scoreEventId, status };
}

export async function markStaffAttendance(input: {
  sessionId: string;
  staffProfileId: string;
  status?: AttendanceStatus;
  source: AttendanceSource;
  actorId: string;
  occurredAt?: Date;
  notes?: string | null;
}) {
  const occurredAt = input.occurredAt ?? new Date();
  const session = await prisma.attendanceSession.findUnique({ where: { id: input.sessionId } });
  if (!session) throw new AttendanceError("NOT_FOUND", "Attendance session not found.");
  if (session.status !== "OPEN") throw new AttendanceError("CONFLICT", "This attendance session is not open.");
  if (session.audience === "CAMPER") throw new AttendanceError("FORBIDDEN", "This is a camper attendance session.");

  const scope = await resolveStaffScoreScope(prisma, input.staffProfileId);
  if (!scope || scope.campId !== session.campId) throw new AttendanceError("NOT_FOUND", "Eligible staff member not found in this camp.");
  const staff = await prisma.staffProfile.findFirst({ where: { id: input.staffProfileId, status: "APPROVED", deletedAt: null }, select: { type: true } });
  if (!staff) throw new AttendanceError("NOT_FOUND", "Eligible staff member not found in this camp.");
  if (session.audience !== "ALL_STAFF" && session.audience !== staff.type) throw new AttendanceError("FORBIDDEN", `This session is for ${session.audience.toLowerCase()} staff.`);
  if (session.tribeId && scope.tribeId !== session.tribeId) throw new AttendanceError("FORBIDDEN", "This staff member is not in the session's tribe.");
  if (session.campusId && scope.campusId !== session.campusId) throw new AttendanceError("FORBIDDEN", "This staff member is not in the session's campus.");

  const automaticStatus: AttendanceStatus = session.startsAt && occurredAt.getTime() > session.startsAt.getTime() + session.lateAfterMinutes * 60_000 ? "LATE" : "PRESENT";
  const status = input.status ?? automaticStatus;
  const { record, previousScoreEventId } = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "AttendanceSession" WHERE "id" = ${session.id} FOR UPDATE`;
    const fresh = await tx.attendanceSession.findUnique({ where: { id: session.id }, select: { status: true } });
    if (fresh?.status !== "OPEN") throw new AttendanceError("CONFLICT", "This attendance session is no longer open.");
    const existing = await tx.staffAttendanceRecord.findUnique({ where: { sessionId_staffProfileId: { sessionId: session.id, staffProfileId: input.staffProfileId } } });
    const nextVersion = (existing?.scoreVersion ?? 0) + 1;
    const record = await tx.staffAttendanceRecord.upsert({
      where: { sessionId_staffProfileId: { sessionId: session.id, staffProfileId: input.staffProfileId } },
      update: { status, source: input.source, markedAt: occurredAt, recordedAt: occurredAt, recordedById: input.actorId, updatedById: input.actorId, notes: input.notes, scoreVersion: nextVersion },
      create: { sessionId: session.id, staffProfileId: input.staffProfileId, status, source: input.source, markedAt: occurredAt, recordedAt: occurredAt, recordedById: input.actorId, updatedById: input.actorId, notes: input.notes, scoreVersion: nextVersion },
    });
    return { record, previousScoreEventId: existing?.scoreEventId ?? null };
  });

  let scoreEventId: string | null = null;
  if (session.scoredSessionId) {
    const scoredSession = await prisma.scoredSession.findUnique({ where: { id: session.scoredSessionId } });
    const rule = scoredSession?.ruleId ? await prisma.scoreRule.findUnique({ where: { id: scoredSession.ruleId } }) : null;
    if (scoredSession && rule?.enabled) {
      if (previousScoreEventId) {
        const previous = await prisma.scoreEvent.findUnique({ where: { id: previousScoreEventId } });
        if (previous) await recordScoreEvent({ campId: session.campId, campusId: scope.campusId, tribeId: scope.tribeId, staffProfileId: scope.staffProfileId, categoryId: previous.categoryId, ruleId: rule.id, scoredSessionId: scoredSession.id, points: -previous.points, source: "SYSTEM", occurredAt, createdById: input.actorId, reversesEventId: previous.id, idempotencyKey: `staff-attendance:${session.id}:${scope.staffProfileId}:reverse:v${record.scoreVersion}`, reason: `Attendance corrected to ${status}` });
      }
      if (status !== "ABSENT" && status !== "EXCUSED") {
        const minutesLate = status === "LATE" ? Math.max(session.lateAfterMinutes + 1, session.startsAt ? (occurredAt.getTime() - session.startsAt.getTime()) / 60_000 : 1) : 0;
        const event = await recordScoreEvent({ campId: session.campId, campusId: scope.campusId, tribeId: scope.tribeId, staffProfileId: scope.staffProfileId, categoryId: scoredSession.categoryId, ruleId: rule.id, scoredSessionId: scoredSession.id, points: evaluateRule(rule, { minutesLate }), source: input.source === "MANUAL" ? "MANUAL" : "AUTO", occurredAt, createdById: input.actorId, idempotencyKey: `staff-attendance:${session.id}:${scope.staffProfileId}:v${record.scoreVersion}`, reason: `${status} via ${input.source}` });
        scoreEventId = event?.id ?? null;
      }
      await prisma.staffAttendanceRecord.update({ where: { id: record.id }, data: { scoreEventId } });
    }
  }
  return { ...record, scoreEventId, status };
}
