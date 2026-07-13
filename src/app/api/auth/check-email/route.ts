import { NextResponse } from "next/server";
import { prisma } from "@/server/db";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ message: "Email is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true },
    });

    return NextResponse.json({ exists: !!user });
  } catch {
    return NextResponse.json({ exists: false });
  }
}
