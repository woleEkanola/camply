import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/authOptions";
import { prisma } from "@/server/db";

// POST: Toggle signupOpen for a campus (expects { campusId, signupOpen })
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { campusId, signupOpen } = await req.json();
  if (!campusId || typeof signupOpen !== "boolean") {
    return NextResponse.json({ error: "Missing campusId or signupOpen" }, { status: 400 });
  }

  const isOrgAdmin = ["SUPER_ADMIN", "OWNER", "ADMIN"].includes(session.user.role);
  if (!isOrgAdmin) {
    if (session.user.role !== "CAMPUS_REPRESENTATIVE") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Re-verify against the DB rather than trusting the JWT's managedCampuses
    // claim alone - closes the same class of gap fixed in tribe.ts/document.ts
    // elsewhere in this refactor.
    const managed = await prisma.campus.findFirst({
      where: { id: campusId, reps: { some: { id: session.user.id } } },
    });
    if (!managed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const updated = await prisma.campus.update({
    where: { id: campusId },
    data: { signupOpen },
  });
  return NextResponse.json({ success: true, signupOpen: updated.signupOpen });
}
