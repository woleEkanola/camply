// Simple in-memory sliding-window rate limiter.
// Per-process only — enough for a single-instance deployment; swap for a
// Redis-backed limiter if the app is ever scaled horizontally.

const buckets = new Map<string, number[]>();

/**
 * Returns true if the action identified by `key` is allowed, false if the
 * caller has exceeded `limit` calls within the last `windowMs` milliseconds.
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const hits = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

/**
 * Clears the recorded attempts for `key`. Used after a *successful* login so
 * that brute-force lockout counts only failed attempts — a legitimate user (or
 * the E2E suite) logging in repeatedly should never trip the limiter, while N
 * consecutive failures still lock the account out for the window.
 */
export function clearRateLimit(key: string): void {
  buckets.delete(key);
}

// Periodically drop stale buckets so the map doesn't grow unboundedly.
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [key, hits] of buckets) {
    if (hits.every((t) => t <= cutoff)) buckets.delete(key);
  }
}, 10 * 60 * 1000).unref?.();
