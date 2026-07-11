import { NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/authOptions';
import { prisma } from '@/server/db';

// Define validation schema for signup request
const signupSchema = z.object({
  email: z.string().email('A valid email is required'),
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
    
    const { email, name, dob, gender, token, fieldValues } = result.data;

    // The caller must be signed in as the very account this camper is being
    // created under. The client always completes OTP verification + signIn
    // before hitting this route; without this check, anyone could POST an
    // arbitrary `email` and attach a camper (and its registration) to any
    // other user's account by knowing only a valid signup-link token.
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || session.user.email.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Look up signup link by token to get org/campus/camp
    const signupLink = await prisma.signupLink.findUnique({
      where: { token },
      include: { campus: { include: { organization: true } }, camp: true },
    });
    if (!signupLink || !signupLink.active) {
      return NextResponse.json({ message: 'Invalid or expired signup link' }, { status: 400 });
    }
    if (!signupLink.campus.signupOpen) {
      return NextResponse.json({ message: 'Signup is currently closed for this campus' }, { status: 403 });
    }

    // Get organizationId from signupLink.campus.organization.id
    const organizationId = signupLink.campus.organization?.id;
    if (!organizationId) {
      return NextResponse.json({ message: 'Organization not found for this signup link/campus.' }, { status: 400 });
    }

    // The parent must be the exact user who verified OTP for this email —
    // never guess by picking "the most recently created user at this campus".
    let parent = await prisma.user.findUnique({ where: { email } });
    if (!parent) {
      // Should already exist from the OTP step, but create defensively.
      const placeholderPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
      parent = await prisma.user.create({
        data: {
          role: 'PARENT',
          organizationId,
          homeCampusId: signupLink.campusId,
          email,
          password: placeholderPassword,
          active: true,
        },
      });
    } else if (!parent.organizationId || !parent.homeCampusId) {
      parent = await prisma.user.update({
        where: { id: parent.id },
        data: { organizationId, homeCampusId: signupLink.campusId },
      });
    }

    // Create camper for this PARENT
    const camper = await prisma.camper.create({
      data: {
        name,
        userId: parent!.id,
        organizationId,
        homeCampusId: parent!.homeCampusId, // Always use campus from parent account
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

    // Optionally, update user role from PARENT to CAMPER (if you want to promote the user after first profile)
    // await prisma.user.update({
    //   where: { id: parent.id },
    //   data: { role: 'CAMPER' },
    // });

    return NextResponse.json(
      { message: 'User profile completed and camper created', camperId: camper.id },
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
