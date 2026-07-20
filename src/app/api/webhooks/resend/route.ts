import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import crypto from "crypto";

function verifySignature(payload: string, signature: string, secret: string): boolean {
  try {
    const parts = signature.split(",");
    const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);
    const sig = parts.find((p) => p.startsWith("v1,"))?.slice(3);
    if (!timestamp || !sig) return false;

    const signedPayload = `${timestamp}.${payload}`;
    const expected = crypto.createHmac("sha256", secret).update(signedPayload).digest("base64");
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    // Verify webhook signature if secret is configured
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = request.headers.get("svix-signature") ?? "";
      if (!signature || !verifySignature(rawBody, signature, webhookSecret)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
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
      case "email.delivered":
        await prisma.emailRecipient.updateMany({
          where,
          data: { deliveredAt: new Date(), deliveryStatus: "DELIVERED" },
        });
        break;

      case "email.bounced":
        await prisma.emailRecipient.updateMany({
          where,
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
        await prisma.emailRecipient.updateMany({
          where: { ...where, clickedAt: null },
          data: { clickedAt: new Date(), deliveryStatus: "CLICKED" },
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
