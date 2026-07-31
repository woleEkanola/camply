import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { renderCampIdCardPng } from "@/server/idcard/renderCard";
import { buildCampIdCardData, ID_CARD_INCLUDE } from "@/server/idcard/data";

/**
 * Public, unauthenticated ID card image endpoint — same trust model as
 * /api/qr/[token]: the token is the same unguessable Registration.qrToken
 * already used for the QR image, so holding the URL already means holding
 * the secret it encodes.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const registration = await prisma.registration.findUnique({
    where: { qrToken: token },
    include: ID_CARD_INCLUDE,
  });
  if (!registration) {
    return new NextResponse(null, { status: 404 });
  }

  const data = buildCampIdCardData(registration);
  if (!data) {
    return new NextResponse(null, { status: 404 });
  }

  const png = await renderCampIdCardPng(data);

  return new NextResponse(png, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
