import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/authOptions";
import { prisma } from "@/server/db";
import { canAccessRegistration } from "@/server/registration/access";
import { buildCampIdCardData, ID_CARD_INCLUDE } from "@/server/idcard/data";
import { renderCampIdCardPng } from "@/server/idcard/renderCard";
import { generateCampIdCardSheetPdf } from "@/server/idcard/sheetPdf";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const registration = await prisma.registration.findUnique({
    where: { id },
    include: { ...ID_CARD_INCLUDE, campus: true },
  });
  if (!registration) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const currentUser = session.user as any;
  if (!(await canAccessRegistration(currentUser, registration))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!registration.qrToken || !registration.registrationNumber) {
    return NextResponse.json({ error: "Registration has not been approved yet." }, { status: 400 });
  }

  const data = buildCampIdCardData(registration);
  if (!data) {
    return NextResponse.json({ error: "This registration doesn't have a tribe assigned yet." }, { status: 400 });
  }

  try {
    const cardPng = await renderCampIdCardPng(data);
    const sheetPdf = await generateCampIdCardSheetPdf(cardPng);

    return new NextResponse(sheetPdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="camp-id-card-${registration.registrationNumber}.pdf"`,
      },
    });
  } catch (err) {
    console.error("Failed to generate camp ID card sheet:", err);
    return NextResponse.json({ error: "Failed to generate the printable ID card sheet." }, { status: 500 });
  }
}
