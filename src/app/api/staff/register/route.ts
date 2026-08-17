import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/authOptions";
import { prisma } from "@/server/db";
import { validateFormFields } from "@/server/registration/validateFormFields";
import { assertDepartmentHasCapacity, DepartmentCapacityError } from "@/server/staff/departmentCapacity";
import { isDuplicateStaffProfileError } from "@/server/staff/registerGuards";
import { normalizeEmail } from "@/lib/email";
import { normalizeGender } from "@/lib/gender";

const bodySchema = z.object({
  token: z.string().min(1),
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  preferredName: z.string().optional(),
  gender: z.string().optional(),
  dateOfBirth: z.string().optional(),
  phone: z.string().min(1),
  photoUrl: z.string().optional(),

  church: z.string().optional(),
  churchDepartment: z.string().optional(),
  yearsServing: z.string().optional(),
  workerStatus: z.string().optional(),

  previousCampExperience: z.string().optional(),
  areasOfStrength: z.string().optional(),
  preferredAgeGroup: z.string().optional(),
  preferredCampusId: z.string().optional(),
  preferredTribeId: z.string().optional(),
  departmentId: z.string().optional(),

  volunteerCategory: z.string().optional(),
  teams: z.array(z.string()).optional(),

  skills: z.array(z.string()).optional(),
  availability: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  emergencyContactRelationship: z.string().optional(),
  medicalConditions: z.string().optional(),
  allergies: z.string().optional(),

  fieldValues: z.array(z.object({ fieldId: z.string(), value: z.string() })).optional(),
});

