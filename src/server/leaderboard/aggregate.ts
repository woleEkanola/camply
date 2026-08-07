import { Prisma, type PrismaClient } from "@prisma/client";
import { campDayKey } from "./dayKey";

type Tx = Prisma.TransactionClient | PrismaClient;

export type StatSubject = { subjectType: "TRIBE" | "CAMPER" | "STAFF" | "CAMPUS"; subjectId: string };

/**
 * Upsert-with-increment against LeaderboardStat's two partial unique indexes
 * (see the leaderboard_partial_indexes migration). Prisma has no
 * schema-level knowledge of a partial unique index, so this is raw SQL
 * `ON CONFLICT (...) WHERE ... DO UPDATE` rather than `prisma.upsert` — the
 * `WHERE` clause in `ON CONFLICT` is what lets Postgres match a *partial*
 * index instead of requiring a full-table unique constraint.
 *
 * Writes both the all-time TOTAL row (day IS NULL) and the day row for
 * `day`. This is the only place LeaderboardStat.totalPoints is mutated
 * outside of rebuildLeaderboard's full recompute — write-through, never
 * invalidated.
 */
export async function applyStatDelta(tx: Tx, campId: string, subject: StatSubject, day: string, pointsDelta: number): Promise<void> {
  const dayDate = new Date(`${day}T00:00:00.000Z`);

  await tx.$executeRaw`
    INSERT INTO "LeaderboardStat" ("id", "campId", "subjectType", "subjectId", "day", "totalPoints", "computedAt")
    VALUES (gen_random_uuid()::text, ${campId}, ${subject.subjectType}, ${subject.subjectId}, NULL, ${pointsDelta}, now())
    ON CONFLICT ("campId", "subjectType", "subjectId") WHERE "day" IS NULL
    DO UPDATE SET "totalPoints" = "LeaderboardStat"."totalPoints" + ${pointsDelta}, "computedAt" = now()
  `;

  await tx.$executeRaw`
    INSERT INTO "LeaderboardStat" ("id", "campId", "subjectType", "subjectId", "day", "totalPoints", "computedAt")
    VALUES (gen_random_uuid()::text, ${campId}, ${subject.subjectType}, ${subject.subjectId}, ${dayDate}, ${pointsDelta}, now())
    ON CONFLICT ("campId", "subjectType", "subjectId", "day") WHERE "day" IS NOT NULL
    DO UPDATE SET "totalPoints" = "LeaderboardStat"."totalPoints" + ${pointsDelta}, "computedAt" = now()
  `;
}

/**
 * Sorts a camp's TOTAL rows for one subjectType in memory and writes rank
 * back in one UPDATE...FROM(VALUES...) — the only place `rank`/`rankDelta`
 * is written, since maintaining it incrementally would touch every row on
 * every event. Not called from the read path — only from the nightly
 * reconcile and admin rebuild/reset/import actions.
 */
export type RankTransition = { subjectId: string; newRank: number; previousRank: number | null };

/** Returns every subject whose rank just moved (for the caller to decide
 * whether e.g. a "entered Top 3" notification is warranted) — deliberately
 * NOT fired from in here, since this runs inside the same transaction as
 * the write that triggered it; notifying from inside an uncommitted
 * transaction risks acting on state that then rolls back. */
export async function rebuildRanks(tx: Tx, campId: string, subjectType: StatSubject["subjectType"]): Promise<RankTransition[]> {
  const rows = await tx.leaderboardStat.findMany({
    where: { campId, subjectType, day: null },
    orderBy: { totalPoints: "desc" },
    select: { id: true, subjectId: true, rank: true },
  });
  if (rows.length === 0) return [];

  const values = rows.map((r, i) => {
    const newRank = i + 1;
    const delta = r.rank == null ? null : r.rank - newRank; // positive = moved up
    return Prisma.sql`(${r.id}::text, ${newRank}::int, ${delta}::int)`;
  });

  await tx.$executeRaw`
    UPDATE "LeaderboardStat" AS ls
    SET "rank" = v.rank, "rankDelta" = v.delta, "computedAt" = now()
    FROM (VALUES ${Prisma.join(values)}) AS v(id, rank, delta)
    WHERE ls."id" = v.id
  `;

  return rows.map((r, i) => ({ subjectId: r.subjectId, newRank: i + 1, previousRank: r.rank }));
}

