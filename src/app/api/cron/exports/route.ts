import { NextRequest, NextResponse } from "next/server";
import { sweepPendingExportJobs } from "@/server/export/engine";

/**
 * Retries queued/failed export jobs and reclaims stalled ones. Most exports
 * finish via the un-awaited kick-off in enqueueExportJob — this sweep is the
 * retry/crash backstop, intended to be hit by an external scheduler (Render
 * cron job, uptime pinger) every minute or so. Protected by a shared secret
 * rather than user auth since it's not a user-facing endpoint, mirroring
 * /api/cron/effects.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sweepPendingExportJobs();
  return NextResponse.json(result);
}
