import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/authOptions";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const { email, otp } = await req.json();
    if (!email || !otp) {
      return NextResponse.json({ message: "Email and OTP are required." }, { status: 400 });
    }

    // Find OTP record for this email
    const otpRecord = await prisma.oTP.findUnique({ where: { email } });
    if (!otpRecord) {
      return NextResponse.json({ message: "No OTP found for this email." }, { status: 404 });
    }

    // Check if OTP matches and is not expired
    if (
      otpRecord.code !== otp ||
      otpRecord.expiresAt.getTime() < Date.now()
    ) {
      return NextResponse.json({ message: "Invalid or expired OTP." }, { status: 401 });
    }

    // Do NOT delete OTP here, only verify it
    // Do not call prisma.oTP.delete or update

    // Authenticate user: create session via NextAuth
    // Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ message: "User not found." }, { status: 404 });
    }

    // Compose name from firstName and lastName
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ");

    // Use NextAuth signIn to create a session
    // We'll call the NextAuth credentials provider from the frontend after OTP verification
    // For now, return user info and a flag
    return NextResponse.json({
      message: "OTP verified. You are now logged in.",
      user: {
        id: user.id,
        email: user.email,
        name,
        role: user.role,
        organizationId: user.organizationId,
      },
      authenticated: true
    }, { status: 200 });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ message: error.message || "Server error" }, { status: 500 });
  }
}
