import { NextRequest } from "next/server";

/**
 * Shared guard for every /api/cron/* route. Two callers are expected to hit
 * these routes and both are honoured:
 *
 * - Vercel Cron (vercel.json's `crons` array) sends `GET` with
 *   `Authorization: Bearer $CRON_SECRET` — this is Vercel's own convention,
 *   not something this app invented, and it's how these routes actually run
 *   in production now that Vercel Cron is wired up.
 * - Any external pinger (uptime service, manual curl, or a still-running
 *   Render cron job during the render.yaml -> vercel.json transition) keeps
 *   working via the original `POST` + `x-cron-secret` header shape.
 *
 * A route with no CRON_SECRET configured must fail closed, not skip the
 * check — the same class of bug the Resend webhook had before it was fixed.
 */
export function isAuthorizedCronRequest(req: NextRequest): boolean {
  const configured = process.env.CRON_SECRET;
  if (!configured) return false;

  const bearer = req.headers.get("authorization");
  if (bearer === `Bearer ${configured}`) return true;

  const legacy = req.headers.get("x-cron-secret");
  if (legacy === configured) return true;

  return false;
}
