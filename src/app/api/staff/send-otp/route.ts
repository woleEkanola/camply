import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/server/db";
import { sendOtpEmail } from "@/server/email/sendOtpEmail";
import { rateLimit } from "@/server/rateLimit";
import { normalizeEmail } from "@/lib/email";
import { hashPassword } from "@/lib/auth";

const bodySchema = z.object({
  email: z.string().email(),
  token: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: "A valid email is required" }, { status: 400 });
  }
  const { email: rawEmail, token } = parsed.data;
  const email = normalizeEmail(rawEmail);

  if (!rateLimit(`staff-send-otp:${email}`, 3, 15 * 60 * 1000)) {
    return NextResponse.json({ message: "Too many requests. Try again later." }, { status: 429 });
  }

  const link = await prisma.staffSignupLink.findUnique({ where: { token } });
  if (!link || !link.active) {
    return NextResponse.json({ message: "Invalid or expired registration link" }, { status: 400 });
  }

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const placeholderPassword = await hashPassword(crypto.randomBytes(32).toString("hex"));
    user = await prisma.user.create({
      data: {
        email,
        role: link.type,
        password: placeholderPassword,
        organizationId: link.organizationId,
      },
    });
  }

  const otp = crypto.randomInt(100000, 1000000).toString();
  await prisma.oTP.upsert({
    where: { email_purpose: { email, purpose: "STAFF_SIGNUP" } },
    update: { code: otp, expiresAt: new Date(Date.now() + 10 * 60 * 1000), attempts: 0 },
    create: { email, purpose: "STAFF_SIGNUP", code: otp, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
  });

  // Best-effort delivery — the OTP is already persisted, so a transient email
  // failure (e.g. no RESEND_API_KEY configured) shouldn't block the flow.
  try {
    await sendOtpEmail(email, otp);
  } catch (e) {
    console.error("[staff/send-otp] Failed to send OTP email", e);
  }

  return NextResponse.json({ success: true });
}
