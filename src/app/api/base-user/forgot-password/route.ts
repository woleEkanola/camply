import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/server/db";
import { sendOtpEmail } from "@/server/email/sendOtpEmail";
import { rateLimit } from "@/server/rateLimit";
import { normalizeEmail } from "@/lib/email";

// Generic response regardless of whether the email exists, so this endpoint
// can't be used to enumerate registered accounts.
const GENERIC_OK = { message: "If an account exists for this email, we've sent a password reset code." };

function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ message: "Email is required" }, { status: 400 });
    }

    const normalizedEmail = normalizeEmail(email);

    // Unlike login-OTP eligibility (parents/teachers/volunteers only), a
    // password reset is for the password-login roles (SUPER_ADMIN/OWNER/
    // ADMIN/CAMPUS_REPRESENTATIVE) — any active, non-deleted account with a
    // password on file can request one. Checked BEFORE the rate limit below
    // so a non-existent or ineligible email can never exhaust the bucket for
    // a real account that later needs it (see the same fix in send-otp).
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || user.deletedAt || !user.active || !user.password) {
      return NextResponse.json(GENERIC_OK, { status: 200 });
    }

    if (!rateLimit(`forgot-password:${normalizedEmail}`, 3, 15 * 60 * 1000)) {
      return NextResponse.json({ message: "Too many requests. Try again later." }, { status: 429 });
    }

    const otp = generateOtp();
    await prisma.oTP.upsert({
      where: { email: normalizedEmail },
      update: { code: otp, expiresAt: new Date(Date.now() + 10 * 60 * 1000), attempts: 0 },
      create: { email: normalizedEmail, code: otp, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    });

    try {
      await sendOtpEmail(normalizedEmail, otp);
    } catch (err) {
      console.error("[FORGOT-PASSWORD] Failed to send reset email", err);
      return NextResponse.json({ message: "Couldn't send the reset code. Please try again shortly." }, { status: 500 });
    }

    return NextResponse.json(GENERIC_OK, { status: 200 });
  } catch (error: any) {
    console.error("[FORGOT-PASSWORD] Unhandled error", error);
    return NextResponse.json({ message: error.message || "Server error" }, { status: 500 });
  }
}
