import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/server/db";
import { sendOtpEmail } from "@/server/email/sendOtpEmail";
import { rateLimit } from "@/server/rateLimit";

// Generic response used regardless of whether the email exists, so this
// endpoint can't be used to enumerate registered accounts.
const GENERIC_OK = { message: "If the email is registered, an OTP has been sent." };

function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

export async function POST(req: NextRequest) {
  try {
    console.log("[SEND-OTP] Incoming request");
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      console.error("[SEND-OTP] Email missing or invalid", { email });
      return NextResponse.json({ message: "Email is required" }, { status: 400 });
    }

    // Throttle OTP sends per email
    if (!rateLimit(`send-otp:${email}`, 3, 15 * 60 * 1000)) {
      return NextResponse.json({ message: "Too many requests. Try again later." }, { status: 429 });
    }

    // Check if user exists with this email — respond identically either way
    // so the endpoint can't be used to probe for registered emails.
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.role !== "BASE_USER") {
      return NextResponse.json(GENERIC_OK, { status: 200 });
    }

    // Generate OTP and store it (optionally, with expiry)
    const otp = generateOtp();
    // Store OTP in DB (create a table for OTPs if not exists, or use a cache)
    try {
      await prisma.oTP.upsert({
        where: { email },
        update: { code: otp, expiresAt: new Date(Date.now() + 10 * 60 * 1000), attempts: 0 }, // 10 min expiry
        create: { email, code: otp, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
      });
      console.log("[SEND-OTP] OTP stored in DB", { email });
    } catch (err) {
      console.error("[SEND-OTP] Error storing OTP in DB", err);
      throw err;
    }

    // Send OTP email
    try {
      await sendOtpEmail(email, otp);
      console.log("[SEND-OTP] OTP email sent", { email });
    } catch (err) {
      console.error("[SEND-OTP] Error sending OTP email", err);
      throw err;
    }

    return NextResponse.json(GENERIC_OK, { status: 200 });
  } catch (error: any) {
    console.error("[SEND-OTP] Unhandled error", error);
    return NextResponse.json({ message: error.message || "Server error" }, { status: 500 });
  }
}
