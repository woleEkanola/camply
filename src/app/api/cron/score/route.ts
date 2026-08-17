import { NextRequest, NextResponse } from "next/server";
import { drainScoreQueue } from "@/server/leaderboard/queue";
import { isAuthorizedCronRequest } from "@/server/cron/auth";

export const maxDuration = 300;

/**
 * Drains queued SCORE_* SideEffects (the leaderboard's at-most-once
 * scan-scoring outbox — see src/server/leaderboard/queue.ts). Scheduled every
 * minute via vercel.json, same as /api/cron/effects. Protected by the same
 * shared secret, not user auth — not a user-facing endpoint.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await drainScoreQueue();
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  return GET(req);
}
