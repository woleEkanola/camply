import type { Prisma, PrismaClient } from "@prisma/client";
import { validateFormFields } from "./validateFormFields";
import { calculateAge } from "./age";

export { calculateAge };

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

  // Step 5: Campus gate validation (boolean gates). Venue capacity is a
  // separate, later-assigned concept checked at approval time instead (see
  // engine.ts's approveRegistrationInTx/transferVenue).
  if (!campus.active || !campus.signupOpen) {
    failures.push({ step: "campus", code: "CAMPUS_CLOSED", message: "This campus is not currently accepting registrations." });
  }

  // Step 5b: Campus registration quota (per campus+camp, via SignupLink).
  // Unlike Venue capacity, this IS enforced at submission time when
  // quotaFullBehavior is CLOSE, per PRD 17.4 - parents must see "Campus
  // quota reached" rather than submit into a black hole. WAITLIST behavior
  // skips this gate and relies on the approval-time backstop in engine.ts.
  const signupLink = await tx.signupLink.findUnique({
    where: { campusId_campId: { campusId: registration.campusId, campId: registration.campId } },
  });
  if (signupLink && signupLink.quota > 0 && signupLink.quotaFullBehavior === "CLOSE") {
    await tx.$queryRaw`SELECT id FROM "SignupLink" WHERE id = ${signupLink.id} FOR UPDATE`;
    const pipelineCount = await tx.registration.count({
      where: {
        campusId: registration.campusId,
        campId: registration.campId,
        id: { not: registration.id },
        status: { in: ["SUBMITTED", "PENDING", "APPROVED"] },
        deletedAt: null,
      },
    });
    if (pipelineCount >= signupLink.quota) {
      failures.push({ step: "campus", code: "CAMPUS_QUOTA_REACHED", message: "Campus quota reached for this camp." });
    }
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
