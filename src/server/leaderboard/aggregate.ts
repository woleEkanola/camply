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
export async function rebuildRanks(tx: Tx, campId: string, subjectType: StatSubject["subjectType"]): Promise<void> {
  const rows = await tx.leaderboardStat.findMany({
    where: { campId, subjectType, day: null },
    orderBy: { totalPoints: "desc" },
    select: { id: true, rank: true },
  });
  if (rows.length === 0) return;

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
}

/**
 * Full recompute of LeaderboardStat's totalPoints from ScoreEvent for one
 * camp, plus a rank rebuild for every subjectType. Used by reset/import/
 * correction and the nightly reconcile — never on a read path. The ledger
 * (ScoreEvent) always wins; this is what heals any drift from the
 * at-most-once scan-scoring hook (see Phase 2).
 */
export async function rebuildLeaderboard(tx: Tx, campId: string): Promise<void> {
  const subjectColumns: Array<{ column: "tribeId" | "registrationId" | "staffProfileId" | "campusId"; subjectType: StatSubject["subjectType"] }> = [
    { column: "tribeId", subjectType: "TRIBE" },
    { column: "registrationId", subjectType: "CAMPER" },
    { column: "staffProfileId", subjectType: "STAFF" },
    { column: "campusId", subjectType: "CAMPUS" },
  ];

  await tx.leaderboardStat.deleteMany({ where: { campId } });

  for (const { column, subjectType } of subjectColumns) {
    const totals: Array<{ subjectId: string; points: bigint }> = await tx.$queryRawUnsafe(
      `SELECT "${column}" AS "subjectId", SUM("points") AS "points" FROM "ScoreEvent"
       WHERE "campId" = $1 AND "${column}" IS NOT NULL GROUP BY "${column}"`,
      campId
    );
    for (const row of totals) {
      await applyStatDelta(tx, campId, { subjectType, subjectId: row.subjectId }, campDayKey(new Date(), "UTC"), 0);
      // applyStatDelta always deltas; set the TOTAL row to the true sum directly
      // since this is a full recompute, not an incremental step.
      await tx.$executeRaw`
        UPDATE "LeaderboardStat" SET "totalPoints" = ${Number(row.points)}, "computedAt" = now()
        WHERE "campId" = ${campId} AND "subjectType" = ${subjectType} AND "subjectId" = ${row.subjectId} AND "day" IS NULL
      `;
    }
    await rebuildRanks(tx, campId, subjectType);
  }
}
