import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/authOptions";
import { prisma } from "@/server/db";
import { generateAcceptanceLetterPdf } from "@/server/registration/acceptanceLetter";
import { qrDataUrlForToken } from "@/server/registration/effects";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const registration = await prisma.registration.findUnique({
    where: { id },
    include: { camper: true, camp: true, campus: true },
  });
  if (!registration) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const currentUser = session.user as any;
  const isOwner = registration.camper.userId === currentUser.id;
  const isAdmin = ["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"].includes(currentUser.role);
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!registration.qrToken || !registration.registrationNumber) {
    return NextResponse.json({ error: "Registration has not been approved yet." }, { status: 400 });
  }

  const qrDataUrl = await qrDataUrlForToken(registration.qrToken);
  const pdfBytes = await generateAcceptanceLetterPdf({
    campName: registration.camp.name,
    campusName: registration.campus.name,
    camperName: registration.camper.name,
    registrationNumber: registration.registrationNumber,
    reportingDate: registration.camp.arrivalDate?.toDateString(),
    qrDataUrl,
    instructionsHtml: registration.camp.remindersHtml,
  });

  return new NextResponse(pdfBytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="acceptance-letter-${registration.registrationNumber}.pdf"`,
    },
  });
}
