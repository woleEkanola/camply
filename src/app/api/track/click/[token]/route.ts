import { NextRequest, NextResponse } from "next/server";
import { decodeClickToken } from "@/server/email/tracking/trackingToken";
import { prisma } from "@/server/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const decoded = decodeClickToken(token);

  if (decoded) {
    try {
      const recipient = await prisma.emailRecipient.findUnique({
        where: { id: decoded.recipientId },
        select: { clickedAt: true, openedAt: true },
      });

      if (recipient && !recipient.clickedAt) {
        // A click implies an open — backfill openedAt for pixel-blocked clients.
        await prisma.emailRecipient.update({
          where: { id: decoded.recipientId },
          data: { clickedAt: new Date(), openedAt: recipient.openedAt ?? new Date(), deliveryStatus: "CLICKED" },
        });
      }
    } catch {
      // silently ignore tracking errors
    }
  }

  const redirectUrl =
    decoded?.url && (decoded.url.startsWith("http://") || decoded.url.startsWith("https://"))
      ? decoded.url
      : "/";

  return NextResponse.redirect(redirectUrl);
}