/**
 * Full recompute of LeaderboardStat's totalPoints from ScoreEvent for one
 * camp, plus a rank rebuild for every subjectType. Used by reset/import/
 * correction and the nightly reconcile — never on a read path. The ledger
 * (ScoreEvent) always wins; this is what heals any drift from the
 * at-most-once scan-scoring hook (see Phase 2).
 */
export async function rebuildLeaderboard(tx: Tx, campId: string, timezone = "Africa/Lagos"): Promise<void> {
  const subjectColumns: Array<{ column: "tribeId" | "registrationId" | "staffProfileId" | "campusId"; subjectType: StatSubject["subjectType"] }> = [
    { column: "tribeId", subjectType: "TRIBE" },
    { column: "registrationId", subjectType: "CAMPER" },
    { column: "staffProfileId", subjectType: "STAFF" },
    { column: "campusId", subjectType: "CAMPUS" },
  ];

  await tx.leaderboardStat.deleteMany({ where: { campId } });

  // Every Tribe gets a TOTAL row even with zero ScoreEvents — campersPresent
  // (and the Tribes tab card generally) needs somewhere to attach a value
  // regardless of scoring activity. Campers/staff/campuses only get a row
  // once they've actually scored, which is fine since nothing reads their
  // stat row before that.
  const tribes = await tx.tribe.findMany({ where: { campId, deletedAt: null }, select: { id: true } });
  for (const tribe of tribes) {
    await applyStatDelta(tx, campId, { subjectType: "TRIBE", subjectId: tribe.id }, campDayKey(new Date(), timezone), 0);
  }

  for (const { column, subjectType } of subjectColumns) {
    const totals: Array<{ subjectId: string; points: bigint }> = await tx.$queryRawUnsafe(
      `SELECT "${column}" AS "subjectId", SUM("points") AS "points" FROM "ScoreEvent"
       WHERE "campId" = $1 AND "${column}" IS NOT NULL GROUP BY "${column}"`,
      campId
    );
    for (const row of totals) {
      await applyStatDelta(tx, campId, { subjectType, subjectId: row.subjectId }, campDayKey(new Date(), timezone), 0);
      // applyStatDelta always deltas; set the TOTAL row to the true sum directly
      // since this is a full recompute, not an incremental step.
      await tx.$executeRaw`
        UPDATE "LeaderboardStat" SET "totalPoints" = ${Number(row.points)}, "computedAt" = now()
        WHERE "campId" = ${campId} AND "subjectType" = ${subjectType} AND "subjectId" = ${row.subjectId} AND "day" IS NULL
      `;
    }
    await rebuildRanks(tx, campId, subjectType);
  }

  await computeDerivedStats(tx, campId, timezone);
}

/**
 * Fills in the columns beyond totalPoints/rank that Phase 4's cards need:
 * currentStreak, attendancePct, promptnessPct, avgScoreToday, campersPresent
 * (TRIBE only). Deliberately only run as part of a full rebuild (nightly
 * reconcile, admin "Rebuild now", reset/import) — not on the incremental
 * write path — because attendancePct/promptnessPct need "how many sessions
 * have happened so far" as a denominator, which changes over time
 * independent of any single ScoreEvent, so there is no correct incremental
 * update to make from one event alone.
 *
 * promptnessPct is an approximation: a session-tied AUTO ScoreEvent with
 * points > 0 counts as "on time" (within a rule's tiers, 0 pts is what a
 * fully-late/after-cutoff arrival evaluates to — see rules.ts), zero or
 * absent counts as not-prompt. This avoids needing to inspect each rule's
 * tier boundaries to determine "was this arrival within the top tier".
 */
