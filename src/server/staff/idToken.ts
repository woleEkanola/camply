import crypto from "crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { logEvent } from "../audit";

type TxClient = PrismaClient<any> | Prisma.TransactionClient;

// "STF-" prefix is load-bearing, not cosmetic — it lets the Scan Centre's
// token resolver (scan.ts) distinguish a staff badge from a camper
// Registration.qrToken before ever hitting the DB, with zero ambiguity.
const STAFF_TOKEN_PREFIX = "STF-";

export function generateStaffQrToken(): string {
  return `${STAFF_TOKEN_PREFIX}${crypto.randomBytes(24).toString("base64url")}`;
}

export function isStaffQrToken(token: string): boolean {
  return token.startsWith(STAFF_TOKEN_PREFIX);
}

/**
 * Idempotent — issues a qrToken if the profile doesn't have one yet, returns
 * the existing one otherwise. Doubles as the lazy backfill for staff
 * approved before this feature existed, so no bulk data migration is needed.
 */
export async function ensureStaffQrToken(tx: TxClient, staffProfileId: string): Promise<string> {
  const profile = await tx.staffProfile.findUniqueOrThrow({ where: { id: staffProfileId } });
  if (profile.qrToken) return profile.qrToken;

  const qrToken = generateStaffQrToken();
  const updated = await tx.staffProfile.update({
    where: { id: staffProfileId },
    data: { qrToken, qrIssuedAt: new Date() },
  });
  return updated.qrToken as string;
}

/** Org-admin-only reissue — invalidates a lost/compromised badge. */
export async function regenerateStaffQrToken(
  tx: TxClient,
  params: { staffProfileId: string; actorId: string },
): Promise<string> {
  const profile = await tx.staffProfile.findUniqueOrThrow({ where: { id: params.staffProfileId } });
  const qrToken = generateStaffQrToken();
  await tx.staffProfile.update({
    where: { id: params.staffProfileId },
    data: { qrToken, qrIssuedAt: new Date() },
  });

  await logEvent(tx, {
    organizationId: profile.organizationId,
    actorId: params.actorId,
    action: "STAFF_QR_REGENERATED",
    previousValue: { qrToken: profile.qrToken },
    newValue: { qrToken },
  });

  return qrToken;
}
