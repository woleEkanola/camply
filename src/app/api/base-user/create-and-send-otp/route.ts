import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { sendOtpEmail } from "@/server/email/sendOtpEmail";

export async function POST(req: NextRequest) {
  const { email, token } = await req.json();
  if (!email) {
    return NextResponse.json({ message: "Email is required" }, { status: 400 });
  }

  // Create BASE_USER if not exists
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Use a secure random string as a placeholder password
    const placeholderPassword = Math.random().toString(36).slice(-12) + Date.now();
    // Lookup signup link by token if provided (to get location and organization)
    let organizationId = null;
    let locationId = null
    if (token) {
      console.log('errrrrrr', token)
      const [locationName, year]= token.split('_')
      const location = await prisma.location.findFirst({
        where: { slug: locationName },
      });
      console.log('locationxxxx', location?.organizationId)
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

  // Generate OTP (simple example, use a secure method in production)
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

  // Save OTP to database (associate with user/email)
  await prisma.oTP.upsert({
    where: { email },
    update: { code: otp, expiresAt },
    create: { email, code: otp, expiresAt },
  });

  // Send OTP to email
  await sendOtpEmail(email, otp);

  return NextResponse.json({ success: true });
}
