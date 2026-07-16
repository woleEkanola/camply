import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { MAX_OTP_ATTEMPTS, normalizeOtp, otpEqual } from "@/server/otp";
import { normalizeEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { email, otp } = await req.json();
    if (!email || !otp || typeof email !== "string" || typeof otp !== "string") {
      return NextResponse.json({ message: "Email and OTP are required." }, { status: 400 });
    }

    const normalizedEmail = normalizeEmail(email);

    // Find OTP record for this email
    const otpRecord = await prisma.oTP.findUnique({ where: { email: normalizedEmail } });
    if (!otpRecord) {
      return NextResponse.json({ message: "Invalid or expired OTP." }, { status: 401 });
    }

    // Check expiry and attempt limit
    if (
      otpRecord.expiresAt.getTime() < Date.now() ||
      otpRecord.attempts >= MAX_OTP_ATTEMPTS
    ) {
      return NextResponse.json({ message: "Invalid or expired OTP." }, { status: 401 });
    }

    // Constant-time comparison; count failed attempts to block brute force
    if (!otpEqual(otpRecord.code, normalizeOtp(otp))) {
      await prisma.oTP.update({
        where: { email: normalizedEmail },
        data: { attempts: { increment: 1 } },
      });
      return NextResponse.json({ message: "Invalid or expired OTP." }, { status: 401 });
    }

    // Do NOT delete OTP here, only verify it
    // Do not call prisma.oTP.delete or update

    // Authenticate user: create session via NextAuth
    // Find user
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
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
