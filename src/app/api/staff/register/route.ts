import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/authOptions";
import { prisma } from "@/server/db";
import { validateFormFields } from "@/server/registration/validateFormFields";
import { assertDepartmentHasCapacity, DepartmentCapacityError } from "@/server/staff/departmentCapacity";
import { normalizeEmail } from "@/lib/email";

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

    const link = await prisma.staffSignupLink.findUnique({ where: { token }, include: { camp: true } });
    if (!link || !link.active) {
      return NextResponse.json({ message: "Invalid or expired registration link" }, { status: 400 });
    }
    if (!link.camp.active) {
      return NextResponse.json({ message: "Registration for this camp is not currently open" }, { status: 403 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.role !== link.type) {
      return NextResponse.json({ message: "Please verify your email with OTP first" }, { status: 400 });
    }

    const existing = await prisma.staffProfile.findFirst({
      where: { userId: user.id, campId: link.campId, deletedAt: null },
    });
    if (existing) {
      return NextResponse.json({ message: "You have already registered for this camp", staffProfileId: existing.id }, { status: 200 });
    }

    // Teacher campus quota enforcement (teacher recruitment only).
    if (link.type === "TEACHER" && rest.preferredCampusId) {
      const quota = await prisma.teacherCampusQuota.findUnique({
        where: {
          campId_campusId: { campId: link.campId, campusId: rest.preferredCampusId },
        },
      });
      if (quota && quota.quota > 0) {
        const usedCount = await prisma.staffProfile.count({
          where: {
            campId: link.campId,
            preferredCampusId: rest.preferredCampusId,
            type: "TEACHER",
            deletedAt: null,
            status: { in: ["APPROVED", "PENDING"] },
          },
        });
        if (usedCount >= quota.quota) {
          return NextResponse.json(
            {
              message: "The teacher quota for this campus has been reached. Registration is currently closed for this campus.",
              code: "TEACHER_CAMPUS_QUOTA_REACHED",
            },
            { status: 409 }
          );
        }
      }
    }

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

    // Transactional so the department capacity check below (row-locked
    // re-count) and the profile creation commit atomically — otherwise two
    // concurrent applicants could both pass the check and both land in the
    // last slot of a capped department.
    const profile = await prisma.$transaction(async (tx) => {
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
      return tx.staffProfile.create({
        data: {
          userId: user.id,
          organizationId: link.organizationId,
          campId: link.campId,
          type: link.type,
          status: "PENDING",
          email,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
          ...rest,
          fieldValues: {
            create: (fieldValues || []).map((fv) => ({ value: fv.value, field: { connect: { id: fv.fieldId } } })),
          },
        },
      });
    });

    return NextResponse.json({ message: "Registration submitted", staffProfileId: profile.id }, { status: 201 });
  } catch (error) {
    if (error instanceof DepartmentCapacityError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    console.error("Staff registration error:", error);
    return NextResponse.json({ message: "Something went wrong during registration" }, { status: 500 });
  }
}
