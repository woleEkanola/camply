import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/server/db';

// Define validation schema for signup request
const signupSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  dob: z.string().min(1, 'Date of birth is required'),
  gender: z.string().min(1, 'Gender is required'),
  token: z.string().min(1, 'Token is required'),
  fieldValues: z.array(z.object({ fieldId: z.string(), value: z.string() })).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Validate request body
    const result = signupSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { message: 'Invalid input data', errors: result.error.errors },
        { status: 400 }
      );
    }
    
    const { name, dob, gender, token, fieldValues } = result.data;

    // Look up signup link by token to get org/location/year
    const signupLink = await prisma.signupLink.findUnique({
      where: { token },
      include: { location: { include: { organization: true } }, year: true },
    });
    if (!signupLink) {
      return NextResponse.json({ message: 'Invalid or expired signup link' }, { status: 400 });
    }

    // Get organizationId from signupLink.location.organization.id
    const organizationId = signupLink.location.organization?.id;
    console.log('DEBUG organizationId:', organizationId);
    console.log('DEBUG signupLink.location:', signupLink.location);
    if (!organizationId) {
      return NextResponse.json({ message: 'Organization not found for this signup link/location.' }, { status: 400 });
    }

    // Find the BASE_USER for this org/location. You may want to improve this lookup using email if available.
    let baseUser = await prisma.user.findFirst({
      where: {
        role: 'BASE_USER',
        organizationId,
        locationId: signupLink.locationId, // Ensure correct location
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!baseUser) {
      // If not found, create one for this location
      baseUser = await prisma.user.create({
        data: {
          role: 'ADMIN', // Use a valid role according to your Prisma schema
          organizationId: signupLink.location.organization?.id,
          locationId: signupLink.locationId,
          email: `baseuser_${signupLink.locationId}_${Date.now()}@example.com`, // Placeholder email
          password: 'placeholder', // Set a secure placeholder or OTP
          active: true,
        },
      });
      // Fetch user again to ensure relation is hydrated
      baseUser = await prisma.user.findUnique({
        where: { id: baseUser.id },
        include: { location: true },
      });
    }
    console.log('DEBUG baseUser:', baseUser);

    // Create camper profile for this BASE_USER
    const camperProfile = await prisma.camperProfile.create({
      data: {
        name,
        userId: baseUser!.id,
        organizationId,
        locationId: baseUser!.locationId, // Always use location from base user
        dateOfBirth: dob ? new Date(dob) : undefined, // Ensure ISO DateTime
        gender,
        active: true,
        fieldValues: {
          create: (fieldValues || []).map((fv: any) => ({
            value: fv.value,
            field: { connect: { id: fv.fieldId } },
          })),
        },
      },
    });
    console.log('DEBUG camperProfile created:', camperProfile);

    // Optionally, update user role from BASE_USER to CAMPER (if you want to promote the user after first profile)
    // await prisma.user.update({
    //   where: { id: baseUser.id },
    //   data: { role: 'CAMPER' },
    // });

    return NextResponse.json(
      { message: 'User profile completed and camper profile created', camperProfileId: camperProfile.id },
      { status: 201 }
    );
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { message: 'Something went wrong during signup' },
      { status: 500 }
    );
  }
}
