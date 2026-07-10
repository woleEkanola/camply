import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/server/db";
import { sendOtpEmail } from "@/server/email/sendOtpEmail";
import { rateLimit } from "@/server/rateLimit";

const bodySchema = z.object({
  email: z.string().email(),
  token: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: "A valid email is required" }, { status: 400 });
  }
  const { email, token } = parsed.data;

  if (!rateLimit(`staff-send-otp:${email}`, 3, 15 * 60 * 1000)) {
    return NextResponse.json({ message: "Too many requests. Try again later." }, { status: 429 });
  }

  const link = await prisma.staffSignupLink.findUnique({ where: { token } });
  if (!link || !link.active) {
    return NextResponse.json({ message: "Invalid or expired registration link" }, { status: 400 });
  }

  let user = await prisma.user.findUnique({ where: { email } });
  if (user && user.role !== link.type) {
    return NextResponse.json(
      { message: "This email is already registered with a different account type. Please use a different email or contact an admin." },
      { status: 409 }
    );
  }
  if (!user) {
    const placeholderPassword = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
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
    where: { email },
    update: { code: otp, expiresAt: new Date(Date.now() + 10 * 60 * 1000), attempts: 0 },
    create: { email, code: otp, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
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
