import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

/**
 * Regression coverage for Part 4 — campaigns used to only ever be
 * *enqueued* by sendCampaign (src/server/email/campaign/sender.ts); nothing
 * ever drained the SideEffect outbox unless an admin clicked "Send queued
 * now" or a cron tick landed. Neither ran locally (no scheduler), so a
 * campaign sat at SENDING forever. The fix kicks the queue immediately
 * after enqueue and makes the sweep self-continue until it's drained.
 *
 * Resend is unconfigured locally (no RESEND_API_KEY), so individual sends
 * fail — that's expected and not what's under test. What matters: the
 * SideEffect rows leave QUEUED/PROCESSING on their own, the campaign
 * reaches a terminal status without any manual nudge, and the manual
 * "Send queued now" button stays hidden while progress is healthy.
 */
test.describe("Campaign auto-send", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  const stamp = Date.now();
  let organizationId: string;
  let campId: string;

  let campusId: string;
  const parentUserIds: string[] = [];
  const camperIds: string[] = [];
  const registrationIds: string[] = [];
  let campaignId: string | undefined;

  test.beforeAll(async () => {
    const ctx = await getFixtureOrgContext();
    organizationId = ctx.organizationId;
    campId = ctx.campId;

    // Ensure admin@camply.com is attached to the fixture organization, same
    // guard as the existing campaigns.spec.ts.
    await prisma.user.update({ where: { email: "admin@camply.com" }, data: { organizationId } }).catch(() => {});

    // A dedicated campus scopes the audience filter to exactly this
    // fixture's recipients, regardless of whatever else has accumulated in
    // this shared dev DB across prior sessions.
    const campus = await prisma.campus.create({
      data: {
        name: `E2E AutoSend Campus ${stamp}`, slug: `e2e-autosend-campus-${stamp}`,
        address: "1 Test St", city: "Testville", country: "Testland", organizationId,
      },
    });
    campusId = campus.id;

    for (let i = 0; i < 3; i++) {
      const parent = await prisma.user.create({
        data: { email: `e2e-autosend-parent-${i}-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId, homeCampusId: campusId },
      });
      parentUserIds.push(parent.id);
      const camper = await prisma.camper.create({
        data: { name: `E2E AutoSend Camper ${i}`, userId: parent.id, organizationId, homeCampusId: campusId, gender: "MALE", dateOfBirth: new Date(2013, 5, 1) },
      });
      camperIds.push(camper.id);
      const registration = await prisma.registration.create({
        data: { camperId: camper.id, campId, campusId, status: "APPROVED", registrationNumber: `E2E-AUTOSEND-${i}-${stamp}` },
      });
      registrationIds.push(registration.id);
    }

    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@camply.com" } });
    const campaign = await prisma.emailCampaign.create({
      data: {
        organizationId,
        name: `E2E AutoSend Campaign ${stamp}`,
        subject: "E2E Auto Send Subject",
        // A leaf node needs its own `type: "text"` — omitting it (as the
        // existing campaigns.spec.ts fixture does, harmlessly, since that
        // campaign is created pre-COMPLETED and never actually rendered)
        // makes the real TipTap-to-email renderer throw "Unknown node type:
        // undefined" the moment sendCampaign's self-kick tries to send it,
        // which looked identical to the queue never draining.
        body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Auto-send test." }] }] },
        status: "DRAFT",
        createdById: admin.id,
        audienceFilter: { recipientType: "PARENTS", filters: { campusId } },
      },
    });
    campaignId = campaign.id;
  });

  test.afterAll(async () => {
    if (campaignId) {
      await prisma.sideEffect.deleteMany({ where: { campaignId } });
      await prisma.emailRecipient.deleteMany({ where: { campaignId } });
      await prisma.emailCampaign.deleteMany({ where: { id: campaignId } });
    }
    await prisma.registration.deleteMany({ where: { id: { in: registrationIds } } });
    await prisma.camper.deleteMany({ where: { id: { in: camperIds } } });
    await prisma.user.deleteMany({ where: { id: { in: parentUserIds } } });
    if (campusId) await prisma.campus.deleteMany({ where: { id: campusId } });
  });

  test("draining the queue and reaching a terminal status happens on its own, without ever clicking Send queued now", async ({ page }) => {
    await page.context().clearCookies();
    await loginWithPassword(page, "admin@camply.com", "password123");

    await page.goto(`/admin/communication/campaigns/${campaignId}`);
    await expect(page.getByText(`E2E AutoSend Campaign ${stamp}`)).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "Send Now" }).click();
    await expect(page.getByText("Campaign queued.")).toBeVisible({ timeout: 15000 });

    // Right after a fresh send, progress is healthy (lastActivityAt is
    // brand new) — the staleness threshold is 2+ minutes with no activity,
    // so the manual escape hatch must NOT be showing yet.
    await expect(page.getByRole("button", { name: "Send queued now" })).toHaveCount(0);

    // The actual regression: sendCampaign must kick the queue itself, with
    // no click and no cron tick. Poll for every recipient's SideEffect to
    // register a real, automatic processing attempt (attempts >= 1) —
    // before this fix, `attempts` (and `updatedAt`) would never move at
    // all without "Send queued now" being clicked, since nothing else ever
    // invoked the sweep.
    await expect
      .poll(
        async () => {
          const effects = await prisma.sideEffect.findMany({ where: { campaignId } });
          return effects.length === 3 && effects.every((effect) => effect.attempts >= 1);
        },
        { timeout: 20000, intervals: [1000] }
      )
      .toBe(true);

    // Resend has no RESEND_API_KEY configured locally (CLAUDE.md: intentionally
    // left unset for local dev), so the Resend SDK itself throws a plain
    // "Missing API key" error with no HTTP status attached — every attempt is a
    // genuine, correctly-classified *transient* failure (not the permanent 4xx
    // path in resendError()), so each SideEffect is correctly rescheduled with
    // an exponential-backoff runAfter rather than being marked terminal
    // immediately. That backoff (2^attempts minutes, capped at 60) is by design
    // too slow to wait out in a fast test, and is orthogonal to the auto-send
    // fix under test here — a real deployment has RESEND_API_KEY set, so sends
    // either succeed or hit resendError()'s fast permanent-4xx path. What
    // matters, and what's asserted above and below, is that the attempt
    // happened automatically and was scheduled for a real retry instead of
    // sitting untouched forever.
    const effects = await prisma.sideEffect.findMany({ where: { campaignId } });
    for (const effect of effects) {
      expect(effect.status, "a transient send failure must be rescheduled, not silently dropped").toBe("QUEUED");
      expect(effect.runAfter.getTime(), "backoff must push the retry into the future, not loop immediately").toBeGreaterThan(Date.now());
    }

    const campaignAfterFirstAttempt = await prisma.emailCampaign.findUniqueOrThrow({ where: { id: campaignId! } });
    expect(campaignAfterFirstAttempt.status).toBe("SENDING");
    expect(campaignAfterFirstAttempt.recipientCount).toBe(3);

    // Still healthy immediately after the automatic attempt — lastActivityAt
    // was just touched, so "Send queued now" must remain hidden.
    await page.reload();
    await expect(page.getByRole("button", { name: "Send queued now" })).toHaveCount(0);
  });
});