async function computeDerivedStats(tx: Tx, campId: string, timezone: string): Promise<void> {
  const today = campDayKey(new Date(), timezone);
  const todayDate = new Date(`${today}T00:00:00.000Z`);

  const subjectColumns: Array<{ column: "tribeId" | "registrationId" | "staffProfileId"; subjectType: StatSubject["subjectType"]; achievementPrefix: "T" | "C" | "S" }> = [
    { column: "tribeId", subjectType: "TRIBE", achievementPrefix: "T" },
    { column: "registrationId", subjectType: "CAMPER", achievementPrefix: "C" },
    { column: "staffProfileId", subjectType: "STAFF", achievementPrefix: "S" },
  ];

  for (const { column, subjectType, achievementPrefix } of subjectColumns) {
    // Attendance/promptness: sessions this subject has a session-tied
    // ScoreEvent for, vs. every ScoredSession scheduled up to today for
    // that subject's scope (camp-wide, or this specific tribe/subject).
    const attendance: Array<{ subjectId: string; attended: bigint; prompt: bigint }> = await tx.$queryRawUnsafe(
      `SELECT "${column}" AS "subjectId",
              COUNT(DISTINCT "scoredSessionId") AS "attended",
              COUNT(DISTINCT "scoredSessionId") FILTER (WHERE "points" > 0) AS "prompt"
       FROM "ScoreEvent"
       WHERE "campId" = $1 AND "${column}" IS NOT NULL AND "scoredSessionId" IS NOT NULL
       GROUP BY "${column}"`,
      campId
    );

    const totalSessions = await tx.scoredSession.count({ where: { campId, date: { lte: todayDate } } });

    for (const row of attendance) {
      if (totalSessions === 0) continue;
      const attendancePct = (Number(row.attended) / totalSessions) * 100;
      const promptnessPct = (Number(row.prompt) / totalSessions) * 100;
      await tx.$executeRaw`
        UPDATE "LeaderboardStat" SET "attendancePct" = ${attendancePct}, "promptnessPct" = ${promptnessPct}, "computedAt" = now()
        WHERE "campId" = ${campId} AND "subjectType" = ${subjectType} AND "subjectId" = ${row.subjectId} AND "day" IS NULL
      `;
    }

    // avgScoreToday: mean points per event recorded today for this subject.
    // Comparing a @db.Date column against a raw-query Date parameter is a
    // footgun: $queryRawUnsafe serializes the JS Date through the local
    // system timezone (confirmed via a UTC+1 dev machine reproducing a
    // silent zero-row match), not UTC, so an equality match against a
    // midnight-UTC date column can miss by a day depending on the host's
    // TZ. Pass the calendar-date string and cast explicitly instead.
    const todayAvg: Array<{ subjectId: string; avg: number | null }> = await tx.$queryRawUnsafe(
      `SELECT "${column}" AS "subjectId", AVG("points")::float AS "avg" FROM "ScoreEvent"
       WHERE "campId" = $1 AND "${column}" IS NOT NULL AND "day" = $2::date GROUP BY "${column}"`,
      campId,
      today
    );
    for (const row of todayAvg) {
      await tx.$executeRaw`
        UPDATE "LeaderboardStat" SET "avgScoreToday" = ${row.avg}, "computedAt" = now()
        WHERE "campId" = ${campId} AND "subjectType" = ${subjectType} AND "subjectId" = ${row.subjectId} AND "day" IS NULL
      `;
    }

    // Streak: consecutive calendar days (ending today or the subject's most
    // recent scored day) with net positive points.
    const days: Array<{ subjectId: string; day: Date }> = await tx.$queryRawUnsafe(
      `SELECT "${column}" AS "subjectId", "day" FROM "ScoreEvent"
       WHERE "campId" = $1 AND "${column}" IS NOT NULL
       GROUP BY "${column}", "day" HAVING SUM("points") > 0
       ORDER BY "${column}", "day" DESC`,
      campId
    );
    const daysBySubject = new Map<string, string[]>();
    for (const row of days) {
      // row.day is already a normalized @db.Date value (midnight UTC, no
      // time-of-day component) — UTC here just re-reads that same
      // calendar date, unlike `today`/`applyStatDelta` above which derive a
      // day from a real timestamp and must use the camp's actual timezone.
      const key = campDayKey(row.day, "UTC");
      const list = daysBySubject.get(row.subjectId) ?? [];
      list.push(key);
      daysBySubject.set(row.subjectId, list);
    }
    for (const [subjectId, dayKeys] of daysBySubject) {
      const streak = computeConsecutiveStreak(dayKeys);
      await tx.$executeRaw`
        UPDATE "LeaderboardStat" SET "currentStreak" = ${streak}, "computedAt" = now()
        WHERE "campId" = ${campId} AND "subjectType" = ${subjectType} AND "subjectId" = ${subjectId} AND "day" IS NULL
      `;
    }

    // achievementCount — was declared on the schema since PR1 but never
    // actually written anywhere (always the column default, 0), a real gap
    // found while wiring up compositeScore below (which needs it as one of
    // its blended metrics). AchievementAward.subjectKey encodes the subject
    // as "<prefix>:<id>" (T/C/S), never deleted once awarded, so this is a
    // plain grouped count. A subject can have an award with zero
    // ScoreEvents (e.g. a manual non-point achievement) and therefore no
    // LeaderboardStat row yet — applyStatDelta(0) guarantees one exists
    // before the UPDATE, the same treatment TRIBE rows already get above.
    const achievementCounts: Array<{ subjectId: string; count: bigint }> = await tx.$queryRawUnsafe(
      `SELECT split_part("subjectKey", ':', 2) AS "subjectId", COUNT(*) AS "count"
       FROM "AchievementAward"
       WHERE "campId" = $1 AND "subjectKey" LIKE $2
       GROUP BY split_part("subjectKey", ':', 2)`,
      campId,
      `${achievementPrefix}:%`
    );
    for (const row of achievementCounts) {
      await applyStatDelta(tx, campId, { subjectType, subjectId: row.subjectId }, today, 0);
      await tx.$executeRaw`
        UPDATE "LeaderboardStat" SET "achievementCount" = ${Number(row.count)}, "computedAt" = now()
        WHERE "campId" = ${campId} AND "subjectType" = ${subjectType} AND "subjectId" = ${row.subjectId} AND "day" IS NULL
      `;
    }
  }

  await computeCompositeScores(tx, campId);

  // campersPresent — TRIBE only, reuses Registration.status (the app's
  // existing check-in/check-out state machine) rather than re-deriving
  // "present" from scans, since that's already the source of truth
  // elsewhere in the app: CHECKED_IN means arrived and not yet checked out.
  const present: Array<{ tribeId: string; count: bigint }> = await tx.$queryRawUnsafe(
    `SELECT "tribeId", COUNT(DISTINCT "id") AS "count" FROM "Registration"
     WHERE "campId" = $1 AND "tribeId" IS NOT NULL AND "deletedAt" IS NULL AND "status" = 'CHECKED_IN'
     GROUP BY "tribeId"`,
    campId
  );
  for (const row of present) {
    await tx.$executeRaw`
      UPDATE "LeaderboardStat" SET "campersPresent" = ${Number(row.count)}, "computedAt" = now()
      WHERE "campId" = ${campId} AND "subjectType" = 'TRIBE' AND "subjectId" = ${row.tribeId} AND "day" IS NULL
    `;
  }
}

