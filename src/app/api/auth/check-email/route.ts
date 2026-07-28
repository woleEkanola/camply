import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { rateLimit } from "@/server/rateLimit";

// Genuinely unauthenticated by necessity — the registration wizard's
// EmailGate calls this before a parent has any session, to decide whether to
// show the new-account or returning-user form. That means it's also an
// account-existence oracle with no anti-enumeration story of its own (unlike
// send-otp/forgot-password, which respond identically either way); the best
// available mitigation without breaking the flow is the same per-email rate
// limit those routes already apply.
export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ message: "Email is required" }, { status: 400 });
    }
    const normalized = email.toLowerCase().trim();

    if (!rateLimit(`check-email:${normalized}`, 10, 15 * 60 * 1000)) {
      return NextResponse.json({ message: "Too many requests. Try again later." }, { status: 429 });
    }

    const user = await prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true },
    });

    return NextResponse.json({ exists: !!user });
  } catch {
    return NextResponse.json({ exists: false });
  }
}
