import { describe, expect, it } from "vitest";
import {
  computeRecipientStats,
  statsFromStatusCounts,
  successRate,
  openRate,
  clickRate,
  type RecipientStatsRow,
} from "../stats";

const t = (iso: string) => new Date(iso);

/**
 * A realistic mid-flight campaign: 10 recipients spread across every state the
 * pipeline can produce, including the awkward ones — a clicker whose pixel never
 * loaded (openedAt backfilled from the click), and an opener the provider never
 * reported as delivered (pixel fired first, so the row sits at OPENED with no
 * deliveredAt).
 */
const ROWS: RecipientStatsRow[] = [
  { deliveryStatus: "QUEUED" },
  { deliveryStatus: "PROCESSING" },
  { deliveryStatus: "HELD" },
  { deliveryStatus: "CANCELLED" },
  { deliveryStatus: "SENT" },
  { deliveryStatus: "DELAYED" },
  { deliveryStatus: "DELIVERED" },
  { deliveryStatus: "OPENED", openedAt: t("2026-08-01T10:00:00Z") },
  { deliveryStatus: "CLICKED", openedAt: t("2026-08-01T10:05:00Z"), clickedAt: t("2026-08-01T10:05:00Z") },
  { deliveryStatus: "BOUNCED" },
];

describe("computeRecipientStats", () => {
  const stats = computeRecipientStats(ROWS);

  it("counts every bucket exactly", () => {
    expect(stats).toEqual({
      total: 10,
      queued: 1,
      processing: 1,
      held: 1,
      // SENT + DELAYED + DELIVERED + OPENED + CLICKED — the whole accepted pipeline
      sent: 5,
      delayed: 1,
      // DELIVERED + OPENED + CLICKED
      delivered: 3,
      opened: 2,
      clicked: 1,
      failed: 0,
      bounced: 1,
      cancelled: 1,
    });
  });

  it("keeps `sent` from shrinking as recipients engage", () => {
    // The bug this guards: counting only status === "SENT" made the sent figure
    // fall every time somebody opened the mail.
    const engaged = computeRecipientStats([
      { deliveryStatus: "CLICKED", openedAt: t("2026-08-01T10:00:00Z"), clickedAt: t("2026-08-01T10:00:00Z") },
      { deliveryStatus: "OPENED", openedAt: t("2026-08-01T10:00:00Z") },
      { deliveryStatus: "DELIVERED" },
    ]);
    expect(engaged.sent).toBe(3);
    expect(engaged.delivered).toBe(3);
  });

  it("counts opens by timestamp, not status", () => {
    // A clicker whose pixel never loaded has status CLICKED and a backfilled
    // openedAt. Counting opens by status would miss them entirely.
    const clickedOnly = computeRecipientStats([
      { deliveryStatus: "CLICKED", openedAt: t("2026-08-01T10:00:00Z"), clickedAt: t("2026-08-01T10:00:00Z") },
    ]);
    expect(clickedOnly.opened).toBe(1);
    expect(clickedOnly.clicked).toBe(1);
  });

  it("counts a pixel-first open as delivered even without a delivered event", () => {
    // The tracking pixel sets OPENED directly from SENT, so deliveredAt can be
    // null on a row that plainly did arrive.
    const pixelFirst = computeRecipientStats([
      { deliveryStatus: "OPENED", openedAt: t("2026-08-01T10:00:00Z") },
    ]);
    expect(pixelFirst.delivered).toBe(1);
    expect(pixelFirst.opened).toBe(1);
  });

  it("returns all zeroes for an empty campaign", () => {
    const empty = computeRecipientStats([]);
    expect(empty.total).toBe(0);
    expect(empty.sent).toBe(0);
    expect(empty.delivered).toBe(0);
  });
});

describe("statsFromStatusCounts", () => {
  it("matches computeRecipientStats given the same data", () => {
    const groups = Object.entries(
      ROWS.reduce<Record<string, number>>((acc, r) => {
        acc[r.deliveryStatus] = (acc[r.deliveryStatus] ?? 0) + 1;
        return acc;
      }, {})
    ).map(([deliveryStatus, n]) => ({ deliveryStatus, _count: { _all: n } }));

    const fromGroups = statsFromStatusCounts(groups, { opened: 2, clicked: 1 });
    expect(fromGroups).toEqual(computeRecipientStats(ROWS));
  });
});

describe("rates", () => {
  const stats = computeRecipientStats(ROWS);

  it("divides success by sent, not by total", () => {
    // 3 delivered of 5 accepted = 60%. Against `total` (10) it would read 30%,
    // penalising the campaign for recipients it deliberately never attempted.
    expect(successRate(stats)).toBe(60);
  });

  it("divides opens by delivered", () => {
    expect(openRate(stats)).toBe(67); // 2/3
  });

  it("divides clicks by opens", () => {
    expect(clickRate(stats)).toBe(50); // 1/2
  });

  it("returns null rather than 0% when there is no denominator", () => {
    // A campaign that has sent nothing has no success rate. Reporting 0% reads
    // as "everything failed", which is what the old code did while the webhook
    // secret was unconfigured.
    const untouched = computeRecipientStats([{ deliveryStatus: "QUEUED" }, { deliveryStatus: "HELD" }]);
    expect(successRate(untouched)).toBeNull();
    expect(openRate(untouched)).toBeNull();
    expect(clickRate(untouched)).toBeNull();
  });

  it("reports 100% when everything landed", () => {
    const perfect = computeRecipientStats([
      { deliveryStatus: "DELIVERED" },
      { deliveryStatus: "OPENED", openedAt: t("2026-08-01T10:00:00Z") },
    ]);
    expect(successRate(perfect)).toBe(100);
  });
});
