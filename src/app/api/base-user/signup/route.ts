import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/server/db";
import { resolveSignupLinkByToken } from "@/server/registration/resolveSignupLink";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["PARENT", "TEACHER", "VOLUNTEER"]),
  token: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.errors[0]?.message || "Invalid input data" }, { status: 400 });
    }
    const { email, password, role, token } = parsed.data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ message: "An account with this email already exists. Please log in instead." }, { status: 400 });
    }

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
        role: role === "PARENT" ? "PARENT" : role, // "TEACHER" or "VOLUNTEER"
        organizationId,
        homeCampusId,
        active: true,
      },
    });

    return NextResponse.json({ success: true, userId: user.id });
  } catch (error) {
    console.error("Signup account creation error:", error);
    return NextResponse.json({ message: "Something went wrong during account creation." }, { status: 500 });
  }
}
