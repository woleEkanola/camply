import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/server/db";
import { sendOtpEmail } from "@/server/email/sendOtpEmail";
import { rateLimit } from "@/server/rateLimit";

const bodySchema = z.object({
  email: z.string().email(),
  token: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: "A valid email is required" }, { status: 400 });
  }
  const { email, token } = parsed.data;

  // Throttle OTP sends / account creation per email
  if (!rateLimit(`send-otp:${email}`, 3, 15 * 60 * 1000)) {
    return NextResponse.json({ message: "Too many requests. Try again later." }, { status: 429 });
  }

  // Create BASE_USER if not exists
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Placeholder password: random and hashed so it can never be used to log in
    const placeholderPassword = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
    // Lookup signup link by token if provided (to get location and organization)
    let organizationId = null;
    let locationId = null
    if (token) {
      const [locationName] = token.split('_')
      const location = await prisma.location.findFirst({
        where: { slug: locationName },
      });
      if (location) {
        organizationId = location.organizationId;
        locationId = location.id;
      }
    }
    user = await prisma.user.create({
      data: {
        email,
        role: "BASE_USER",
        password: placeholderPassword,
        organizationId: organizationId || undefined,
        locationId: locationId || undefined,
        // Add other fields as needed
      },
    });
  }

  const otp = crypto.randomInt(100000, 1000000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

  // Save OTP to database (associate with user/email)
  await prisma.oTP.upsert({
    where: { email },
    update: { code: otp, expiresAt, attempts: 0 },
    create: { email, code: otp, expiresAt },
  });

  // Send OTP to email
  await sendOtpEmail(email, otp);

  return NextResponse.json({ success: true });
}
