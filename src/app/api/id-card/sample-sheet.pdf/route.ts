import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/authOptions";
import { renderCampIdCardPng, type CampIdCardData } from "@/server/idcard/renderCard";
import { generateCampIdCardSheetPdf } from "@/server/idcard/sheetPdf";

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

/** Admin-only: downloads the sample 8-copy A4 sheet for the ID Card settings page. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  if (!role || !["SUPER_ADMIN", "OWNER", "ADMIN"].includes(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cardPng = await renderCampIdCardPng(SAMPLE_DATA);
  const sheetPdf = await generateCampIdCardSheetPdf(cardPng);

  return new NextResponse(sheetPdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="camp-id-card-sample.pdf"`,
    },
  });
}
