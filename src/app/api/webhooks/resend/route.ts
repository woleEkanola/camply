import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifyResendWebhookSignature } from "@/server/email/webhooks/verifyResend";

/**
 * Logs when an event matched no recipient row. A miss means Resend reported on a
 * message whose `providerMessageId` we never stored — the signature of a batch-send
 * index misalignment, or of a send that died between the provider call and the
 * follow-up update. Silently counting zero here is how delivery stats drift.
 */
function reportMatch(eventType: string, emailId: string, count: number) {
  if (count === 0) {
    console.warn(
      `[resend-webhook] ${eventType} matched no EmailRecipient for providerMessageId=${emailId} — ` +
        `delivery state for that message will never be recorded.`
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    // Fail closed, matching cron/effects/route.ts's CRON_SECRET check — an
    // unset RESEND_WEBHOOK_SECRET previously skipped verification entirely,
    // letting anyone POST unauthenticated events that write delivery state.
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (!webhookSecret) {
      // A misconfigured deployment must be loud. While this is unset every event
      // 401s, so deliveredAt/bouncedAt are never written and every campaign reads
      // 0% delivered — which looks like "nobody got the email", not like a
      // missing env var. See render.yaml.
      console.error(
        "[resend-webhook] RESEND_WEBHOOK_SECRET is not set — rejecting all webhook events. " +
          "Delivery, open, and bounce statistics will stay empty until it is configured."
      );
      return NextResponse.json({ error: "Webhook not configured" }, { status: 401 });
    }
    if (!verifyResendWebhookSignature(rawBody, request.headers, webhookSecret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const body = JSON.parse(rawBody);
    const event = body as {
      type: string;
      data: {
        email_id?: string;
        created_at?: string;
        to?: string[];
        subject?: string;
      };
    };

    // Nothing to act on and nothing to retry — 200 so Resend stops resending.
    if (!event?.type || !event?.data?.email_id) {
      return NextResponse.json({ received: true });
    }

    const emailId = event.data.email_id;
    const where = { providerMessageId: emailId };

    switch (event.type) {
      case "email.sent": {
        const { count } = await prisma.emailRecipient.updateMany({
          where: { ...where, deliveryStatus: { in: ["QUEUED", "PROCESSING"] } },
          data: { sentAt: new Date(), deliveryStatus: "SENT" },
        });
        reportMatch(event.type, emailId, count);
        break;
      }

      case "email.delivery_delayed": {
        const { count } = await prisma.emailRecipient.updateMany({
          where: { ...where, deliveryStatus: { in: ["SENT", "DELAYED"] } },
          data: {
            deliveryStatus: "DELAYED",
            failedReason: "Delivery is delayed by the recipient's mail server.",
          },
        });
        reportMatch(event.type, emailId, count);
        break;
      }

      case "email.delivered": {
        // Two writes, deliberately. The tracking pixel can flip a row to OPENED
        // before this event lands (mail clients fetch images the instant the mail
        // is rendered), and a single guarded update would then drop `deliveredAt`
        // on the floor permanently — the row would show "opened but never
        // delivered", which is nonsense and silently zeroes the delivered count.
        //
        // 1. Record the timestamp regardless of how far the row has advanced.
        const stamped = await prisma.emailRecipient.updateMany({
          where: { ...where, deliveredAt: null },
          data: { deliveredAt: new Date() },
        });
        // 2. Advance the status only from states that precede delivery — never
        //    regress OPENED/CLICKED/BOUNCED, since events can arrive out of order.
        await prisma.emailRecipient.updateMany({
          where: { ...where, deliveryStatus: { notIn: ["OPENED", "CLICKED", "BOUNCED"] } },
          data: { deliveryStatus: "DELIVERED", failedReason: null },
        });
        reportMatch(event.type, emailId, stamped.count);
        break;
      }

      case "email.failed":
      case "email.suppressed":
      case "email.complained": {
        const { count } = await prisma.emailRecipient.updateMany({
          where: { ...where, deliveryStatus: { notIn: ["OPENED", "CLICKED", "DELIVERED"] } },
          data: {
            deliveryStatus: "FAILED",
            failedReason: `Resend reported ${event.type.replace("email.", "")}.`,
          },
        });
        reportMatch(event.type, emailId, count);
        break;
      }

      case "email.bounced": {
        // Same split as email.delivered: stamp the timestamp unconditionally,
        // advance the status only when nothing later has already happened.
        const stamped = await prisma.emailRecipient.updateMany({
          where: { ...where, bouncedAt: null },
          data: { bouncedAt: new Date() },
        });
        await prisma.emailRecipient.updateMany({
          where: { ...where, deliveryStatus: { notIn: ["OPENED", "CLICKED"] } },
          data: { deliveryStatus: "BOUNCED" },
        });
        reportMatch(event.type, emailId, stamped.count);
        break;
      }

      case "email.opened": {
        // Don't downgrade CLICKED → OPENED
        const { count } = await prisma.emailRecipient.updateMany({
          where: { ...where, openedAt: null, deliveryStatus: { notIn: ["CLICKED"] } },
          data: { openedAt: new Date(), deliveryStatus: "OPENED" },
        });
        reportMatch(event.type, emailId, count);
        break;
      }

      case "email.clicked": {
        // A click implies an open — backfill openedAt so the opened stat counts
        // clickers whose mail client blocked the tracking pixel. Backfill only
        // when it is genuinely absent: overwriting a real earlier open with the
        // click time would misreport when the recipient first read the mail.
        const stampedOpen = await prisma.emailRecipient.updateMany({
          where: { ...where, openedAt: null },
          data: { openedAt: new Date() },
        });
        const { count } = await prisma.emailRecipient.updateMany({
          where: { ...where, clickedAt: null },
          data: { clickedAt: new Date(), deliveryStatus: "CLICKED" },
        });
        reportMatch(event.type, emailId, Math.max(count, stampedOpen.count));
        break;
      }

      default:
        // Unrecognised event type. Nothing to retry.
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    // 500, not 200 — this previously swallowed every failure behind a success
    // response, so Resend's retry policy never engaged and any event lost to a
    // transient DB error was gone for good.
    console.error("[resend-webhook] failed to process event", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
