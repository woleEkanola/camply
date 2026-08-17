const DEFAULT_REQUESTS_PER_SECOND = 4;
/** Resend accepts up to 100 messages per batch request. */
export const BATCH_SIZE = 100;

/**
 * The public origin every outbound email points back at — dashboard links,
 * click-redirects, and the open-tracking pixel alike.
 *
 * This lives in its own module rather than in sender.ts because
 * `injectTracking` needs it too, and sender.ts already imports injectTracking —
 * importing back would be a cycle. It previously had a second, divergent
 * definition inside injectTracking.ts that read NEXTAUTH_URL only, while this
 * one prefers APP_URL. render.yaml declares both independently, so if they ever
 * disagreed the tracking pixel pointed at a different host than the rest of the
 * mail and no open or click was ever recorded — silently, because both tracking
 * routes swallow their errors.
 *
 * Read per call, not captured at module load, so the value can't freeze to
 * whatever was set at import time.
 */
export function publicAppUrl(): { url: string; error?: string } {
  const raw = (process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3001").replace(/\/$/, "");
  try {
    const url = new URL(raw);
    if (
      process.env.NODE_ENV === "production" &&
      (url.protocol !== "https:" || ["localhost", "127.0.0.1"].includes(url.hostname))
    ) {
      return { url: raw, error: "APP_URL must be a public HTTPS address before personalized ID-card emails can be sent." };
    }
    return { url: raw };
  } catch {
    return { url: raw, error: "APP_URL is not a valid absolute URL." };
  }
}

/** Per-second send budget, clamped to Resend's ceiling. */
export function configuredRequestsPerSecond(): number {
  const parsed = Number(process.env.RESEND_MAX_REQUESTS_PER_SECOND ?? DEFAULT_REQUESTS_PER_SECOND);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 5) : DEFAULT_REQUESTS_PER_SECOND;
}

/**
 * Seconds to push `pending` messages through, given whether this campaign must
 * send one-at-a-time (attachments or personalization) or can use batch sends.
 * Shared so the campaign detail page's ETA and getCampaignReadiness's can never
 * drift apart, and so both honour RESEND_MAX_REQUESTS_PER_SECOND instead of
 * assuming the default.
 */
export function estimateSendSeconds(pending: number, individualDelivery: boolean): number {
  if (pending <= 0) return 0;
  const perSecond = individualDelivery
    ? configuredRequestsPerSecond()
    : configuredRequestsPerSecond() * BATCH_SIZE;
  return Math.ceil(pending / perSecond);
}
