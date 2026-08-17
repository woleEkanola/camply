/**
 * One definition per email statistic, for every surface that reports them.
 *
 * These used to be inline array literals and `.filter()` chains repeated across
 * half a dozen procedures in communication.ts, which drifted: "Success Rate"
 * meant `delivered/total` on the campaign detail page and `delivered/sent` on
 * the dashboard, and "opened" was counted by status in one place and by the
 * `openedAt` timestamp in another. Same label, different number.
 */

/**
 * `deliveryStatus` advances SENT → DELIVERED → OPENED → CLICKED, so any bucket
 * has to include every state past it or the count shrinks as recipients engage.
 * DELAYED is a transient sub-state of SENT (the provider is still retrying), so
 * it counts as accepted-by-provider too.
 */
export const SENT_STATUSES = ["SENT", "DELIVERED", "OPENED", "CLICKED", "DELAYED"] as const;
export const DELIVERED_STATUSES = ["DELIVERED", "OPENED", "CLICKED"] as const;
export const FAILED_STATUSES = ["FAILED", "BOUNCED"] as const;

/** Statuses that mean the message never reached the provider. */
export const PENDING_STATUSES = ["QUEUED", "PROCESSING", "HELD"] as const;

/** The subset of EmailRecipient any stats computation needs. */
export interface RecipientStatsRow {
  deliveryStatus: string;
  openedAt?: Date | null;
  clickedAt?: Date | null;
}

export interface RecipientStats {
  total: number;
  queued: number;
  processing: number;
  held: number;
  sent: number;
  delayed: number;
  delivered: number;
  opened: number;
  clicked: number;
  failed: number;
  bounced: number;
  cancelled: number;
}

const EMPTY: RecipientStats = {
  total: 0, queued: 0, processing: 0, held: 0, sent: 0, delayed: 0,
  delivered: 0, opened: 0, clicked: 0, failed: 0, bounced: 0, cancelled: 0,
};

/**
 * Opens and clicks are counted by **timestamp**, not by status, everywhere.
 *
 * The two disagree in normal operation: the tracking pixel sets
 * `deliveryStatus = "OPENED"`, but a click sets `CLICKED` and backfills
 * `openedAt`, so a status-based open count silently drops every recipient who
 * clicked without the pixel loading. The timestamp is the durable fact; the
 * status is just the furthest point reached.
 */
export function computeRecipientStats(rows: RecipientStatsRow[]): RecipientStats {
  const stats: RecipientStats = { ...EMPTY, total: rows.length };
  for (const row of rows) {
    const status = row.deliveryStatus;
    if (status === "QUEUED") stats.queued++;
    else if (status === "PROCESSING") stats.processing++;
    else if (status === "HELD") stats.held++;
    else if (status === "FAILED") stats.failed++;
    else if (status === "BOUNCED") stats.bounced++;
    else if (status === "CANCELLED") stats.cancelled++;

    if (status === "DELAYED") stats.delayed++;
    if ((SENT_STATUSES as readonly string[]).includes(status)) stats.sent++;
    if ((DELIVERED_STATUSES as readonly string[]).includes(status)) stats.delivered++;

    if (row.openedAt) stats.opened++;
    if (row.clickedAt) stats.clicked++;
  }
  return stats;
}

/** Build the same stats from a Prisma `groupBy` result, avoiding a full table load. */
export function statsFromStatusCounts(
  groups: { deliveryStatus: string; _count: { _all: number } }[],
  timestampCounts: { opened: number; clicked: number }
): RecipientStats {
  const stats: RecipientStats = { ...EMPTY, ...timestampCounts };
  for (const group of groups) {
    const n = group._count._all;
    const status = group.deliveryStatus;
    stats.total += n;
    if (status === "QUEUED") stats.queued += n;
    else if (status === "PROCESSING") stats.processing += n;
    else if (status === "HELD") stats.held += n;
    else if (status === "FAILED") stats.failed += n;
    else if (status === "BOUNCED") stats.bounced += n;
    else if (status === "CANCELLED") stats.cancelled += n;

    if (status === "DELAYED") stats.delayed += n;
    if ((SENT_STATUSES as readonly string[]).includes(status)) stats.sent += n;
    if ((DELIVERED_STATUSES as readonly string[]).includes(status)) stats.delivered += n;
  }
  return stats;
}

/**
 * Share of messages the provider accepted that actually landed.
 *
 * Denominator is `sent`, not `total`: recipients still QUEUED, HELD for a
 * readiness issue, or CANCELLED were never attempted, and counting them as
 * failures makes a healthy in-progress campaign look broken. A campaign that has
 * sent nothing yet has no success rate — `null`, not a misleading 0%.
 */
export function successRate(stats: RecipientStats): number | null {
  return stats.sent > 0 ? Math.round((stats.delivered / stats.sent) * 100) : null;
}

/**
 * Share of delivered messages that were opened. Undercounts by nature — most
 * mail clients block the tracking pixel by default, and the provider's own open
 * event has the same limitation — so treat it as a floor, not a measurement.
 */
export function openRate(stats: RecipientStats): number | null {
  return stats.delivered > 0 ? Math.round((stats.opened / stats.delivered) * 100) : null;
}

/** Share of opens that led to a click. */
export function clickRate(stats: RecipientStats): number | null {
  return stats.opened > 0 ? Math.round((stats.clicked / stats.opened) * 100) : null;
}

export function rates(stats: RecipientStats) {
  return {
    successRate: successRate(stats),
    openRate: openRate(stats),
    clickRate: clickRate(stats),
  };
}
