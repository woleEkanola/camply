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
export type PerfectAttendanceAward = { tribeId: string; achievementName: string };

export async function rebuildLeaderboard(tx: Tx, campId: string, timezone = "Africa/Lagos"): Promise<{ perfectAttendanceAwards: PerfectAttendanceAward[] }> {
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
  const perfectAttendanceAwards = await awardEligiblePerfectAttendance(tx, campId);
  return { perfectAttendanceAwards };
}

// A camp with only one or two sessions so far makes 100% attendance
// trivial; require a few sessions to have actually happened before it
// means anything.
const PERFECT_ATTENDANCE_MIN_SESSIONS = 3;

/**
 * After computeDerivedStats has attendancePct settled, awards the
 * already-seeded "Perfect Attendance" achievement (TRIBE only, matching
 * its AchievementDefinition.subjectType) to any tribe at 100% attendance
 * with at least PERFECT_ATTENDANCE_MIN_SESSIONS sessions so far. Runs
 * inside every full rebuild (nightly reconcile, admin "Rebuild Now",
 * reset/import), not just the nightly cron — safe to call repeatedly since
 * AchievementAward's existing `@@unique([definitionId, subjectKey])`
 * dedupes re-awards for free (caught here as a P2002, not re-thrown).
 * Notifications are deliberately NOT fired from in here — this runs inside
 * the same transaction as the write that triggered it, so the caller fires
 * `notifyAchievementAwarded` for each returned award only after the
 * transaction commits (same discipline as `rebuildRanks`'s RankTransition
 * return above).
 */
