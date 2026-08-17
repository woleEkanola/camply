import { NextRequest, NextResponse } from "next/server";
import { purgeExpired } from "@/server/trash/service";
import { purgeExpiredExports } from "@/server/export/engine";
import { isAuthorizedCronRequest } from "@/server/cron/auth";

export const maxDuration = 300;

/**
 * Hard-deletes anything soft-deleted more than 60 days ago (see src/server/trash/service.ts),
 * plus any ExportJob past its 24h expiry. ExportJob isn't a soft-delete/restore entity like
 * TRASH_REGISTRY's members, so it's purged here directly rather than folded into purgeExpired().
 * Scheduled once a day via vercel.json. Protected by a shared secret rather than user auth —
 * not a user-facing endpoint, same pattern as /api/cron/effects.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [trash, exports] = await Promise.all([purgeExpired(), purgeExpiredExports()]);
  return NextResponse.json({ trash, exports });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
