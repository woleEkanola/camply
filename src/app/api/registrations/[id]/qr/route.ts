import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/authOptions";
import { prisma } from "@/server/db";
import { qrDataUrlForToken } from "@/server/registration/effects";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const registration = await prisma.registration.findUnique({
    where: { id },
    include: { camper: true },
  });
  if (!registration || !registration.qrToken) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const currentUser = session.user as any;
  const isOwner = registration.camper.userId === currentUser.id;
  const isAdmin = ["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"].includes(currentUser.role);
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const dataUrl = await qrDataUrlForToken(registration.qrToken);
  return NextResponse.json({ dataUrl });
}
