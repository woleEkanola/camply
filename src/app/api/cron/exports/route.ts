import { NextRequest, NextResponse } from "next/server";
import { sweepPendingExportJobs } from "@/server/export/engine";
import { isAuthorizedCronRequest } from "@/server/cron/auth";

export const maxDuration = 300;

/**
 * Retries queued/failed export jobs, resumes ones that ran out of budget, and
 * reclaims genuinely stalled ones. This sweep is load-bearing, not a backstop:
 * production runs on Vercel, where a request-triggered export is killed the
 * moment the response is sent, so every export beyond a single invocation's
 * budget depends on this cron actually running (see engine.ts's resumable
 * design). Scheduled every minute via vercel.json; also reachable via
 * POST + x-cron-secret, mirroring /api/cron/effects.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await sweepPendingExportJobs();
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  return GET(req);
}
