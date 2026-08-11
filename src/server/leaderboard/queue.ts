import { prisma } from "../db";
import { evaluateRule } from "./rules";
import { recordScoreEvent } from "./record";
import { campDayKey } from "./dayKey";

const SCORE_TYPE_PREFIX = "SCORE_";

export type ScoreScanPayload = { scanEventId: string; stationId: string | null; campId: string };
export type ScoreStaffScanPayload = { staffScanEventId: string; stationId: string | null; campId: string };

/**
 * Enqueue-only — deliberately NOT wrapped in a transaction with the caller's
 * scanEvent.create. This is an at-most-once outbox: if this INSERT is lost
 * (process crash between the two awaits), the nightly rebuildLeaderboard
 * reconcile in the cron route heals it from the ScanEvent row itself. Do not
 * "fix" this into a $transaction — scan.ts's processScan is the app's most
 * latency-sensitive path (a volunteer working a live queue at a gate).
 */
export async function enqueueScoreScan(payload: ScoreScanPayload) {
  // SideEffect has no campId column (only organizationId, unused by this
  // feature) — campId travels inside `payload` and is read back out in
  // processScanScore below.
  await prisma.sideEffect.create({
    data: { type: `${SCORE_TYPE_PREFIX}SCAN`, status: "QUEUED", payload },
  });
}

export async function enqueueScoreStaffScan(payload: ScoreStaffScanPayload) {
  await prisma.sideEffect.create({
    data: { type: `${SCORE_TYPE_PREFIX}STAFF_SCAN`, status: "QUEUED", payload },
  });
}

/** Drains queued SCORE_* SideEffects. Called from /api/cron/score and
 * opportunistically (try/catch) from leaderboard.overview — never from
 * publicBoard, which must not trigger work for an unauthenticated caller. */
export async function drainScoreQueue(limit = 25) {
  const due = await prisma.sideEffect.findMany({
    where: { status: "QUEUED", runAfter: { lte: new Date() }, type: { startsWith: SCORE_TYPE_PREFIX } },
    take: limit,
    orderBy: { runAfter: "asc" },
  });
  let processed = 0;
  for (const effect of due) {
    try {
      await processScoreEffect(effect.id, effect.type, effect.payload);
      await prisma.sideEffect.update({ where: { id: effect.id }, data: { status: "DONE" } });
      processed++;
    } catch (error) {
      await prisma.sideEffect.update({
        where: { id: effect.id },
        data: { status: "FAILED", attempts: { increment: 1 }, lastError: error instanceof Error ? error.message : String(error) },
      });
    }
  }
  return { processed };
}

async function processScoreEffect(effectId: string, type: string, payload: unknown) {
  if (type === `${SCORE_TYPE_PREFIX}SCAN`) return processScanScore(payload as ScoreScanPayload);
  if (type === `${SCORE_TYPE_PREFIX}STAFF_SCAN`) return processStaffScanScore(payload as ScoreStaffScanPayload);
  // Unknown SCORE_* type — nothing to do, but not an error either (forward
  // compatible with future score sources without breaking the drain loop).
}

async function processScanScore(payload: ScoreScanPayload) {
  const scanEvent = await prisma.scanEvent.findUnique({ where: { id: payload.scanEventId } });
  if (!scanEvent || !payload.stationId) return; // nothing to score against

  const registration = await prisma.registration.findUnique({
    where: { id: scanEvent.registrationId },
    select: { tribeId: true, campusId: true },
  });
  if (!registration) return;

  const day = campDayKey(scanEvent.timestamp, "Africa/Lagos");
  const session = await findSessionForScan(payload.campId, payload.stationId, day, registration.tribeId);
  if (!session) return; // no configured session for this station/day — legitimately unscored

  const rule = session.ruleId
    ? await prisma.scoreRule.findUnique({ where: { id: session.ruleId } })
    : await prisma.scoreRule.findFirst({
        where: { campId: payload.campId, trigger: "SCAN", stationId: payload.stationId, enabled: true },
        orderBy: { priority: "desc" },
      });
  if (!rule || !rule.enabled) return;

  const minutesLate = (scanEvent.timestamp.getTime() - session.startsAt.getTime()) / 60_000;
  const points = evaluateRule(rule, { minutesLate });

  await recordScoreEvent({
    campId: payload.campId,
    campusId: registration.campusId,
    tribeId: registration.tribeId,
    registrationId: scanEvent.registrationId,
    categoryId: session.categoryId,
    ruleId: rule.id,
    scoredSessionId: session.id,
    points,
    source: "AUTO",
    occurredAt: scanEvent.timestamp,
    idempotencyKey: `scan:${payload.scanEventId}:${rule.id}`,
  });
}

async function processStaffScanScore(payload: ScoreStaffScanPayload) {
  const staffScan = await prisma.staffScanEvent.findUnique({ where: { id: payload.staffScanEventId } });
  if (!staffScan || !payload.stationId || !staffScan.campId) return;

  const day = campDayKey(staffScan.timestamp, "Africa/Lagos");
  const session = await findSessionForScan(payload.campId, payload.stationId, day, null);
  if (!session) return;

  const rule = session.ruleId
    ? await prisma.scoreRule.findUnique({ where: { id: session.ruleId } })
    : await prisma.scoreRule.findFirst({
        where: { campId: payload.campId, trigger: "SCAN", stationId: payload.stationId, enabled: true },
        orderBy: { priority: "desc" },
      });
  if (!rule || !rule.enabled) return;

  const minutesLate = (staffScan.timestamp.getTime() - session.startsAt.getTime()) / 60_000;
  const points = evaluateRule(rule, { minutesLate });

  await recordScoreEvent({
    campId: payload.campId,
    staffProfileId: staffScan.staffProfileId,
    categoryId: session.categoryId,
    ruleId: rule.id,
    scoredSessionId: session.id,
    points,
    source: "AUTO",
    occurredAt: staffScan.timestamp,
    idempotencyKey: `staffscan:${payload.staffScanEventId}:${rule.id}`,
  });
}

/** Nearest ScoredSession for this station on this camp-local day, scoped to
 * the subject's tribe when the session is tribe-scoped (scope="TRIBE"),
 * otherwise camp/campus-wide sessions match any subject. */
async function findSessionForScan(campId: string, stationId: string, day: string, tribeId: string | null) {
  const sessions = await prisma.scoredSession.findMany({
    where: {
      campId,
      stationId,
      date: new Date(`${day}T00:00:00.000Z`),
      status: { in: ["SCHEDULED", "ACTIVE", "CLOSED"] },
    },
    orderBy: { startsAt: "desc" },
  });
  return sessions.find((s) => s.scope !== "TRIBE" || s.tribeId === tribeId) ?? null;
}
