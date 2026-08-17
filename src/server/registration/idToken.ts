import crypto from "crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

type TxClient = PrismaClient<any> | Prisma.TransactionClient;

/** Matches the unprefixed token shape approveRegistrationInTx issues (engine.ts's generateQrToken) — no "STF-" prefix, since the Scan Centre's resolver treats that prefix's absence as "this is a camper token". */
function generateCamperQrToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

/**
 * Idempotent — issues a qrToken for an already-APPROVED registration that
 * somehow doesn't have one yet (approved before qrToken issuance existed, or
 * cleared by a revert/re-approve race), returns the existing one otherwise.
 * Mirrors ensureStaffQrToken (src/server/staff/idToken.ts). Never call this
 * for a non-APPROVED registration — qrToken is meant to only exist once
 * approved, and this function doesn't re-check status itself.
 */
export async function ensureRegistrationQrToken(tx: TxClient, registrationId: string): Promise<string> {
  const registration = await tx.registration.findUniqueOrThrow({ where: { id: registrationId } });
  if (registration.qrToken) return registration.qrToken;

  const qrToken = generateCamperQrToken();
  const updated = await tx.registration.update({
    where: { id: registrationId },
    data: { qrToken },
  });
  return updated.qrToken as string;
}
