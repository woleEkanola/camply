import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Utility: Generate a 6-digit OTP
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Utility: Send OTP email using nodemailer (or your preferred email service)
import nodemailer from "nodemailer";

async function sendOtpEmail(email: string, otp: string) {
  // Configure your transport (example: Gmail SMTP, ideally use environment variables)
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true" || false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: "Your OTP Code",
    text: `Your OTP code is: ${otp}`,
    html: `<p>Your OTP code is: <b>${otp}</b></p>`
  });
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
    if (user.role !== "BASE_USER") {
      return NextResponse.json({ message: "User is not a base user." }, { status: 403 });
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
