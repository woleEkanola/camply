import { prisma } from "../db";
import { recordScoreEvent } from "../leaderboard/record";
import { evaluateRule } from "../leaderboard/rules";
import { resolveStaffScoreScope } from "../leaderboard/staffScope";
import { voidScoreEvent, VoidError } from "../leaderboard/void";

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
  autoAbsent?: boolean;
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
  if (session.campusId && registration.campusId !== session.campusId) throw new AttendanceError("FORBIDDEN", "This camper is not in the session's campus.");

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
      // deletedAt/deletedById/deleteReason are cleared on every (re-)mark —
      // marking a person is always an explicit un-delete, and this is what
      // lets a deleted-then-re-marked record revive with its scoreVersion
      // intact instead of colliding on idempotencyKey (see deleteAttendanceRecord).
      update: { status, source: input.source, markedAt: occurredAt, recordedAt: occurredAt, recordedById: input.actorId, updatedById: input.actorId, notes: input.notes, scoreVersion: nextVersion, deletedAt: null, deletedById: null, deleteReason: null, autoAbsent: input.autoAbsent ?? false },
      create: { sessionId: session.id, registrationId: registration.id, status, source: input.source, markedAt: occurredAt, recordedAt: occurredAt, recordedById: input.actorId, updatedById: input.actorId, notes: input.notes, scoreVersion: nextVersion, autoAbsent: input.autoAbsent ?? false },
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
  autoAbsent?: boolean;
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
      update: { status, source: input.source, markedAt: occurredAt, recordedAt: occurredAt, recordedById: input.actorId, updatedById: input.actorId, notes: input.notes, scoreVersion: nextVersion, deletedAt: null, deletedById: null, deleteReason: null, autoAbsent: input.autoAbsent ?? false },
      create: { sessionId: session.id, staffProfileId: input.staffProfileId, status, source: input.source, markedAt: occurredAt, recordedAt: occurredAt, recordedById: input.actorId, updatedById: input.actorId, notes: input.notes, scoreVersion: nextVersion, autoAbsent: input.autoAbsent ?? false },
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
        if (previous) await recordScoreEvent({ campId: session.campId, campusId: scope.campusId, tribeId: scope.tribeId, staffProfileId: scope.staffProfileId, categoryId: previous.categoryId, scoredSessionId: scoredSession.id, points: -previous.points, source: "SYSTEM", occurredAt, createdById: input.actorId, reversesEventId: previous.id, idempotencyKey: `staff-attendance:${session.id}:${scope.staffProfileId}:reverse:v${record.scoreVersion}`, reason: `Attendance corrected to ${status}` });
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

/**
 * Soft-deletes a single camper attendance record and voids the points it
 * generated (if any). The row is kept, not hard-deleted — markAttendance
 * derives scoreVersion/idempotencyKey from the existing row, so a hard
 * delete would let a later re-mark restart at v1, collide with the old
 * idempotencyKey, and recordScoreEvent would silently no-op (no points, no
 * error). Works on records belonging to a CLOSED session — that's the point
 * of this action; deleting a record does not require reopening the session.
 */
export async function deleteAttendanceRecord(input: { recordId: string; actorId: string; reason: string }) {
  const record = await prisma.attendanceRecord.findUnique({ where: { id: input.recordId } });
  if (!record) throw new AttendanceError("NOT_FOUND", "Attendance record not found.");
  if (record.deletedAt) throw new AttendanceError("CONFLICT", "This record was already deleted.");

  if (record.scoreEventId) {
    try {
      await voidScoreEvent({ eventId: record.scoreEventId, actorId: input.actorId, reason: input.reason });
    } catch (err) {
      if (!(err instanceof VoidError && err.code === "CONFLICT")) throw err;
    }
  }

  return prisma.attendanceRecord.update({
    where: { id: record.id },
    data: { deletedAt: new Date(), deletedById: input.actorId, deleteReason: input.reason },
  });
}

/** Staff equivalent of deleteAttendanceRecord — see its comment for why this is a soft delete. */
export async function deleteStaffAttendanceRecord(input: { recordId: string; actorId: string; reason: string }) {
  const record = await prisma.staffAttendanceRecord.findUnique({ where: { id: input.recordId } });
  if (!record) throw new AttendanceError("NOT_FOUND", "Attendance record not found.");
  if (record.deletedAt) throw new AttendanceError("CONFLICT", "This record was already deleted.");

  if (record.scoreEventId) {
    try {
      await voidScoreEvent({ eventId: record.scoreEventId, actorId: input.actorId, reason: input.reason });
    } catch (err) {
      if (!(err instanceof VoidError && err.code === "CONFLICT")) throw err;
    }
  }

  return prisma.staffAttendanceRecord.update({
    where: { id: record.id },
    data: { deletedAt: new Date(), deletedById: input.actorId, deleteReason: input.reason },
  });
}

