import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { sendOtpEmail } from "@/server/email/sendOtpEmail";

const prisma = new PrismaClient();

// Utility: Generate a 6-digit OTP
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: NextRequest) {
  try {
    console.log("[SEND-OTP] Incoming request");
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      console.error("[SEND-OTP] Email missing or invalid", { email });
      return NextResponse.json({ message: "Email is required" }, { status: 400 });
    }

    // Check if user exists with this email
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.error("[SEND-OTP] No user found with email", { email });
      return NextResponse.json({ message: "No user found with this email." }, { status: 404 });
    }

    // Generate OTP and store it (optionally, with expiry)
    const otp = generateOtp();
    // Store OTP in DB (create a table for OTPs if not exists, or use a cache)
    try {
      await prisma.oTP.upsert({
        where: { email },
        update: { code: otp, expiresAt: new Date(Date.now() + 10 * 60 * 1000) }, // 10 min expiry
        create: { email, code: otp, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
      });
      console.log("[SEND-OTP] OTP stored in DB", { email, otp });
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

    return NextResponse.json({ message: "OTP sent if email is correct." }, { status: 200 });
  } catch (error: any) {
    console.error("[SEND-OTP] Unhandled error", error);
    return NextResponse.json({ message: error.message || "Server error" }, { status: 500 });
  }
}
