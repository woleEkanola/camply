import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/server/db";

/**
 * Public, unauthenticated QR image endpoint — email clients fetch this with no
 * cookies, so it can't be session-gated like /api/registrations/[id]/qr. Safe
 * to expose: the token is a 32-char unguessable secret and holding the URL
 * already means holding the token it encodes; the response discloses nothing
 * about the registration beyond that.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const registration = await prisma.registration.findUnique({ where: { qrToken: token } });
  if (!registration) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pngBuffer = await QRCode.toBuffer(token, { width: 300, margin: 1 });

  return new NextResponse(pngBuffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
