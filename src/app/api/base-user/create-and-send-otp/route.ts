import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/server/db";
import { sendOtpEmail } from "@/server/email/sendOtpEmail";
import { rateLimit } from "@/server/rateLimit";
import { normalizeEmail } from "@/lib/email";

const bodySchema = z.object({
  email: z.string().email(),
  token: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: "A valid email is required" }, { status: 400 });
  }
  const { email: rawEmail, token } = parsed.data;
  const email = normalizeEmail(rawEmail);

  // Throttle OTP sends / account creation per email
  if (!rateLimit(`send-otp:${email}`, 3, 15 * 60 * 1000)) {
    return NextResponse.json({ message: "Too many requests. Try again later." }, { status: 429 });
  }

  // Create PARENT if not exists
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Placeholder password: random and hashed so it can never be used to log in
    const placeholderPassword = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
    // Lookup signup link by token if provided (to get campus and organization)
    let organizationId = null;
    let homeCampusId = null
    if (token) {
      const [campusSlug] = token.split('_')
      const campus = await prisma.campus.findFirst({
        where: { slug: campusSlug },
      });
      if (campus) {
        organizationId = campus.organizationId;
        homeCampusId = campus.id;
      }
    }
    user = await prisma.user.create({
      data: {
        email,
        role: "PARENT",
        password: placeholderPassword,
        organizationId: organizationId || undefined,
        homeCampusId: homeCampusId || undefined,
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

  // Resolve org slug for the from address
  let orgSlug: string | undefined;
  if (user.organizationId) {
    const org = await prisma.organization.findUnique({ where: { id: user.organizationId }, select: { slug: true } });
    orgSlug = org?.slug ?? undefined;
  }

  // Best-effort delivery — the OTP is already persisted, so a transient email
  // failure (e.g. no RESEND_API_KEY configured) shouldn't block the flow.
  try {
    await sendOtpEmail(email, otp, orgSlug);
  } catch (e) {
    console.error("[base-user/create-and-send-otp] Failed to send OTP email", e);
  }

  return NextResponse.json({ success: true });
}
