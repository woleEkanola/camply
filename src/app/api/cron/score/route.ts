import { NextRequest, NextResponse } from "next/server";
import { drainScoreQueue } from "@/server/leaderboard/queue";

/**
 * Drains queued SCORE_* SideEffects (the leaderboard's at-most-once
 * scan-scoring outbox — see src/server/leaderboard/queue.ts). Intended to
 * run every minute or so, same as /api/cron/effects. Protected by the same
 * shared secret, not user auth — not a user-facing endpoint.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await drainScoreQueue();
  return NextResponse.json(result);
}