export async function POST(request: Request) {
  // Hoisted so the catch block below (the unique-index race backstop) can
  // re-derive the existing profile without re-parsing the already-consumed
  // request body.
  let userId: string | undefined;
  let campId: string | undefined;

  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: "Invalid input data", errors: parsed.error.errors }, { status: 400 });
    }
    const { token, email: rawEmail, fieldValues, dateOfBirth, ...rest } = parsed.data;
    const email = normalizeEmail(rawEmail);

    // The caller must be signed in as the account this staff profile is being
    // created for. The wizard completes OTP verification + signIn before
    // hitting this route; without this check, anyone could POST an arbitrary
    // `email` and create a teacher/volunteer profile under another user.
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || session.user.email.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const link = await prisma.staffSignupLink.findUnique({
      where: { token },
      include: { camp: { include: { organization: { select: { activeCampId: true } } } } },
    });
    if (!link || !link.active) {
      return NextResponse.json({ message: "Invalid or expired registration link" }, { status: 400 });
    }
    if (!link.camp.active) {
      return NextResponse.json({ message: "Registration for this camp is not currently open" }, { status: 403 });
    }
    if (link.camp.organization.activeCampId !== link.campId) {
      return NextResponse.json(
        { message: "This registration link belongs to a previous camp. Please ask an administrator for the current teacher registration link." },
        { status: 409 }
      );
    }

    // Only existence is required. The role-equality check that used to be here
    // rejected any user whose primary role differed from the link type, which
    // blocked parents from ever becoming teachers — and it was redundant as a
    // security control: the getServerSession check above already proves the
    // caller owns this email, which is what stops profiles being attached to
    // someone else's account.
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ message: "Please verify your email or log in first" }, { status: 400 });
    }
    userId = user.id;
    campId = link.campId;

    const submittedValues: Record<string, unknown> = { ...rest, dateOfBirth };
    for (const fv of fieldValues || []) {
      submittedValues[fv.fieldId] = fv.value;
    }
    const fieldFailures = await validateFormFields(prisma, link.organizationId, link.type, submittedValues);
    if (fieldFailures.length > 0) {
      return NextResponse.json(
        { message: `Missing required field(s): ${fieldFailures.map((f) => f.label).join(", ")}`, fields: fieldFailures },
        { status: 400 }
      );
    }

    // Everything that decides whether a profile gets created — the duplicate
    // re-check, the teacher quota check, and the department capacity check —
    // now runs INSIDE the same transaction as the create, and returns a
    // result instead of throwing wherever possible. At READ COMMITTED this
    // narrows the race window (two concurrent submits can no longer both
    // observe "no existing profile" and then both insert outside any lock)
    // but doesn't fully close it on its own — the real backstop is the
    // partial unique index `StaffProfile_userId_campId_key`, caught below via
    // isDuplicateStaffProfileError. On a database missing that index (see
    // registerGuards.ts's comment) there is still no backstop at all; that
    // gap is what B2's index-health probe surfaces to admins.
    //
    // The teacher campus quota check has the same count-then-create shape and
    // the same narrowing (not closing) property — fully closing it would need
    // a real constraint behind it, which is out of scope here.
    type RegisterOutcome =
      | { kind: "existing"; staffProfileId: string }
      | { kind: "quota" }
      | { kind: "created"; staffProfileId: string };

    const outcome = await prisma.$transaction(async (tx): Promise<RegisterOutcome> => {
      const existing = await tx.staffProfile.findFirst({
        where: { userId: user.id, campId: link.campId, deletedAt: null },
      });
      if (existing) {
        return { kind: "existing", staffProfileId: existing.id };
      }

      if (link.type === "TEACHER" && rest.preferredCampusId) {
        const quota = await tx.teacherCampusQuota.findUnique({
          where: {
            campId_campusId: { campId: link.campId, campusId: rest.preferredCampusId },
          },
        });
        if (quota && quota.quota > 0) {
          const usedCount = await tx.staffProfile.count({
            where: {
              campId: link.campId,
              preferredCampusId: rest.preferredCampusId,
              type: "TEACHER",
              deletedAt: null,
              status: { in: ["APPROVED", "PENDING"] },
            },
          });
          if (usedCount >= quota.quota) {
            return { kind: "quota" };
          }
        }
      }

      if (rest.departmentId) {
        await assertDepartmentHasCapacity(tx, rest.departmentId);
      }

      // Sync names to User record
      await tx.user.update({
        where: { id: user.id },
        data: {
          firstName: rest.firstName,
          lastName: rest.lastName,
        },
      });
      const profile = await tx.staffProfile.create({
        data: {
          userId: user.id,
          organizationId: link.organizationId,
          campId: link.campId,
          type: link.type,
          status: "PENDING",
          email,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
          ...rest,
          gender: normalizeGender(rest.gender),
          preferredDepartmentId: rest.departmentId || null,
          fieldValues: {
            create: (fieldValues || []).map((fv) => ({ value: fv.value, field: { connect: { id: fv.fieldId } } })),
          },
        },
      });
      return { kind: "created", staffProfileId: profile.id };
    });

    if (outcome.kind === "existing") {
      return NextResponse.json(
        { message: "You have already registered for this camp", staffProfileId: outcome.staffProfileId },
        { status: 200 }
      );
    }
    if (outcome.kind === "quota") {
      return NextResponse.json(
        {
          message: "The teacher quota for this campus has been reached. Registration is currently closed for this campus.",
          code: "TEACHER_CAMPUS_QUOTA_REACHED",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ message: "Registration submitted", staffProfileId: outcome.staffProfileId }, { status: 201 });
  } catch (error) {
    if (error instanceof DepartmentCapacityError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    if (isDuplicateStaffProfileError(error) && userId && campId) {
      // The in-transaction re-check above lost a genuine race — the unique
      // index caught what it missed. Same graceful response as the "existing"
      // branch, not the generic 500 this used to fall into.
      const existing = await prisma.staffProfile.findFirst({
        where: { userId, campId, deletedAt: null },
      });
      if (existing) {
        return NextResponse.json(
          { message: "You have already registered for this camp", staffProfileId: existing.id },
          { status: 200 }
        );
      }
    }
    console.error("Staff registration error:", error);
    return NextResponse.json({ message: "Something went wrong during registration" }, { status: 500 });
  }
}