const COMPOSITE_METRIC_KEYS = ["attendancePct", "promptnessPct", "totalPoints", "achievementCount"] as const;
type CompositeMetricKey = (typeof COMPOSITE_METRIC_KEYS)[number];
const DEFAULT_COMPOSITE_WEIGHTS: Record<CompositeMetricKey, number> = {
  attendancePct: 25,
  promptnessPct: 25,
  totalPoints: 25,
  achievementCount: 25,
};

/**
 * Blends four distinctly-tracked metrics (attendancePct, promptnessPct,
 * totalPoints, achievementCount) into a single per-subject composite score
 * for STAFF (teachers) and CAMPER — TRIBE/CAMPUS are left alone, they only
 * ever rank by raw totalPoints.
 *
 * Honesty about the data gap (per the plan this PR implements): the
 * original leaderboard spec names eight distinct teacher-quality metrics.
 * Only these four have real, distinctly-tracked backing data today — the
 * rest (things like a subjective punctuality-beyond-arrival-time rating,
 * or peer/parent feedback) have no data source anywhere in the schema.
 * Rather than inventing a precise-looking number for metrics nothing
 * measures, the composite is built honestly from what's actually tracked,
 * and `LeaderboardSettings.teacherMetricWeights`/`camperMetricWeights`
 * (editable in admin Settings, rendered read-only on the public Rules tab)
 * make exactly which of these four — and how much each counts — fully
 * transparent, rather than a black-box "4.9 out of 5".
 *
 * Each metric is min-max normalized across the camp's subjects of that type
 * (0-100) before weighting, since totalPoints/achievementCount have no
 * natural upper bound and can't be blended with percentage metrics
 * otherwise. Ties (including the common all-zero case, e.g. no
 * achievements awarded yet) get full credit for that metric rather than an
 * undefined 0/0 — nobody should be penalized for a metric that hasn't had
 * a chance to differentiate anyone yet.
 *
 * STAFF is displayed as a 0-5 rating (the spec's "teacher composite score"
 * framing). CAMPER stays 0-100 and is used only as an optional sort key
 * (see leaderboard.campers/staff's orderBy) — never shown as a rating.
 */
