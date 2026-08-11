import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { renderStaffIdCardPng } from "@/server/idcard/renderStaffCard";
import { buildStaffIdCardData, STAFF_ID_CARD_INCLUDE } from "@/server/idcard/staffData";

/**
 * Public, unauthenticated staff ID card image endpoint — same trust model as
 * /api/id-card/[token]: the token is the same unguessable
 * StaffProfile.qrToken already used for the QR image, so holding the URL
 * already means holding the secret it encodes.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const profile = await prisma.staffProfile.findUnique({
    where: { qrToken: token },
    include: STAFF_ID_CARD_INCLUDE,
  });
  if (!profile) {
    return new NextResponse(null, { status: 404 });
  }

  const data = buildStaffIdCardData(profile);
  if (!data) {
    return new NextResponse(null, { status: 404 });
  }

  const png = await renderStaffIdCardPng(data);

  return new NextResponse(png, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
