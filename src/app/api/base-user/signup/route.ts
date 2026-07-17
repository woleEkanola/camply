import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/server/db";
import { resolveSignupLinkByToken } from "@/server/registration/resolveSignupLink";
import { sendWelcomeEmail } from "@/server/email/sendWelcomeEmail";
import { normalizeEmail } from "@/lib/email";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["PARENT", "TEACHER", "VOLUNTEER"]),
  token: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.errors[0]?.message || "Invalid input data" }, { status: 400 });
    }
    const { email: rawEmail, password, role, token, firstName, lastName } = parsed.data;
    const email = normalizeEmail(rawEmail);

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ message: "An account with this email already exists. Please log in instead." }, { status: 400 });
    }

    // Generate email verification token
    const emailVerifyToken = crypto.randomBytes(32).toString("hex");

    // Resolve organization and campus from token if provided
    let organizationId: string | undefined;
    let homeCampusId: string | undefined;

    if (token) {
      if (role === "PARENT") {
        // Parent signup link token
        const signupLink = await resolveSignupLinkByToken(prisma, token);
        if (signupLink) {
          organizationId = signupLink.campus.organization?.id;
          homeCampusId = signupLink.campusId;
        }
      } else {
        // Staff signup link token
        const staffLink = await prisma.staffSignupLink.findUnique({
          where: { token },
        });
        if (staffLink) {
          organizationId = staffLink.organizationId;
        }
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: role === "PARENT" ? "PARENT" : role,
        organizationId,
        homeCampusId,
        active: true,
        firstName,
        lastName,
        emailVerifyToken,
      },
    });

    // Send welcome email with verification link (non-blocking)
    sendWelcomeEmail(email, firstName || email.split("@")[0], emailVerifyToken, organizationId).catch(() => {});

    return NextResponse.json({ success: true, userId: user.id, verifyToken: emailVerifyToken });
  } catch (error) {
    console.error("Signup account creation error:", error);
    return NextResponse.json({ message: "Something went wrong during account creation." }, { status: 500 });
  }
}
