import { NextResponse } from "next/server";
import { renderCampIdCardSheetPng, type CampIdCardData } from "@/server/idcard/renderCard";

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
  const png = await renderCampIdCardSheetPng(SAMPLE_DATA);

  return new NextResponse(png, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
