import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { renderCampIdCardSheetPng } from "@/server/idcard/renderCard";
import { buildCampIdCardData, ID_CARD_INCLUDE } from "@/server/idcard/data";

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

  const png = await renderCampIdCardSheetPng(data);

  return new NextResponse(png, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
