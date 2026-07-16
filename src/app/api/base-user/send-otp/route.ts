import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/server/db";
import { sendOtpEmail } from "@/server/email/sendOtpEmail";
import { rateLimit } from "@/server/rateLimit";
import { normalizeEmail } from "@/lib/email";

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

    const normalizedEmail = normalizeEmail(email);

    // Check if user exists with this email — respond identically either way
    // so the endpoint can't be used to probe for registered emails. Deliberately
    // checked BEFORE the rate limit below: password-login accounts (admin/
    // owner/campus-rep) hit this branch on every single login attempt via the
    // /login page (it opportunistically calls this endpoint on every email
    // step submit), so if the rate limit were checked first, enough repeated
    // logins would exhaust it and start blocking accounts that never needed an
    // OTP in the first place — this happened in practice across the Playwright
    // suite's dozens of loginWithPassword() calls against the same seeded
    // admin/owner accounts. Only real OTP-eligible sends below are throttled.
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || !["PARENT", "TEACHER", "VOLUNTEER"].includes(user.role)) {
      return NextResponse.json(GENERIC_OK, { status: 200 });
    }

    // Throttle OTP sends per email
    if (!rateLimit(`send-otp:${normalizedEmail}`, 3, 15 * 60 * 1000)) {
      return NextResponse.json({ message: "Too many requests. Try again later." }, { status: 429 });
    }

    // Generate OTP and store it (optionally, with expiry)
    const otp = generateOtp();
    // Store OTP in DB (create a table for OTPs if not exists, or use a cache)
    try {
      await prisma.oTP.upsert({
        where: { email: normalizedEmail },
        update: { code: otp, expiresAt: new Date(Date.now() + 10 * 60 * 1000), attempts: 0 }, // 10 min expiry
        create: { email: normalizedEmail, code: otp, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
      });
      console.log("[SEND-OTP] OTP stored in DB", { email: normalizedEmail });
    } catch (err) {
      console.error("[SEND-OTP] Error storing OTP in DB", err);
      throw err;
    }

    // Resolve org slug for the from address
    let orgSlug: string | undefined;
    if (user.organizationId) {
      const org = await prisma.organization.findUnique({ where: { id: user.organizationId }, select: { slug: true } });
      orgSlug = org?.slug ?? undefined;
    }

    // Best-effort delivery — the OTP is already persisted above, so a
    // transient email failure (e.g. no RESEND_API_KEY configured locally)
    // shouldn't block the flow, matching create-and-send-otp/route.ts.
    try {
      await sendOtpEmail(normalizedEmail, otp, orgSlug);
      console.log("[SEND-OTP] OTP email sent", { email: normalizedEmail });
    } catch (err) {
      console.error("[SEND-OTP] Error sending OTP email", err);
    }

    return NextResponse.json(GENERIC_OK, { status: 200 });
  } catch (error: any) {
    console.error("[SEND-OTP] Unhandled error", error);
    return NextResponse.json({ message: error.message || "Server error" }, { status: 500 });
  }
}
