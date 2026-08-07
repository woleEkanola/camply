import { prisma } from "../db";
import { rebuildLeaderboard } from "./aggregate";

/**
 * Nightly full reconcile — the healing half of the at-most-once
 * scan-scoring design (see queue.ts's enqueueScoreScan comment). If a
 * SideEffect INSERT was ever lost (process crash between the scanEvent
 * write and the outbox write), ScoreEvent itself is unaffected — only
 * LeaderboardStat could drift — and this is what corrects it, by
 * recomputing every camp's stats from ScoreEvent (the ledger, which always
 * wins) rather than trusting the incremental deltas. Runs once a day, not
 * on any read path.
 */
export async function reconcileAllCamps() {
  const camps = await prisma.camp.findMany({
    where: { deletedAt: null, OR: [{ leaderboardSettings: { isNot: null } }, { scoreEvents: { some: {} } }] },
    select: { id: true },
  });

  let reconciled = 0;
  for (const camp of camps) {
    await prisma.$transaction(async (tx) => {
      await rebuildLeaderboard(tx, camp.id);
    });
    reconciled++;
  }
  return { reconciled };
}