async function computeCompositeScores(tx: Tx, campId: string): Promise<void> {
  const settings = await tx.leaderboardSettings.findUnique({ where: { campId } });

  for (const subjectType of ["STAFF", "CAMPER"] as const) {
    const configured =
      subjectType === "STAFF" ? (settings?.teacherMetricWeights as Record<string, number> | null) : (settings?.camperMetricWeights as Record<string, number> | null);
    const weights: Record<CompositeMetricKey, number> = { ...DEFAULT_COMPOSITE_WEIGHTS, ...(configured && typeof configured === "object" ? configured : {}) };
    const totalWeight = COMPOSITE_METRIC_KEYS.reduce((sum, k) => sum + (weights[k] ?? 0), 0) || 1;

    const rows = await tx.leaderboardStat.findMany({
      where: { campId, subjectType, day: null },
      select: { id: true, totalPoints: true, attendancePct: true, promptnessPct: true, achievementCount: true },
    });
    if (rows.length === 0) continue;

    const ranges = Object.fromEntries(
      COMPOSITE_METRIC_KEYS.map((k) => {
        const values = rows.map((r: any) => Number(r[k] ?? 0));
        return [k, { min: Math.min(...values), max: Math.max(...values) }];
      })
    ) as Record<CompositeMetricKey, { min: number; max: number }>;

    for (const row of rows) {
      let weightedSum = 0;
      for (const k of COMPOSITE_METRIC_KEYS) {
        const { min, max } = ranges[k];
        const raw = Number((row as any)[k] ?? 0);
        const normalized = max === min ? 100 : ((raw - min) / (max - min)) * 100;
        weightedSum += normalized * (weights[k] ?? 0);
      }
      const blended = weightedSum / totalWeight; // 0-100
      const compositeScore = subjectType === "STAFF" ? Math.round((blended / 20) * 10) / 10 : Math.round(blended * 100) / 100;
      await tx.$executeRaw`
        UPDATE "LeaderboardStat" SET "compositeScore" = ${compositeScore}, "computedAt" = now()
        WHERE "id" = ${row.id}
      `;
    }
  }
}

/** `dayKeys` sorted descending (most recent first). Counts how many are
 * consecutive calendar days starting from the first entry. */
function computeConsecutiveStreak(dayKeysDesc: string[]): number {
  if (dayKeysDesc.length === 0) return 0;
  let streak = 1;
  let cursor = new Date(`${dayKeysDesc[0]}T00:00:00.000Z`);
  for (let i = 1; i < dayKeysDesc.length; i++) {
    const expectedPrev = new Date(cursor.getTime() - 24 * 60 * 60_000);
    const expectedKey = expectedPrev.toISOString().slice(0, 10);
    if (dayKeysDesc[i] === expectedKey) {
      streak++;
      cursor = expectedPrev;
    } else {
      break;
    }
  }
  return streak;
}