async function awardEligiblePerfectAttendance(tx: Tx, campId: string): Promise<PerfectAttendanceAward[]> {
  const definition = await tx.achievementDefinition.findFirst({
    where: { key: "PERFECT_ATTENDANCE", OR: [{ campId }, { campId: null }] },
  });
  if (!definition) return [];

  const totalSessions = await tx.scoredSession.count({ where: { campId, date: { lte: new Date() } } });
  if (totalSessions < PERFECT_ATTENDANCE_MIN_SESSIONS) return [];

  const eligible = await tx.leaderboardStat.findMany({
    where: { campId, subjectType: "TRIBE", day: null, attendancePct: 100 },
    select: { subjectId: true },
  });

  const awarded: PerfectAttendanceAward[] = [];
  for (const { subjectId: tribeId } of eligible) {
    try {
      await tx.achievementAward.create({
        data: { definitionId: definition.id, campId, subjectKey: `T:${tribeId}` },
      });
      awarded.push({ tribeId, achievementName: definition.name });
    } catch (err: any) {
      if (err?.code !== "P2002") throw err;
    }
  }
  return awarded;
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

  // CAMPUS is included here (it was previously skipped) so campuses get the
  // same attendance/promptness/streak treatment every other subject gets —
  // the campus composite in computeCompositeScores needs those inputs, and
  // the spec ranks campuses on attendance and promptness explicitly.
  // `achievementPrefix` is null for CAMPUS because AchievementAward.subjectKey
  // only ever encodes T:/C:/S: — there is no such thing as a campus achievement.
  const subjectColumns: Array<{
    column: "tribeId" | "registrationId" | "staffProfileId" | "campusId";
    subjectType: StatSubject["subjectType"];
    achievementPrefix: "T" | "C" | "S" | null;
  }> = [
    { column: "tribeId", subjectType: "TRIBE", achievementPrefix: "T" },
    { column: "registrationId", subjectType: "CAMPER", achievementPrefix: "C" },
    { column: "staffProfileId", subjectType: "STAFF", achievementPrefix: "S" },
    { column: "campusId", subjectType: "CAMPUS", achievementPrefix: null },
  ];

  for (const { column, subjectType, achievementPrefix } of subjectColumns) {
    // Attendance/promptness: sessions this subject has a session-tied
    // ScoreEvent for, vs. every ScoredSession scheduled up to today for
    // that subject's scope (camp-wide, or this specific tribe/subject).
    const attendance: Array<{ subjectId: string; attended: bigint; prompt: bigint }> = await tx.$queryRawUnsafe(
      `SELECT e."${column}" AS "subjectId",
              COUNT(DISTINCT e."scoredSessionId") AS "attended",
              COUNT(DISTINCT e."scoredSessionId") FILTER (WHERE e."points" > 0) AS "prompt"
       FROM "ScoreEvent" e
       WHERE e."campId" = $1 AND e."${column}" IS NOT NULL AND e."scoredSessionId" IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM "ScoreEvent" reversal WHERE reversal."reversesEventId" = e."id")
       GROUP BY e."${column}"`,
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
    const achievementCounts: Array<{ subjectId: string; count: bigint }> = achievementPrefix
      ? await tx.$queryRawUnsafe(
          `SELECT split_part("subjectKey", ':', 2) AS "subjectId", COUNT(*) AS "count"
           FROM "AchievementAward"
           WHERE "campId" = $1 AND "subjectKey" LIKE $2
           GROUP BY split_part("subjectKey", ':', 2)`,
          campId,
          `${achievementPrefix}:%`
        )
      : [];
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

/** Metrics read straight off the subject's own LeaderboardStat row. */
const BASE_METRIC_KEYS = ["attendancePct", "promptnessPct", "totalPoints", "achievementCount"] as const;

/**
 * Metrics derived from the *tribe a staff member is assigned to* — the spec's
 * teacher metrics "camper attendance" and "average camper punctuality", which
 * are real data via `StaffProfile.assignedTribeId` joined to that tribe's
 * LeaderboardStat row. Only meaningful for STAFF.
 */
const STAFF_TRIBE_METRIC_KEYS = ["tribeAttendancePct", "tribePromptnessPct"] as const;

/**
 * **`participation`** (all subject types) — the number of *distinct*
 * `ScoreCategory` values the subject has scored in. Breadth of engagement,
 * not volume: a camper who earned points across eight different activities
 * participated broadly, while one with only attendance points did not, even
 * if their totals match. Costs no extra query — it is the size of the inner
 * map `perCategoryTotals` already builds.
 *
 * **`sessionManagement`** (STAFF only) — the number of `AttendanceSession`
 * rows this staff member actually ran (`AttendanceSession.createdById`).
 * That column holds a `User.id`, so it joins back through
 * `StaffProfile.userId`, and it is **unindexed** (the model's indexes are
 * `[campId,date]`, `[tribeId,date]`, `[scoredSessionId]`) — a sequential scan
 * over one camp's sessions, which is fine at camp scale. Note this measures
 * sessions *run*, not `ScoredSession`s: `ScoredSession` has no staff FK at
 * all, so it cannot be attributed to a teacher.
 *
 * Both were previously excluded as "unmeasurable". That was too pessimistic —
 * the data exists; what was missing was a stated definition. These are those
 * definitions, and they are surfaced verbatim in the UI rather than left
 * implicit.
 */
const ACTIVITY_METRIC_KEYS = ["participation", "sessionManagement"] as const;

/**
 * Per-`ScoreCategory` point totals, addressed as `cat:<categoryId>`. This is
 * what makes the spec's named metrics real rather than approximated: the 20
 * seeded categories *are* the metric names it lists (Bible Quiz, Sports,
 * Service, Leadership, Special Recognition, Teamwork), and every ScoreEvent
 * carries a non-nullable `categoryId`, so grouping by (subject, category)
 * yields them directly. Any category — including admin-created ones — can be
 * weighted this way; these constants only drive the default weight maps and
 * the Settings UI's suggested list.
 */
export const CATEGORY_METRIC_IDS = {
  bibleQuiz: "seed-cat-bible-quiz",
  sports: "seed-cat-sports",
  service: "seed-cat-service",
  leadership: "seed-cat-leadership",
  recognition: "seed-cat-special-recognition",
  teamwork: "seed-cat-teamwork",
} as const;

const catKey = (categoryId: string) => `cat:${categoryId}`;

/**
 * Default blends, one per subject type. Every metric the original spec names
 * for campers (9) and teachers (8) is represented, each by a real
 * measurement. Weights are relative — they don't have to sum to 100 — and
 * every one is editable per camp in admin Settings and rendered read-only on
 * the public Rules tab.
 */
const DEFAULT_WEIGHTS_BY_SUBJECT: Record<"STAFF" | "CAMPER" | "CAMPUS", Record<string, number>> = {
  // The spec's 8 teacher metrics: attendance, camper attendance,
  // participation, recognition, session management, manual commendations
  // (≈ points), average camper punctuality, + achievements/leadership.
  STAFF: {
    attendancePct: 18,
    promptnessPct: 8,
    tribeAttendancePct: 14,
    tribePromptnessPct: 10,
    participation: 10,
    sessionManagement: 10,
    [catKey(CATEGORY_METRIC_IDS.recognition)]: 12,
    [catKey(CATEGORY_METRIC_IDS.leadership)]: 8,
    totalPoints: 7,
    achievementCount: 3,
  },
  // The spec's 9 camper metrics: attendance, promptness, participation,
  // Bible Quiz, sports, service, leadership, positive recognition,
  // manual awards (≈ points), + achievements.
  CAMPER: {
    attendancePct: 18,
    promptnessPct: 12,
    participation: 12,
    [catKey(CATEGORY_METRIC_IDS.bibleQuiz)]: 9,
    [catKey(CATEGORY_METRIC_IDS.sports)]: 9,
    [catKey(CATEGORY_METRIC_IDS.service)]: 9,
    [catKey(CATEGORY_METRIC_IDS.leadership)]: 9,
    [catKey(CATEGORY_METRIC_IDS.recognition)]: 9,
    totalPoints: 9,
    achievementCount: 4,
  },
  // attendance, promptness, participation, average tribe score
  // (≈ totalPoints), teamwork, service. A distinct "teacher performance"
  // rollup is the one campus metric with no measurement of its own — a
  // campus's staff composite average would be a derived-from-derived figure,
  // so it's left out rather than compounded.
  CAMPUS: {
    attendancePct: 25,
    promptnessPct: 20,
    participation: 10,
    totalPoints: 25,
    [catKey(CATEGORY_METRIC_IDS.teamwork)]: 10,
    [catKey(CATEGORY_METRIC_IDS.service)]: 10,
  },
};

/**
 * Per-(subject, category) point totals for one camp. Not index-covered —
 * `ScoreEvent` has `(campId, categoryId, day)` and `(campId, <subject>, day)`
 * but no composite spanning both — so this groups in-heap. Fine at camp scale
 * (one to two weeks of events); revisit if a camp ever runs for months.
 */
async function perCategoryTotals(tx: Tx, campId: string, column: string): Promise<Map<string, Map<string, number>>> {
  const rows: Array<{ subjectId: string; categoryId: string; points: bigint }> = await tx.$queryRawUnsafe(
    `SELECT "${column}" AS "subjectId", "categoryId", SUM("points") AS "points"
     FROM "ScoreEvent"
     WHERE "campId" = $1 AND "${column}" IS NOT NULL
     GROUP BY "${column}", "categoryId"`,
    campId
  );
  const bySubject = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const inner = bySubject.get(r.subjectId) ?? new Map<string, number>();
    inner.set(r.categoryId, Number(r.points));
    bySubject.set(r.subjectId, inner);
  }
  return bySubject;
}

/**
 * Blends weighted metrics into one composite score per subject, for STAFF,
 * CAMPER and CAMPUS. TRIBE is deliberately left alone — the spec ranks
 * tribes on raw points, and `rank`/`rankDelta` (which notify.ts's Top-3
 * transition logic depends on) stay points-based for every subject type.
 *
 * Three metric families, all weighted through the same mechanism:
 *  - **base** — `attendancePct`, `promptnessPct`, `totalPoints`,
 *    `achievementCount`, read off the subject's own stat row.
 *  - **per-category** — `cat:<categoryId>`, the subject's point total in one
 *    ScoreCategory. This is what makes the spec's named metrics (Bible Quiz,
 *    Sports, Service, Leadership, Recognition, Teamwork) real measurements
 *    rather than approximations.
 *  - **staff tribe-derived** — `tribeAttendancePct` / `tribePromptnessPct`,
 *    the assigned tribe's figures, i.e. the spec's teacher metrics "camper
 *    attendance" and "average camper punctuality".
 *  - **activity-derived** — `participation` (all types) and
 *    `sessionManagement` (STAFF). See their definitions at the constants
 *    below; both are counts of things the app already records, deliberately
 *    defined rather than estimated, and both definitions are stated verbatim
 *    in admin Settings and on the public Rules tab so neither is a black box.
 *
 * With those two, every metric the original spec names for campers (9) and
 * teachers (8) now has a real measurement behind it.
 * `LeaderboardSettings.teacherMetricWeights` / `camperMetricWeights` /
 * `campusMetricWeights` are editable in admin Settings and rendered read-only
 * on the public Rules tab, so which metrics count and by how much is always
 * inspectable.
 *
 * Each metric is min-max normalized across the camp's subjects of that type
 * (0-100) before weighting, since points/counts have no natural upper bound
 * and can't otherwise be blended with percentages. Ties (including the
 * common all-zero case, e.g. a category nobody has scored in yet) get full
 * credit rather than an undefined 0/0 — nobody should be penalized for a
 * metric that hasn't had a chance to differentiate anyone.
 *
 * STAFF is displayed as a 0-5 rating (the spec's "teacher composite score"
 * framing). CAMPER and CAMPUS stay 0-100 and are used only as optional sort
 * keys (see `leaderboard.campers`/`campuses`) — never shown as a rating.
 */
async function computeCompositeScores(tx: Tx, campId: string): Promise<void> {
  const settings = await tx.leaderboardSettings.findUnique({ where: { campId } });

  const subjectConfig = [
    { subjectType: "STAFF" as const, column: "staffProfileId", configured: settings?.teacherMetricWeights },
    { subjectType: "CAMPER" as const, column: "registrationId", configured: settings?.camperMetricWeights },
    { subjectType: "CAMPUS" as const, column: "campusId", configured: (settings as any)?.campusMetricWeights },
  ];

  for (const { subjectType, column, configured } of subjectConfig) {
    const weights: Record<string, number> = {
      ...DEFAULT_WEIGHTS_BY_SUBJECT[subjectType],
      ...(configured && typeof configured === "object" ? (configured as Record<string, number>) : {}),
    };
    // Only metrics carrying positive weight are computed or normalized —
    // a zeroed-out metric can't influence the result, so it shouldn't drag
    // the min/max range around either.
    const metricKeys = Object.keys(weights).filter((k) => (weights[k] ?? 0) > 0);
    const totalWeight = metricKeys.reduce((sum, k) => sum + weights[k], 0) || 1;
    if (metricKeys.length === 0) continue;

    const rows = await tx.leaderboardStat.findMany({
      where: { campId, subjectType, day: null },
      select: { id: true, subjectId: true, totalPoints: true, attendancePct: true, promptnessPct: true, achievementCount: true },
    });
    if (rows.length === 0) continue;

    // `participation` also needs the category map — it's that map's size —
    // so it counts toward needing the fetch even with no `cat:` key weighted.
    const needsCategories = metricKeys.some((k) => k.startsWith("cat:") || k === "participation");
    const categoryTotals = needsCategories ? await perCategoryTotals(tx, campId, column) : new Map<string, Map<string, number>>();

    // STAFF only: the assigned tribe's attendance/promptness, i.e. the spec's
    // "camper attendance" and "average camper punctuality" for a teacher, plus
    // sessions-run for `sessionManagement`. Both need StaffProfile rows, so
    // they share one fetch.
    const tribeMetricsByStaff = new Map<string, { attendancePct: number; promptnessPct: number }>();
    const sessionsRunByStaff = new Map<string, number>();
    const needsTribeMetrics = metricKeys.some((k) => (STAFF_TRIBE_METRIC_KEYS as readonly string[]).includes(k));
    const needsSessionManagement = metricKeys.includes("sessionManagement");

    if (subjectType === "STAFF" && (needsTribeMetrics || needsSessionManagement)) {
      const staffRows = await tx.staffProfile.findMany({
        where: { id: { in: rows.map((r: any) => r.subjectId) } },
        select: { id: true, userId: true, assignedTribeId: true },
      });

      if (needsTribeMetrics) {
        const tribeIds = [...new Set(staffRows.map((s: any) => s.assignedTribeId).filter(Boolean) as string[])];
        const tribeStats = tribeIds.length
          ? await tx.leaderboardStat.findMany({
              where: { campId, subjectType: "TRIBE", subjectId: { in: tribeIds }, day: null },
              select: { subjectId: true, attendancePct: true, promptnessPct: true },
            })
          : [];
        const statByTribe = new Map(tribeStats.map((t: any) => [t.subjectId, t]));
        for (const s of staffRows) {
          if (!s.assignedTribeId) continue;
          const t = statByTribe.get(s.assignedTribeId) as any;
          if (t) tribeMetricsByStaff.set(s.id, { attendancePct: Number(t.attendancePct ?? 0), promptnessPct: Number(t.promptnessPct ?? 0) });
        }
      }

      if (needsSessionManagement) {
        // AttendanceSession.createdById is a User.id, hence the userId hop.
        // Unindexed on that column — a scan over one camp's sessions.
        const userIds = [...new Set(staffRows.map((s: any) => s.userId as string))];
        const grouped = userIds.length
          ? await tx.attendanceSession.groupBy({
              by: ["createdById"],
              where: { campId, createdById: { in: userIds }, deletedAt: null },
              _count: { _all: true },
            })
          : [];
        const countByUser = new Map(grouped.map((g: any) => [g.createdById, g._count._all as number]));
        for (const s of staffRows) sessionsRunByStaff.set(s.id, countByUser.get(s.userId as string) ?? 0);
      }
    }

    function rawValue(row: any, key: string): number {
      if (key.startsWith("cat:")) return categoryTotals.get(row.subjectId)?.get(key.slice(4)) ?? 0;
      // Breadth of engagement: how many distinct categories this subject has
      // scored in at all, regardless of how many points each contributed.
      if (key === "participation") return categoryTotals.get(row.subjectId)?.size ?? 0;
      if (key === "sessionManagement") return sessionsRunByStaff.get(row.subjectId) ?? 0;
      if (key === "tribeAttendancePct") return tribeMetricsByStaff.get(row.subjectId)?.attendancePct ?? 0;
      if (key === "tribePromptnessPct") return tribeMetricsByStaff.get(row.subjectId)?.promptnessPct ?? 0;
      return Number(row[key] ?? 0);
    }

    const ranges = Object.fromEntries(
      metricKeys.map((k) => {
        const values = rows.map((r: any) => rawValue(r, k));
        return [k, { min: Math.min(...values), max: Math.max(...values) }];
      })
    ) as Record<string, { min: number; max: number }>;

    for (const row of rows) {
      let weightedSum = 0;
      for (const k of metricKeys) {
        const { min, max } = ranges[k];
        const raw = rawValue(row, k);
        const normalized = max === min ? 100 : ((raw - min) / (max - min)) * 100;
        weightedSum += normalized * weights[k];
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
