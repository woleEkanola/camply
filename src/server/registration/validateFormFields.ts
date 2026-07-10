import type { Prisma, PrismaClient } from "@prisma/client";
import { ensureSystemFields, type SystemFieldAudience } from "./systemFieldRegistry";

type TxClient = PrismaClient | Prisma.TransactionClient;

export interface FieldValidationFailure {
  fieldId: string;
  label: string;
}

function hasValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Checks every required && visible FormField for (organizationId, audience)
 * has a non-empty submitted value. `submittedValues` is keyed by systemKey
 * for SYSTEM fields and by FormField.id for CUSTOM fields — the convention
 * every wizard's `values` state already uses.
 */
export async function validateFormFields(
  tx: TxClient,
  organizationId: string,
  audience: SystemFieldAudience,
  submittedValues: Record<string, unknown>
): Promise<FieldValidationFailure[]> {
  await ensureSystemFields(tx, organizationId, audience);

  const fields = await tx.formField.findMany({
    where: { organizationId, audience, required: true, visible: true },
  });

  const failures: FieldValidationFailure[] = [];
  for (const field of fields) {
    const key = field.source === "SYSTEM" ? field.systemKey! : field.id;
    if (!hasValue(submittedValues[key])) {
      failures.push({ fieldId: field.id, label: field.label });
    }
  }
  return failures;
}
