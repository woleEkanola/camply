import { NextRequest, NextResponse } from "next/server";
import { sweepPendingSideEffects } from "@/server/registration/effects";
import { isAuthorizedCronRequest } from "@/server/cron/auth";

export const maxDuration = 300;

/**
 * Retries queued/failed acceptance-workflow side effects (email, notifications).
 * Scheduled every minute via vercel.json's `crons` (GET, Vercel's own Bearer
 * auth) — also reachable via POST + x-cron-secret for any external pinger.
 * Protected by a shared secret rather than user auth since it's not a
 * user-facing endpoint (PRD Part 4 §17, Part 6 §16).
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await sweepPendingSideEffects();
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  return GET(req);
}
