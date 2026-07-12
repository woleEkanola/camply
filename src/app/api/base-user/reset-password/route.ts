import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { hashPassword } from "@/lib/auth";
import { MAX_OTP_ATTEMPTS, otpEqual } from "@/server/otp";

const bodySchema = z.object({
  email: z.string().email(),
  otp: z.string().min(1, "Verification code is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.errors[0]?.message || "Invalid input" }, { status: 400 });
    }
    const { email, otp, newPassword } = parsed.data;

    const otpRecord = await prisma.oTP.findUnique({ where: { email } });
    if (!otpRecord) {
      return NextResponse.json({ message: "Invalid or expired code." }, { status: 401 });
    }
    if (otpRecord.expiresAt.getTime() < Date.now() || otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
      return NextResponse.json({ message: "Invalid or expired code." }, { status: 401 });
    }
    if (!otpEqual(otpRecord.code, otp)) {
      // Count the failed attempt so the code can't be brute-forced.
      await prisma.oTP.update({ where: { email }, data: { attempts: { increment: 1 } } });
      return NextResponse.json({ message: "Invalid or expired code." }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.deletedAt || !user.active || !user.password) {
      // Consume the OTP either way so it can't be retried against a
      // different outcome.
      await prisma.oTP.delete({ where: { email } }).catch(() => {});
      return NextResponse.json({ message: "Unable to reset password for this account." }, { status: 400 });
    }

    const hashed = await hashPassword(newPassword);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { password: hashed } }),
      prisma.oTP.delete({ where: { email } }),
    ]);

    return NextResponse.json({ message: "Password updated successfully." }, { status: 200 });
  } catch (error: any) {
    console.error("[RESET-PASSWORD] Unhandled error", error);
    return NextResponse.json({ message: error.message || "Server error" }, { status: 500 });
  }
}
