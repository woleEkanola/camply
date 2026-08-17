import { NextRequest, NextResponse } from "next/server";
import { reconcileAllCamps } from "@/server/leaderboard/reconcile";
import { isAuthorizedCronRequest } from "@/server/cron/auth";

export const maxDuration = 300;

/**
 * Nightly full LeaderboardStat rebuild from ScoreEvent, for every camp with
 * leaderboard activity — heals any drift from the at-most-once scan-scoring
 * outbox (see src/server/leaderboard/queue.ts). This is load-bearing, not a
 * drift-corrector-of-last-resort: it's the only thing that ever catches a
 * lost SideEffect insert. Runs once a day; own vercel.json cron entry so it
 * isn't accidentally coupled to the once-a-minute drain schedule.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await reconcileAllCamps();
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  return GET(req);
}
