import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/authOptions";
import { prisma } from "@/server/db";
import { qrDataUrlForToken } from "@/server/registration/effects";
import { canAccessRegistration } from "@/server/registration/access";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const registration = await prisma.registration.findUnique({
    where: { id },
    include: { camper: true, campus: true },
  });
  if (!registration || !registration.qrToken) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const currentUser = session.user as any;
  if (!(await canAccessRegistration(currentUser, registration))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const dataUrl = await qrDataUrlForToken(registration.qrToken);
  return NextResponse.json({ dataUrl });
}
