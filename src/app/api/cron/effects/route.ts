import { NextRequest, NextResponse } from "next/server";
import { sweepPendingSideEffects } from "@/server/registration/effects";

/**
 * Retries queued/failed acceptance-workflow side effects (email, notifications).
 * Intended to be hit by an external scheduler (Render cron job, uptime pinger)
 * every minute or so. Protected by a shared secret rather than user auth since
 * it's not a user-facing endpoint (PRD Part 4 §17, Part 6 §16).
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sweepPendingSideEffects();
  return NextResponse.json(result);
}
