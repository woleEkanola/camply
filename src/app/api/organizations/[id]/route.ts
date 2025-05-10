import { NextResponse } from "next/server";
import { prisma } from "../../../../server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../server/auth/authOptions";

// Define the GET handler for /api/organizations/[id]
export async function GET(request: Request) {
  try {
    // Extract the ID from the URL
    const url = new URL(request.url);
    const id = url.pathname.split('/').pop();
    
    if (!id) {
      return NextResponse.json({ error: "Organization ID is required" }, { status: 400 });
    }

    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch organization data
    const organization = await prisma.organization.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    return NextResponse.json(organization);
  } catch (error) {
    console.error("Error fetching organization:", error);
    return NextResponse.json(
      { error: "Failed to fetch organization" },
      { status: 500 }
    );
  }
}