/**
 * CLOSED -> OPEN. Today a closed session is permanently frozen (markAttendance
 * throws CONFLICT on anything but OPEN) with no way back — this is the fix.
 * Also flips the linked ScoredSession CLOSED -> ACTIVE so scoring resumes on
 * the next mark.
 */
export async function reopenAttendanceSession(input: { sessionId: string; actorId: string }) {
  const session = await prisma.attendanceSession.findUnique({ where: { id: input.sessionId } });
  if (!session) throw new AttendanceError("NOT_FOUND", "Attendance session not found.");
  if (session.deletedAt) throw new AttendanceError("CONFLICT", "This session has been deleted.");
  if (session.status !== "CLOSED") throw new AttendanceError("CONFLICT", "Only a closed session can be reopened.");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.attendanceSession.update({
      where: { id: session.id },
      data: { status: "OPEN", closedAt: null, closedById: null },
    });
    if (session.scoredSessionId) {
      await tx.scoredSession.update({ where: { id: session.scoredSessionId }, data: { status: "ACTIVE", endsAt: null } });
    }
    return updated;
  });
}

/**
 * Removes an entire session — every record's points are voided, every
 * record and the session itself are soft-deleted, and the linked
 * ScoredSession is cancelled. Voids happen one event at a time via
 * voidScoreEvent (each call is its own transaction through recordScoreEvent)
 * rather than one giant transaction, matching the rest of this file's
 * pattern of keeping scoring writes outside the record-mutation transaction.
 *
 * Iterates each record's own scoreEventId rather than querying ScoreEvent by
 * scoredSessionId — ScoredSession is also reused for QR point-station
 * batches (stationId prefixed "POINTS:"), so a scoredSessionId filter would
 * risk voiding unrelated station awards that happen to share the row.
 */
export async function deleteAttendanceSession(input: { sessionId: string; actorId: string; reason: string }) {
  const session = await prisma.attendanceSession.findUnique({
    where: { id: input.sessionId },
    include: { records: true, staffRecords: true },
  });
  if (!session) throw new AttendanceError("NOT_FOUND", "Attendance session not found.");
  if (session.deletedAt) throw new AttendanceError("CONFLICT", "This session was already deleted.");

  const eventIds = [
    ...session.records.filter((r) => r.scoreEventId && !r.deletedAt).map((r) => r.scoreEventId as string),
    ...session.staffRecords.filter((r) => r.scoreEventId && !r.deletedAt).map((r) => r.scoreEventId as string),
  ];
  for (const eventId of eventIds) {
    try {
      await voidScoreEvent({ eventId, actorId: input.actorId, reason: input.reason });
    } catch (err) {
      if (!(err instanceof VoidError && err.code === "CONFLICT")) throw err;
    }
  }

  await prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.attendanceRecord.updateMany({
      where: { sessionId: session.id, deletedAt: null },
      data: { deletedAt: now, deletedById: input.actorId, deleteReason: input.reason },
    });
    await tx.staffAttendanceRecord.updateMany({
      where: { sessionId: session.id, deletedAt: null },
      data: { deletedAt: now, deletedById: input.actorId, deleteReason: input.reason },
    });
    await tx.attendanceSession.update({
      where: { id: session.id },
      data: { deletedAt: now, deletedById: input.actorId, deleteReason: input.reason, status: "CANCELLED" },
    });
    if (session.scoredSessionId) {
      await tx.scoredSession.update({ where: { id: session.scoredSessionId }, data: { status: "CANCELLED" } });
    }
  });

  return { recordsDeleted: session.records.length, staffRecordsDeleted: session.staffRecords.length };
}

/**
 * Undoes closeSession's mass-ABSENT sweep, and only that sweep — targets
 * autoAbsent=true rows exclusively, never a manually-marked ABSENT. No point
 * reversal needed: markAttendance never scores ABSENT/EXCUSED, so these rows
 * never carry a scoreEventId in the first place.
 */
export async function clearAutoAbsent(input: { sessionId: string; actorId: string; reason: string }) {
  const now = new Date();
  const [records, staffRecords] = await prisma.$transaction([
    prisma.attendanceRecord.updateMany({
      where: { sessionId: input.sessionId, autoAbsent: true, deletedAt: null },
      data: { deletedAt: now, deletedById: input.actorId, deleteReason: input.reason },
    }),
    prisma.staffAttendanceRecord.updateMany({
      where: { sessionId: input.sessionId, autoAbsent: true, deletedAt: null },
      data: { deletedAt: now, deletedById: input.actorId, deleteReason: input.reason },
    }),
  ]);
  return { recordsCleared: records.count, staffRecordsCleared: staffRecords.count };
}
