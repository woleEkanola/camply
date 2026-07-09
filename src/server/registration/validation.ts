import type { Prisma, PrismaClient } from "@prisma/client";

type TxClient = PrismaClient | Prisma.TransactionClient;

export interface ValidationFailure {
  step: string;
  code: string;
  message: string;
}

export class RegistrationValidationError extends Error {
  failures: ValidationFailure[];
  constructor(failures: ValidationFailure[]) {
    super(failures.map((f) => f.message).join("; "));
    this.name = "RegistrationValidationError";
    this.failures = failures;
  }
}

export function calculateAge(dateOfBirth: Date, cutoffDate: Date): number {
  let age = cutoffDate.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = cutoffDate.getMonth() - dateOfBirth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && cutoffDate.getDate() < dateOfBirth.getDate())) {
    age--;
  }
  return age;
}

/**
 * Runs the full submission validation pipeline (PRD Part 4 §5).
 * Returns every failure found rather than stopping at the first one,
 * so parents/admins see the complete picture in one pass.
 */
export async function validateSubmission(
  tx: TxClient,
  params: { registrationId: string; parentUserId?: string }
): Promise<ValidationFailure[]> {
  const failures: ValidationFailure[] = [];

  const registration = await tx.registration.findUnique({
    where: { id: params.registrationId },
    include: {
      camperProfile: {
        include: { fieldValues: { include: { field: true } }, documents: true },
      },
      year: { include: { documentRequirements: true } },
      location: true,
      documents: true,
    },
  });

  if (!registration) {
    return [{ step: "registration", code: "NOT_FOUND", message: "Registration not found." }];
  }

  const { camperProfile, year, location } = registration;

  // Step 1: Camp
  if (year.status !== "OPEN") {
    failures.push({ step: "camp", code: "CAMP_NOT_OPEN", message: "Registration is not currently open for this camp." });
  } else {
    const now = new Date();
    if (year.registrationOpensAt && now < year.registrationOpensAt) {
      failures.push({ step: "camp", code: "REGISTRATION_NOT_OPEN_YET", message: "Registration has not opened yet." });
    }
    if (year.registrationClosesAt && now > year.registrationClosesAt) {
      failures.push({ step: "camp", code: "REGISTRATION_CLOSED", message: "Registration has closed." });
    }
  }

  // Step 2: Parent
  if (params.parentUserId && camperProfile.userId !== params.parentUserId) {
    failures.push({ step: "parent", code: "NOT_OWNER", message: "You do not have permission to submit this registration." });
  }

  // Step 3: Camper profile completeness
  if (!camperProfile.firstName || !camperProfile.lastName) {
    failures.push({ step: "camper", code: "INCOMPLETE_PROFILE", message: "Camper's first and last name are required." });
  }
  if (!camperProfile.dateOfBirth) {
    failures.push({ step: "camper", code: "MISSING_DOB", message: "Camper's date of birth is required." });
  }

  // Step 4: Age validation (computed at cutoff date, not today)
  if (camperProfile.dateOfBirth && (year.minAge != null || year.maxAge != null)) {
    const cutoff = year.ageCutoffDate ?? year.startDate;
    const age = calculateAge(camperProfile.dateOfBirth, cutoff);
    if (year.minAge != null && age < year.minAge) {
      failures.push({ step: "age", code: "TOO_YOUNG", message: `Camper does not meet the minimum age requirement of ${year.minAge}.` });
    }
    if (year.maxAge != null && age > year.maxAge) {
      failures.push({ step: "age", code: "TOO_OLD", message: `Camper exceeds the maximum age requirement of ${year.maxAge}.` });
    }
  }

  // Step 5: Centre validation
  if (!location.visible || !location.signupOpen) {
    failures.push({ step: "centre", code: "CENTRE_CLOSED", message: "This centre is not currently accepting registrations." });
  } else if (location.quota > 0) {
    const approvedCount = await tx.registration.count({
      where: { locationId: location.id, status: "APPROVED" },
    });
    if (approvedCount >= location.quota && location.fullBehavior === "CLOSE") {
      failures.push({ step: "centre", code: "CENTRE_FULL", message: "This centre has reached capacity." });
    }
  }

  // Step 6: Duplicate detection (also enforced by a DB unique constraint)
  const duplicate = await tx.registration.findFirst({
    where: {
      camperProfileId: camperProfile.id,
      yearId: year.id,
      id: { not: registration.id },
      status: { notIn: ["CANCELLED", "REJECTED", "ARCHIVED"] },
    },
  });
  if (duplicate) {
    failures.push({ step: "duplicate", code: "DUPLICATE_REGISTRATION", message: "This camper already has a registration for this camp." });
  }

  // Step 7: Custom fields
  const orgFields = await tx.profileField.findMany({ where: { organizationId: camperProfile.organizationId } });
  const valuesByFieldId = new Map(camperProfile.fieldValues.map((v) => [v.fieldId, v.value]));
  for (const field of orgFields) {
    if (field.required && !valuesByFieldId.get(field.id)) {
      failures.push({ step: "custom_fields", code: "MISSING_FIELD", message: `"${field.label}" is required.` });
    }
  }

  // Step 8: Document validation
  for (const req of year.documentRequirements) {
    if (!req.required) continue;
    const hasDoc =
      req.scope === "CAMPER"
        ? camperProfile.documents.some((d) => d.requirementId === req.id && d.status !== "REJECTED")
        : registration.documents.some((d) => d.requirementId === req.id && d.status !== "REJECTED");
    if (!hasDoc) {
      failures.push({ step: "documents", code: "MISSING_DOCUMENT", message: `"${req.name}" is required.` });
    }
  }

  return failures;
}
