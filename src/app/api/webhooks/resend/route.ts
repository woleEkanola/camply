import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { verifyResendWebhookSignature } from "@/server/email/webhooks/verifyResend";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    // Fail closed, matching cron/effects/route.ts's CRON_SECRET check — an
    // unset RESEND_WEBHOOK_SECRET previously skipped verification entirely,
    // letting anyone POST unauthenticated events that write delivery state.
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (!webhookSecret || !verifyResendWebhookSignature(rawBody, request.headers, webhookSecret)) {
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

    if (!event?.type || !event?.data?.email_id) {
      return NextResponse.json({ received: true });
    }

    const where = { providerMessageId: event.data.email_id };

    switch (event.type) {
      case "email.sent":
        await prisma.emailRecipient.updateMany({
          where: { ...where, deliveryStatus: { in: ["QUEUED", "PROCESSING"] } },
          data: { sentAt: new Date(), deliveryStatus: "SENT" },
        });
        break;

      case "email.delivery_delayed":
        await prisma.emailRecipient.updateMany({
          where: { ...where, deliveryStatus: { in: ["SENT", "DELAYED"] } },
          data: { deliveryStatus: "DELAYED", failedReason: "Delivery is delayed by the recipient's mail server." },
        });
        break;

      case "email.delivered":
        // Events can arrive out of order — never regress OPENED/CLICKED/BOUNCED.
        await prisma.emailRecipient.updateMany({
          where: { ...where, deliveryStatus: { notIn: ["OPENED", "CLICKED", "BOUNCED"] } },
          data: { deliveredAt: new Date(), deliveryStatus: "DELIVERED", failedReason: null },
        });
        break;

      case "email.failed":
      case "email.suppressed":
      case "email.complained":
        await prisma.emailRecipient.updateMany({
          where: { ...where, deliveryStatus: { notIn: ["OPENED", "CLICKED", "DELIVERED"] } },
          data: { deliveryStatus: "FAILED", failedReason: `Resend reported ${event.type.replace("email.", "")}.` },
        });
        break;

      case "email.bounced":
        await prisma.emailRecipient.updateMany({
          where: { ...where, deliveryStatus: { notIn: ["OPENED", "CLICKED"] } },
          data: { bouncedAt: new Date(), deliveryStatus: "BOUNCED" },
        });
        break;

      case "email.opened":
        // Don't downgrade CLICKED → OPENED
        await prisma.emailRecipient.updateMany({
          where: { ...where, openedAt: null, deliveryStatus: { notIn: ["CLICKED"] } },
          data: { openedAt: new Date(), deliveryStatus: "OPENED" },
        });
        break;

      case "email.clicked":
        // A click implies an open — backfill openedAt so the opened stat counts
        // clickers whose mail client blocked the tracking pixel.
        await prisma.emailRecipient.updateMany({
          where: { ...where, clickedAt: null },
          data: { clickedAt: new Date(), openedAt: new Date(), deliveryStatus: "CLICKED" },
        });
        break;

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
