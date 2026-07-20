import { NextRequest, NextResponse } from "next/server";
import { decodeOpenToken } from "@/server/email/tracking/trackingToken";
import { prisma } from "@/server/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const decoded = decodeOpenToken(token);

  if (decoded) {
    try {
      const recipient = await prisma.emailRecipient.findUnique({
        where: { id: decoded.recipientId },
        select: { openedAt: true, deliveryStatus: true },
      });

      // Record first open only, and never regress CLICKED → OPENED.
      if (recipient && !recipient.openedAt && recipient.deliveryStatus !== "CLICKED") {
        await prisma.emailRecipient.update({
          where: { id: decoded.recipientId },
          data: { openedAt: new Date(), deliveryStatus: "OPENED" },
        });
      }
    } catch {
      // silently ignore tracking errors
    }
  }

  const pixel = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64"
  );

  return new NextResponse(pixel, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
