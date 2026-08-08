import { prisma } from "../db";
import { rebuildLeaderboard } from "./aggregate";
import { notifyAchievementAwarded } from "./notify";
import { awardTeacherOfTheDay, awardCampCompletion } from "./dailyOps";

/**
 * Nightly full reconcile — the healing half of the at-most-once
 * scan-scoring design (see queue.ts's enqueueScoreScan comment). If a
 * SideEffect INSERT was ever lost (process crash between the scanEvent
 * write and the outbox write), ScoreEvent itself is unaffected — only
 * LeaderboardStat could drift — and this is what corrects it, by
 * recomputing every camp's stats from ScoreEvent (the ledger, which always
 * wins) rather than trusting the incremental deltas. Runs once a day, not
 * on any read path.
 *
 * Also the once-a-day home for Teacher of the Day (dailyOps.ts) — unlike
 * the Perfect Attendance auto-award (fired on every rebuild, including
 * admin "Rebuild Now"), Teacher of the Day is deliberately only computed
 * here, since "today's top teacher" only makes sense to settle once per
 * day, not be recomputed every time an admin manually rebuilds.
 */
export async function reconcileAllCamps() {
  const camps = await prisma.camp.findMany({
    where: { deletedAt: null, OR: [{ leaderboardSettings: { isNot: null } }, { scoreEvents: { some: {} } }] },
    select: { id: true },
  });

  let reconciled = 0;
  for (const camp of camps) {
    const { perfectAttendanceAwards } = await prisma.$transaction(async (tx) => rebuildLeaderboard(tx, camp.id));
    for (const award of perfectAttendanceAwards) {
      await notifyAchievementAwarded(camp.id, award.achievementName, "TRIBE", award.tribeId);
    }
    await awardTeacherOfTheDay(camp.id);
    // No-ops unless the camp opted into CHECKOUT or CAMP_END mode; every
    // award is idempotencyKey-guarded, so running nightly is safe.
    await awardCampCompletion(camp.id);
    reconciled++;
  }
  return { reconciled };
}
