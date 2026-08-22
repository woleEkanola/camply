import type { Prisma } from "@prisma/client";
import { syncStaffProfileFromPositions } from "../utils/hierarchySync";
import { logEvent } from "../audit";

type TxClient = Prisma.TransactionClient;

export class StaffMergeError extends Error {
  code: string;
  constructor(message: string, code = "BAD_REQUEST") {
    super(message);
    this.name = "StaffMergeError";
    this.code = code;
  }
}

export interface MergeStaffProfilesResult {
  sourceId: string;
  targetId: string;

  qrTokenAdopted: boolean;
  qrTokenRetired: boolean;

  fieldValuesMoved: number;
  fieldValuesBackfilled: number;
  fieldValuesDropped: number;

  camperAssignmentsMoved: number;
  camperAssignmentsDropped: number;

  attendanceRecordsMoved: number;
  attendanceRecordsUpgraded: number;
  attendanceRecordsDropped: number;

  mealDistributionsMoved: number;
  mealDistributionsDropped: number;

  bedTransferred: boolean;
  bedFreed: boolean;

  positionAssignmentsMoved: number;
  positionAssignmentsDemoted: number;

  scanEventsMoved: number;

  checklistItemsMoved: number;
  checklistExecutionsMoved: number;

  tribeHeadshipsMoved: number;
  tribeHeadshipsCleared: number;

  directReportsMoved: number;
  reportsToAdopted: boolean;

  scoreEventsMoved: number;
  pointsMoved: number;

  achievementsMoved: number;
  achievementsDropped: number;

  statusPromoted: boolean;
}

function displayName(p: { firstName: string; lastName: string }) {
  return `${p.firstName} ${p.lastName}`;
}

/** Direct raw upsert of just the TOTAL (day IS NULL) LeaderboardStat row. Deliberately not `applyStatDelta` (src/server/leaderboard/aggregate.ts) — that also bumps a specific day's bucket, and a merge's point transfer has no single real-world day it happened on. Day-level correctness is restored by the post-commit `rebuildLeaderboard` call in the tRPC mutation, outside this transaction. */
async function bumpLeaderboardTotalOnly(tx: TxClient, campId: string, staffProfileId: string, pointsDelta: number): Promise<void> {
  if (pointsDelta === 0) return;
  await tx.$executeRaw`
    INSERT INTO "LeaderboardStat" ("id", "campId", "subjectType", "subjectId", "day", "totalPoints", "computedAt")
    VALUES (gen_random_uuid()::text, ${campId}, 'STAFF', ${staffProfileId}, NULL, ${pointsDelta}, now())
    ON CONFLICT ("campId", "subjectType", "subjectId") WHERE "day" IS NULL
    DO UPDATE SET "totalPoints" = "LeaderboardStat"."totalPoints" + ${pointsDelta}, "computedAt" = now()
  `;
}

/**
 * Absorbs `sourceId` into `targetId`: reassigns every relation a duplicate
 * StaffProfile can accumulate (attendance, meals, beds, position seats,
 * checklist assignments, tribe headships, points, badges…), resolving
 * collisions in favor of whichever record best preserves what actually
 * happened on the ground, then soft-deletes the source. Mirrors the
 * `mergeXInTx` pattern established by `src/server/departments/merge.ts` and
 * `src/server/positions/merge.ts` — one counter per relation moved is the
 * data-loss audit surface callers (and tests) rely on.
 *
 * Deliberately NOT moved: `EmailRecipient`/`Notification`/`EmailAuditLog`/
 * `WebPushLog` (all keyed on `userId`, i.e. the login account, not this
 * profile — per product decision the losing login account stays fully
 * active, not deactivated) and `AuditLog.subjectId` (history must keep
 * pointing at the entity the event happened to).
 */
