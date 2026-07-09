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

// Periodically drop stale buckets so the map doesn't grow unboundedly.
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [key, hits] of buckets) {
    if (hits.every((t) => t <= cutoff)) buckets.delete(key);
  }
}, 10 * 60 * 1000).unref?.();
