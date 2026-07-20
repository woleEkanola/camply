import { NextRequest, NextResponse } from "next/server";
import { decodeClickToken } from "@/server/email/tracking/trackingToken";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const decoded = decodeClickToken(token);

  if (decoded) {
    try {
      const { PrismaClient } = await import("@prisma/client");
      const prisma = new PrismaClient();
      const recipient = await prisma.emailRecipient.findUnique({
        where: { id: decoded.recipientId },
        select: { clickedAt: true },
      });

      if (recipient && !recipient.clickedAt) {
        await prisma.emailRecipient.update({
          where: { id: decoded.recipientId },
          data: { clickedAt: new Date(), deliveryStatus: "CLICKED" },
        });
      }
      await prisma.$disconnect();
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
