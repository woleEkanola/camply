import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/authOptions";
import { prisma } from "@/server/db";
import { canAccessStaffProfile } from "@/server/staff/access";
import { ensureStaffQrToken } from "@/server/staff/idToken";
import { buildStaffIdCardData, STAFF_ID_CARD_INCLUDE } from "@/server/idcard/staffData";
import { renderStaffIdCardPng } from "@/server/idcard/renderStaffCard";
import { generateCampIdCardSheetPdf } from "@/server/idcard/sheetPdf";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await prisma.staffProfile.findUnique({
    where: { id },
    include: STAFF_ID_CARD_INCLUDE,
  });
  if (!profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const currentUser = session.user as any;
  if (!canAccessStaffProfile(currentUser, profile)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (profile.status !== "APPROVED") {
    return NextResponse.json({ error: "This staff member has not been approved yet." }, { status: 400 });
  }

  // Lazily issue a token for anyone approved before this feature existed —
  // ensures a pre-existing approved teacher's badge just works on first print.
  if (!profile.qrToken) {
    await ensureStaffQrToken(prisma, profile.id);
  }
  const withToken = profile.qrToken ? profile : await prisma.staffProfile.findUniqueOrThrow({ where: { id }, include: STAFF_ID_CARD_INCLUDE });

  const data = buildStaffIdCardData(withToken);
  if (!data) {
    return NextResponse.json({ error: "Unable to build this staff member's ID card." }, { status: 400 });
  }

  try {
    const cardPng = await renderStaffIdCardPng(data);
    const sheetPdf = await generateCampIdCardSheetPdf(cardPng);

    return new NextResponse(sheetPdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="staff-id-card-${data.staffName.replace(/\s+/g, "-").toLowerCase()}.pdf"`,
      },
    });
  } catch (err) {
    console.error("Failed to generate staff ID card sheet:", err);
    return NextResponse.json({ error: "Failed to generate the printable ID card sheet." }, { status: 500 });
  }
}
