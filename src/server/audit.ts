import type { Prisma, PrismaClient } from "@prisma/client";

type TxClient = PrismaClient | Prisma.TransactionClient;

export interface AuditEventInput {
  organizationId: string;
  registrationId?: string;
  actorId?: string | null;
  action: string;
  previousValue?: unknown;
  newValue?: unknown;
}

/**
 * Records an immutable audit event. Must be called with the same transaction
 * client used for the mutation it is describing, so the audit row is atomic
 * with the change (PRD Part 4 §15 / Part 7 §17).
 */
export async function logEvent(tx: TxClient, event: AuditEventInput) {
  return tx.auditLog.create({
    data: {
      organizationId: event.organizationId,
      registrationId: event.registrationId,
      actorId: event.actorId ?? null,
      action: event.action,
      previousValue: event.previousValue as Prisma.InputJsonValue | undefined,
      newValue: event.newValue as Prisma.InputJsonValue | undefined,
    },
  });
}
