import { NextRequest, NextResponse } from "next/server";
import { purgeExpired } from "@/server/trash/service";

/**
 * Hard-deletes anything soft-deleted more than 60 days ago (see src/server/trash/service.ts).
 * Intended to be hit once a day by an external scheduler (Render cron job, uptime pinger).
 * Protected by a shared secret rather than user auth — not a user-facing endpoint,
 * same pattern as /api/cron/effects.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await purgeExpired();
  return NextResponse.json(result);
}
