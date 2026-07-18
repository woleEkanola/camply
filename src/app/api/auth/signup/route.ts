import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/authOptions';
import { prisma } from '@/server/db';
import { resolveSignupLinkByToken } from '@/server/registration/resolveSignupLink';

// Define validation schema for signup request
const signupSchema = z.object({
  email: z.string().email('A valid email is required'),
  name: z.string().min(1, 'Name is required'),
  firstName: z.string().optional(),
  middleName: z.string().optional(),
  lastName: z.string().optional(),
  dob: z.string().optional(),
  gender: z.string().optional(),
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

    // Look up signup link by token to get org/campus/camp — handles both the
    // raw random-hex token and the {campus-slug}_{camp-slug} format the
    // admin UI's "Copy Link" button actually generates.
    const signupLink = await resolveSignupLinkByToken(prisma, token);
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

    // The parent must be the authenticated user from the session — use the
    // session's user ID directly (never look up by email, which can differ in case).
    let parent = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!parent) {
      return NextResponse.json({ message: 'User account not found' }, { status: 400 });
    }

    // A family is locked to one campus: every camper under a parent must share the
    // same homeCampus. Look up any existing (non-deleted) camper for this parent and
    // reject if the link being used points at a different campus. First-ever child →
    // no sibling → allowed (and seeds the campus anchor via the update below).
    const sibling = await prisma.camper.findFirst({
      where: { userId: parent.id, deletedAt: null, homeCampusId: { not: null } },
      select: { homeCampusId: true, homeCampus: { select: { name: true } } },
    });
    if (sibling?.homeCampusId && sibling.homeCampusId !== signupLink.campusId) {
      return NextResponse.json(
        {
          message: `Your family is already registered at ${sibling.homeCampus?.name ?? 'another campus'}. All of your children must be registered at the same campus — please use that campus's signup link to add another child.`,
          code: 'CAMPUS_MISMATCH',
        },
        { status: 409 }
      );
    }

    if (!parent.organizationId || !parent.homeCampusId) {
      parent = await prisma.user.update({
        where: { id: parent.id },
        data: { organizationId, homeCampusId: signupLink.campusId },
      });
    }

    // Create camper for this PARENT
    const camper = await prisma.camper.create({
      data: {
        name,
        firstName: result.data.firstName,
        middleName: result.data.middleName,
        lastName: result.data.lastName,
        userId: parent!.id,
        organizationId,
        homeCampusId: signupLink.campusId, // Campus of the link the parent is registering through, not the parent's earlier campus
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
