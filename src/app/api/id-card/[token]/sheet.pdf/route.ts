import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { buildCampIdCardData, ID_CARD_INCLUDE } from "@/server/idcard/data";
import { renderCampIdCardPng } from "@/server/idcard/renderCard";
import { generateCampIdCardSheetPdf } from "@/server/idcard/sheetPdf";

/**
 * Bearer-token printable sheet used by Resend's remote attachment fetch.
 * The same unguessable/revocable qrToken already protects the public PNG card
 * and sheet routes. Do not cache this PII-bearing PDF in shared caches.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const registration = await prisma.registration.findUnique({
    where: { qrToken: token },
    include: ID_CARD_INCLUDE,
  });
  if (!registration) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = buildCampIdCardData(registration);
  if (!data) return NextResponse.json({ error: "ID card is not ready" }, { status: 409 });

  try {
    const cardPng = await renderCampIdCardPng(data);
    const pdf = await generateCampIdCardSheetPdf(cardPng);
    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="camp-id-card-${registration.registrationNumber}.pdf"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Failed to generate token ID-card sheet PDF:", error);
    return NextResponse.json({ error: "Unable to generate ID-card PDF" }, { status: 500 });
  }
}
