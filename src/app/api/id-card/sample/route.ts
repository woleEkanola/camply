import { NextResponse } from "next/server";
import { renderCampIdCardPng, type CampIdCardData } from "@/server/idcard/renderCard";

/**
 * Fixed sample ID card image for admin preview / test sends — no DB lookup,
 * mirrors /api/qr/sample's role for the QR image. A literal sibling path
 * takes precedence over the [token] dynamic route.
 */
const SAMPLE_DATA: CampIdCardData = {
  camperName: "James Adelabu",
  campusName: "Igando Campus",
  gender: "Male",
  tribeName: "Pistis",
  tribeColor: "#1E3A8A",
  campName: "TCN Teens Camp",
  campYear: String(new Date().getFullYear()),
  logoUrl: null,
  qrToken: "SAMPLE-PREVIEW-QR",
};

export async function GET() {
  const png = await renderCampIdCardPng(SAMPLE_DATA);

  return new NextResponse(png, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
