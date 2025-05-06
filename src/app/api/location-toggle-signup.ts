import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/authOptions";
import { prisma } from "@/server/db";

// POST: Toggle signupOpen for a location (expects { locationId, signupOpen })
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "LOCATION_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { locationId, signupOpen } = await req.json();
  if (!locationId || typeof signupOpen !== "boolean") {
    return NextResponse.json({ error: "Missing locationId or signupOpen" }, { status: 400 });
  }
  // Ensure the location is managed by this admin
  if (!session.user.managedLocations?.includes(locationId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const updated = await prisma.location.update({
    where: { id: locationId },
    data: { signupOpen },
  });
  return NextResponse.json({ success: true, signupOpen: updated.signupOpen });
}
