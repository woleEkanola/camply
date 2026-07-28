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

  // For an existing account, only mint a login OTP for the roles that are
  // actually meant to authenticate via OTP — matching the restriction
  // send-otp/route.ts enforces. Without this, requesting an OTP for an
  // existing SUPER_ADMIN/OWNER/ADMIN/CAMPUS_REPRESENTATIVE email here would
  // hand out a passwordless login code for an admin account, defeating that
  // restriction. Responds identically to the success path (no OTP sent, no
  // error) so this can't be used to distinguish admin accounts from
  // nonexistent ones.
  if (user && !["PARENT", "TEACHER", "VOLUNTEER"].includes(user.role)) {
    return NextResponse.json({ success: true });
  }

  if (!user) {
    // Row creation requires a token that resolves to a real campus — this
    // is an unauthenticated endpoint, so without this gate any
    // attacker-supplied email creates a real User row regardless of whether
    // they were ever on a genuine signup link (the existing per-email rate
    // limit above throttles repeat calls but doesn't stop a single call
    // from creating one).
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
    if (!organizationId || !homeCampusId) {
      return NextResponse.json({ message: "Invalid or expired registration link" }, { status: 400 });
    }

    // Placeholder password: random and hashed so it can never be used to log in
    const placeholderPassword = await hashPassword(crypto.randomBytes(32).toString("hex"));
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
    where: { email_purpose: { email, purpose: "LOGIN" } },
    update: { code: otp, expiresAt, attempts: 0 },
    create: { email, purpose: "LOGIN", code: otp, expiresAt },
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
