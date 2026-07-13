import type { Prisma, PrismaClient } from "@prisma/client";
import { validateFormFields } from "./validateFormFields";

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
      camper: {
        include: { fieldValues: { include: { field: true } }, documents: true },
      },
      camp: { include: { documentRequirements: true } },
      campus: true,
      documents: true,
    },
  });

  if (!registration) {
    return [{ step: "registration", code: "NOT_FOUND", message: "Registration not found." }];
  }

  const { camper, camp, campus } = registration;

  // Step 1: Camp
  if (camp.status !== "OPEN") {
    failures.push({ step: "camp", code: "CAMP_NOT_OPEN", message: "Registration is not currently open for this camp." });
  } else {
    const now = new Date();
    if (camp.registrationOpensAt && now < camp.registrationOpensAt) {
      failures.push({ step: "camp", code: "REGISTRATION_NOT_OPEN_YET", message: "Registration has not opened yet." });
    }
    if (camp.registrationClosesAt && now > camp.registrationClosesAt) {
      failures.push({ step: "camp", code: "REGISTRATION_CLOSED", message: "Registration has closed." });
    }
  }

  // Step 2: Parent
  if (params.parentUserId && camper.userId !== params.parentUserId) {
    failures.push({ step: "parent", code: "NOT_OWNER", message: "You do not have permission to submit this registration." });
  }

  // Step 3: Camper profile completeness — driven by admin-configured FormFields
  // (system fields like name/dateOfBirth/gender bind to real columns; custom
  // fields bind to fieldValues), rather than a hardcoded field list.
  const submittedValues: Record<string, unknown> = { ...camper };
  for (const fv of camper.fieldValues) {
    const key = fv.field?.source === "SYSTEM" ? fv.field.systemKey! : fv.fieldId;
    submittedValues[key] = fv.value;
  }
  const fieldFailures = await validateFormFields(tx, camper.organizationId, "CAMPER", submittedValues);
  for (const f of fieldFailures) {
    failures.push({ step: "custom_fields", code: "MISSING_FIELD", message: `"${f.label}" is required.` });
  }

  // Step 4: Age validation (computed at cutoff date, not today)
  if (camper.dateOfBirth && (camp.minAge != null || camp.maxAge != null)) {
    const cutoff = camp.ageCutoffDate ?? camp.startDate;
    const age = calculateAge(camper.dateOfBirth, cutoff);
    if (camp.minAge != null && age < camp.minAge) {
      failures.push({ step: "age", code: "TOO_YOUNG", message: `Camper does not meet the minimum age requirement of ${camp.minAge}.` });
    }
    if (camp.maxAge != null && age > camp.maxAge) {
      failures.push({ step: "age", code: "TOO_OLD", message: `Camper exceeds the maximum age requirement of ${camp.maxAge}.` });
    }
  }

  // Step 5: Campus gate validation. Only boolean gates are checked here -
  // capacity (quota/fullBehavior) is deliberately NOT checked at submission
  // time. Under the new domain model, capacity is a Venue concept, and Venue
  // isn't assigned to a registration until approval/allocation time (a Campus
  // signup link being "full" is no longer a submission-time concept). See
  // engine.ts's approveRegistrationInTx/transferVenue for the Venue-scoped
  // capacity check that replaces this.
  if (!campus.active || !campus.signupOpen) {
    failures.push({ step: "campus", code: "CAMPUS_CLOSED", message: "This campus is not currently accepting registrations." });
  }

  // Step 6: Duplicate detection (also enforced by a DB unique constraint)
  const duplicate = await tx.registration.findFirst({
    where: {
      camperId: camper.id,
      campId: camp.id,
      id: { not: registration.id },
      status: { notIn: ["CANCELLED", "REJECTED", "ARCHIVED"] },
      deletedAt: null,
    },
  });
  if (duplicate) {
    failures.push({ step: "duplicate", code: "DUPLICATE_REGISTRATION", message: "This camper already has a registration for this camp." });
  }

  // Step 8: Document validation
  for (const req of camp.documentRequirements) {
    if (req.deletedAt) continue;
    if (!req.required) continue;
    const hasDoc =
      req.scope === "CAMPER"
        ? camper.documents.some((d) => d.requirementId === req.id && d.status !== "REJECTED")
        : registration.documents.some((d) => d.requirementId === req.id && d.status !== "REJECTED");
    if (!hasDoc) {
      failures.push({ step: "documents", code: "MISSING_DOCUMENT", message: `"${req.name}" is required.` });
    }
  }

  return failures;
}
