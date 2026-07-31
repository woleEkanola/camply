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

    // This endpoint is shared by the parent/teacher/volunteer login flow
    // (send-otp, create-and-send-otp) and the staff-signup flow
    // (staff/send-otp) — neither passes which purpose it's verifying, so
    // check both. PASSWORD_RESET is deliberately excluded: that flow is
    // handled entirely by forgot-password/reset-password and a login
    // verification must never be satisfiable by a password-reset code.
    const otpRecord = await prisma.oTP.findFirst({
      where: { email: normalizedEmail, purpose: { in: ["LOGIN", "STAFF_SIGNUP"] } },
      orderBy: { expiresAt: "desc" },
    });
    if (!otpRecord) {
      return NextResponse.json({ message: "Invalid or expired OTP." }, { status: 401 });
    }
    const otpKey = { email_purpose: { email: normalizedEmail, purpose: otpRecord.purpose } };

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
        where: otpKey,
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