export async function mergeStaffProfilesInTx(
  tx: TxClient,
  input: { sourceId: string; targetId: string; actorId: string | null; allowCrossType?: boolean }
): Promise<MergeStaffProfilesResult> {
  if (input.sourceId === input.targetId) {
    throw new StaffMergeError("A profile cannot be merged into itself.");
  }

  const [source, target] = await Promise.all([
    tx.staffProfile.findUnique({ where: { id: input.sourceId } }),
    tx.staffProfile.findUnique({ where: { id: input.targetId } }),
  ]);
  if (!source || source.deletedAt) throw new StaffMergeError("Source profile not found.", "NOT_FOUND");
  if (!target || target.deletedAt) throw new StaffMergeError("Target profile not found.", "NOT_FOUND");

  // Hard, never relaxable: points, the leaderboard, and badges are all
  // camp-scoped, so a cross-camp merge would corrupt two leaderboards.
  if (source.campId !== target.campId || source.organizationId !== target.organizationId) {
    throw new StaffMergeError("Both profiles must belong to the same camp.");
  }
  if (source.type !== target.type && !input.allowCrossType) {
    throw new StaffMergeError("Both profiles must be the same type (teacher/volunteer) unless a cross-type merge is explicitly allowed.");
  }

  const commandantSeat = await tx.positionAssignment.findFirst({
    where: { staffId: source.id, isCurrent: true, position: { leadershipRole: "COMMANDANT", deletedAt: null } },
  });
  if (commandantSeat) {
    throw new StaffMergeError("The sitting Camp Commandant cannot be merged away — replace them from the organogram first.", "FORBIDDEN");
  }

  // ── qrToken (StaffProfile_qrToken_key is a NON-partial unique index — a
  // soft-deleted source keeps its claim on a value forever, so it must be
  // nulled before the target can ever take it). ──────────────────────────
  let qrTokenAdopted = false;
  let qrTokenRetired = false;
  if (source.qrToken) {
    const sourceToken = source.qrToken;
    const sourceIssuedAt = source.qrIssuedAt;
    await tx.staffProfile.update({ where: { id: source.id }, data: { qrToken: null, qrIssuedAt: null } });
    if (!target.qrToken) {
      await tx.staffProfile.update({ where: { id: target.id }, data: { qrToken: sourceToken, qrIssuedAt: sourceIssuedAt } });
      qrTokenAdopted = true;
    } else {
      // Both sides had issued a physical card — the source's is retired.
      // The caller (mergeProfiles mutation) enforces the admin acknowledged
      // this before the merge runs at all.
      qrTokenRetired = true;
    }
  }

  // ── StaffFieldValue (@@unique([fieldId, staffProfileId])) ──────────────
  const [sourceFieldValues, targetFieldValues] = await Promise.all([
    tx.staffFieldValue.findMany({ where: { staffProfileId: source.id } }),
    tx.staffFieldValue.findMany({ where: { staffProfileId: target.id } }),
  ]);
  const targetFieldByFieldId = new Map(targetFieldValues.map((v) => [v.fieldId, v]));
  let fieldValuesMoved = 0;
  let fieldValuesBackfilled = 0;
  let fieldValuesDropped = 0;
  for (const sv of sourceFieldValues) {
    const targetRow = targetFieldByFieldId.get(sv.fieldId);
    if (!targetRow) {
      await tx.staffFieldValue.update({ where: { id: sv.id }, data: { staffProfileId: target.id } });
      fieldValuesMoved += 1;
    } else if (!targetRow.value.trim()) {
      await tx.staffFieldValue.update({ where: { id: targetRow.id }, data: { value: sv.value } });
      await tx.staffFieldValue.delete({ where: { id: sv.id } });
      fieldValuesBackfilled += 1;
    } else {
      await tx.staffFieldValue.delete({ where: { id: sv.id } });
      fieldValuesDropped += 1;
    }
  }

  // ── TeacherCamperAssignment (@@unique([staffProfileId, registrationId])) ─
  const targetCamperAssignments = await tx.teacherCamperAssignment.findMany({ where: { staffProfileId: target.id }, select: { registrationId: true } });
  const targetRegistrationIds = new Set(targetCamperAssignments.map((a) => a.registrationId));
  const sourceCamperAssignments = await tx.teacherCamperAssignment.findMany({ where: { staffProfileId: source.id } });
  const collidingCamperAssignmentIds = sourceCamperAssignments.filter((a) => targetRegistrationIds.has(a.registrationId)).map((a) => a.id);
  const camperAssignmentsDropped = collidingCamperAssignmentIds.length
    ? (await tx.teacherCamperAssignment.deleteMany({ where: { id: { in: collidingCamperAssignmentIds } } })).count
    : 0;
  const camperAssignmentsMoved = (
    await tx.teacherCamperAssignment.updateMany({ where: { staffProfileId: source.id }, data: { staffProfileId: target.id } })
  ).count;

  // ── StaffAttendanceRecord (@@unique([sessionId, staffProfileId])) ──────
  // Fetched unfiltered by deletedAt — the unique constraint is on
  // (sessionId, staffProfileId) regardless of soft-delete state, so a
  // deleted row still occupies that slot and must still be resolved here or
  // the bulk move below would hit a P2002. deletedAt is only used below to
  // skip folding a deleted row's status into the surviving record.
  const targetAttendance = await tx.staffAttendanceRecord.findMany({ where: { staffProfileId: target.id } });
  const targetAttendanceBySession = new Map(targetAttendance.map((r) => [r.sessionId, r]));
  const sourceAttendance = await tx.staffAttendanceRecord.findMany({ where: { staffProfileId: source.id } });
  let attendanceRecordsUpgraded = 0;
  let attendanceRecordsDropped = 0;
  for (const sr of sourceAttendance) {
    const tr = targetAttendanceBySession.get(sr.sessionId);
    if (!tr) continue; // handled by the bulk move below
    if (!tr.deletedAt && !sr.deletedAt && tr.status === "ABSENT" && sr.status !== "ABSENT") {
      await tx.staffAttendanceRecord.update({ where: { id: tr.id }, data: { status: sr.status, source: sr.source, notes: sr.notes ?? tr.notes } });
      attendanceRecordsUpgraded += 1;
    }
    await tx.staffAttendanceRecord.delete({ where: { id: sr.id } });
    attendanceRecordsDropped += 1;
  }
  const attendanceRecordsMoved = (
    await tx.staffAttendanceRecord.updateMany({ where: { staffProfileId: source.id }, data: { staffProfileId: target.id } })
  ).count;

  // ── StaffMealDistribution (@@unique([staffProfileId, meal, date])) ─────
  const targetMeals = await tx.staffMealDistribution.findMany({ where: { staffProfileId: target.id }, select: { meal: true, date: true } });
  const targetMealKeys = new Set(targetMeals.map((m) => `${m.meal}:${m.date.toISOString()}`));
  const sourceMeals = await tx.staffMealDistribution.findMany({ where: { staffProfileId: source.id } });
  const collidingMealIds = sourceMeals.filter((m) => targetMealKeys.has(`${m.meal}:${m.date.toISOString()}`)).map((m) => m.id);
  const mealDistributionsDropped = collidingMealIds.length
    ? (await tx.staffMealDistribution.deleteMany({ where: { id: { in: collidingMealIds } } })).count
    : 0;
  const mealDistributionsMoved = (
    await tx.staffMealDistribution.updateMany({ where: { staffProfileId: source.id }, data: { staffProfileId: target.id } })
  ).count;

  // ── Bed (staffProfileId is @unique and non-partial) ─────────────────────
  let bedTransferred = false;
  let bedFreed = false;
  const sourceBed = await tx.bed.findUnique({ where: { staffProfileId: source.id } });
  if (sourceBed) {
    const targetHasBed = await tx.bed.findUnique({ where: { staffProfileId: target.id } });
    if (!targetHasBed) {
      await tx.bed.update({ where: { id: sourceBed.id }, data: { staffProfileId: target.id } });
      bedTransferred = true;
    } else {
      await tx.bed.update({ where: { id: sourceBed.id }, data: { staffProfileId: null, status: "AVAILABLE" } });
      bedFreed = true;
    }
  }

  // ── PositionAssignment (column is staffId, not staffProfileId) ─────────
  const positionAssignmentsMoved = (
    await tx.positionAssignment.updateMany({ where: { staffId: source.id }, data: { staffId: target.id } })
  ).count;
  let positionAssignmentsDemoted = 0;
  if (positionAssignmentsMoved > 0) {
    const currentTargetAssignments = await tx.positionAssignment.findMany({
      where: { staffId: target.id, isCurrent: true },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
    });
    const byPosition = new Map<string, typeof currentTargetAssignments>();
    for (const a of currentTargetAssignments) {
      const arr = byPosition.get(a.positionId) ?? [];
      arr.push(a);
      byPosition.set(a.positionId, arr);
    }
    for (const [, assignments] of byPosition) {
      if (assignments.length <= 1) continue;
      const [, ...extras] = assignments;
      for (const extra of extras) {
        await tx.positionAssignment.update({
          where: { id: extra.id },
          data: { isCurrent: false, endDate: new Date(), reason: "Ended by staff profile merge — the surviving profile already held this seat." },
        });
        positionAssignmentsDemoted += 1;
      }
    }
  }

  // ── StaffScanEvent — plain move ─────────────────────────────────────────
  const scanEventsMoved = (await tx.staffScanEvent.updateMany({ where: { staffProfileId: source.id }, data: { staffProfileId: target.id } })).count;

  // ── DepartmentChecklistItem / Execution — move + rewrite the execution's
  // denormalized name snapshot so it stops showing the absorbed spelling. ─
  const checklistItemsMoved = (
    await tx.departmentChecklistItem.updateMany({ where: { assignedStaffId: source.id }, data: { assignedStaffId: target.id } })
  ).count;
  const checklistExecutionsMoved = (
    await tx.departmentChecklistExecution.updateMany({
      where: { assignedStaffId: source.id },
      data: { assignedStaffId: target.id, assignedNameSnapshot: displayName(target) },
    })
  ).count;

  // ── Tribe.maleHeadId / femaleHeadId — two FKs on one table ──────────────
  const tribeHeadshipsMoved = (
    await tx.tribe.updateMany({ where: { maleHeadId: source.id }, data: { maleHeadId: target.id } })
  ).count + (await tx.tribe.updateMany({ where: { femaleHeadId: source.id }, data: { femaleHeadId: target.id } })).count;
  // If the target now heads both sides of the same tribe, clear the
  // female slot (arbitrary but deterministic tiebreak) rather than leave a
  // structurally odd "one person is both heads" state.
  const bothHeadTribes = await tx.tribe.findMany({ where: { maleHeadId: target.id, femaleHeadId: target.id } });
  let tribeHeadshipsCleared = 0;
  if (bothHeadTribes.length) {
    tribeHeadshipsCleared = (
      await tx.tribe.updateMany({ where: { id: { in: bothHeadTribes.map((t) => t.id) } }, data: { femaleHeadId: null } })
    ).count;
  }

  // ── reportsToId self-relation ───────────────────────────────────────────
  // syncStaffProfileFromPositions OVERWRITES reportsToId/reportsToUserId
  // from live PositionAssignment data (nulling both if none exist) — must
  // run first, or any manual re-pointing below gets silently discarded.
  await syncStaffProfileFromPositions(tx, target.id);

  const directReportsMoved = (
    await tx.staffProfile.updateMany({ where: { reportsToId: source.id, id: { not: target.id } }, data: { reportsToId: target.id } })
  ).count;

  let reportsToAdopted = false;
  const targetAfterSync = await tx.staffProfile.findUniqueOrThrow({ where: { id: target.id }, select: { reportsToId: true, reportsToUserId: true } });
  if (source.reportsToId && !targetAfterSync.reportsToId && !targetAfterSync.reportsToUserId) {
    // Walk the chain from source.reportsToId to make sure adopting it onto
    // target can't create a cycle (target ends up reporting, transitively,
    // to itself) — capped so a pre-existing bad chain can't hang the merge.
    let cursor: string | null = source.reportsToId;
    let cycle = false;
    for (let hop = 0; cursor && hop < 25; hop += 1) {
      if (cursor === target.id) {
        cycle = true;
        break;
      }
      const next: { reportsToId: string | null } | null = await tx.staffProfile.findUnique({ where: { id: cursor }, select: { reportsToId: true } });
      cursor = next?.reportsToId ?? null;
    }
    if (!cycle) {
      await tx.staffProfile.update({ where: { id: target.id }, data: { reportsToId: source.reportsToId } });
      reportsToAdopted = true;
    }
  }
  await tx.staffProfile.update({ where: { id: source.id }, data: { reportsToId: null, reportsToUserId: null } });

  // ── ScoreEvent.staffProfileId — no FK, no cascade, must be rewritten
  // explicitly or the points are silently orphaned. Snapshot the source's
  // current TOTAL before touching anything, for the LeaderboardStat step
  // below (its own rows get deleted, not rewritten). ─────────────────────
  const sourceTotalStat = await tx.leaderboardStat.findFirst({
    where: { campId: source.campId, subjectType: "STAFF", subjectId: source.id, day: null },
    select: { totalPoints: true },
  });
  const pointsMoved = sourceTotalStat?.totalPoints ?? 0;
  const scoreEventsMoved = (
    await tx.scoreEvent.updateMany({ where: { staffProfileId: source.id }, data: { staffProfileId: target.id } })
  ).count;

  // ── LeaderboardStat — delete source's rows (a rebuildable cache; rewriting
  // in place would collide with its own partial unique indexes), then patch
  // the target's TOTAL immediately so the UI is right without waiting for
  // the post-commit rebuild. ──────────────────────────────────────────────
  await tx.leaderboardStat.deleteMany({ where: { campId: source.campId, subjectType: "STAFF", subjectId: source.id } });
  await bumpLeaderboardTotalOnly(tx, source.campId, target.id, pointsMoved);

  // ── AchievementAward.subjectKey (format "S:<id>", @@unique([definitionId, subjectKey])) ─
  const sourceKey = `S:${source.id}`;
  const targetKey = `S:${target.id}`;
  const sourceAwards = await tx.achievementAward.findMany({ where: { subjectKey: sourceKey } });
  const targetAwardDefinitionIds = new Set(
    (await tx.achievementAward.findMany({ where: { subjectKey: targetKey }, select: { definitionId: true } })).map((a) => a.definitionId)
  );
  let achievementsMoved = 0;
  let achievementsDropped = 0;
  for (const award of sourceAwards) {
    if (targetAwardDefinitionIds.has(award.definitionId)) {
      await tx.achievementAward.delete({ where: { id: award.id } });
      achievementsDropped += 1;
    } else {
      await tx.achievementAward.update({ where: { id: award.id }, data: { subjectKey: targetKey } });
      achievementsMoved += 1;
    }
  }

  // AuditLog.subjectId is deliberately NOT rewritten — history keeps
  // pointing at the entity the event happened to.

  // ── Scalar reconciliation — fill-the-gap only, never overwrite ─────────
  const scalarFields: (keyof typeof source)[] = [
    "phone",
    "photoUrl",
    "dateOfBirth",
    "church",
    "churchDepartment",
    "yearsServing",
    "workerStatus",
    "previousCampExperience",
    "areasOfStrength",
    "preferredAgeGroup",
    "preferredCampusId",
    "preferredTribeId",
    "volunteerCategory",
    "availability",
    "emergencyContactName",
    "emergencyContactPhone",
    "emergencyContactRelationship",
    "medicalConditions",
    "allergies",
    "preferredName",
    "gender",
  ];
  const scalarUpdate: Record<string, unknown> = {};
  for (const field of scalarFields) {
    const targetValue = target[field];
    const sourceValue = source[field];
    const targetBlank = targetValue === null || targetValue === undefined || (typeof targetValue === "string" && !targetValue.trim());
    const sourceHasValue = sourceValue !== null && sourceValue !== undefined && !(typeof sourceValue === "string" && !sourceValue.trim());
    if (targetBlank && sourceHasValue) scalarUpdate[field] = sourceValue;
  }
  const skillsUnion = Array.from(new Set([...(target.skills ?? []), ...(source.skills ?? [])]));
  if (skillsUnion.length !== (target.skills ?? []).length) scalarUpdate.skills = skillsUnion;
  const teamsUnion = Array.from(new Set([...(target.teams ?? []), ...(source.teams ?? [])]));
  if (teamsUnion.length !== (target.teams ?? []).length) scalarUpdate.teams = teamsUnion;

  // Promote status: merging an already-APPROVED, working teacher into their
  // still-PENDING twin must not silently un-approve someone already on the
  // ground with an issued badge.
  let statusPromoted = false;
  if (target.status === "PENDING" && source.status === "APPROVED") {
    scalarUpdate.status = "APPROVED";
    scalarUpdate.approvedAt = source.approvedAt;
    scalarUpdate.reviewerId = source.reviewerId;
    statusPromoted = true;
  }

  if (Object.keys(scalarUpdate).length > 0) {
    await tx.staffProfile.update({ where: { id: target.id }, data: scalarUpdate });
  }

  // ── Soft-delete the source last ─────────────────────────────────────────
  await tx.staffProfile.update({ where: { id: source.id }, data: { deletedAt: new Date() } });

  await logEvent(tx, {
    organizationId: source.organizationId,
    actorId: input.actorId,
    action: "STAFF_PROFILES_MERGED",
    subjectType: "STAFF_PROFILE",
    subjectId: target.id,
    previousValue: { sourceId: source.id, sourceEmail: source.email, sourceUserId: source.userId },
    newValue: { targetId: target.id, targetEmail: target.email, pointsMoved, statusPromoted },
  });

  return {
    sourceId: source.id,
    targetId: target.id,
    qrTokenAdopted,
    qrTokenRetired,
    fieldValuesMoved,
    fieldValuesBackfilled,
    fieldValuesDropped,
    camperAssignmentsMoved,
    camperAssignmentsDropped,
    attendanceRecordsMoved,
    attendanceRecordsUpgraded,
    attendanceRecordsDropped,
    mealDistributionsMoved,
    mealDistributionsDropped,
    bedTransferred,
    bedFreed,
    positionAssignmentsMoved,
    positionAssignmentsDemoted,
    scanEventsMoved,
    checklistItemsMoved,
    checklistExecutionsMoved,
    tribeHeadshipsMoved,
    tribeHeadshipsCleared,
    directReportsMoved,
    reportsToAdopted,
    scoreEventsMoved,
    pointsMoved,
    achievementsMoved,
    achievementsDropped,
    statusPromoted,
  };
}
