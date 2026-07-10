import QRCode from "qrcode";
import { prisma } from "../db";
import {
  sendAcceptanceEmail,
  sendCorrectionEmail,
  sendRejectionEmail,
  sendWaitlistEmail,
} from "../email/sendAcceptanceEmail";

export type SideEffectType =
  | "REGISTRATION_APPROVED"
  | "REGISTRATION_REJECTED"
  | "CORRECTION_REQUESTED"
  | "REGISTRATION_WAITLISTED";

const MAX_ATTEMPTS = 5;
const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3001";

/** Queues a post-transition side effect (email/notification) in the DB-backed outbox (PRD Part 6 §3, §16). */
export async function enqueueSideEffect(registrationId: string, type: SideEffectType) {
  return prisma.sideEffect.create({ data: { registrationId, type } });
}

export async function qrDataUrlForToken(token: string): Promise<string> {
  return QRCode.toDataURL(token, { width: 300, margin: 1 });
}

async function runEffect(registrationId: string, type: SideEffectType) {
  const registration = await prisma.registration.findUniqueOrThrow({
    where: { id: registrationId },
    include: { camper: { include: { user: true } }, camp: true, campus: true, tribe: true },
  });
  const parentEmail = registration.camper.user.email;
  const camperName = registration.camper.name;
  const viewUrl = `${APP_URL}/dashboard/register/${registration.id}`;

  switch (type) {
    case "REGISTRATION_APPROVED": {
      if (!registration.qrToken || !registration.registrationNumber) {
        throw new Error("Cannot send acceptance email before QR token and registration number are assigned.");
      }
      const qrDataUrl = await qrDataUrlForToken(registration.qrToken);
      await sendAcceptanceEmail({
        to: parentEmail,
        camperName,
        campName: registration.camp.name,
        centreName: registration.campus.name,
        registrationNumber: registration.registrationNumber,
        reportingDate: registration.camp.arrivalDate?.toDateString(),
        qrDataUrl,
        viewUrl,
        remindersHtml: registration.camp.remindersHtml,
        tribeName: registration.tribe?.name,
        tribeColor: registration.tribe?.color,
      });
      await prisma.notification.create({
        data: {
          organizationId: registration.camper.organizationId,
          userId: registration.camper.userId,
          registrationId: registration.id,
          channel: "IN_APP",
          title: "Registration Approved",
          body: `${camperName}'s registration for ${registration.camp.name} has been approved.`,
        },
      });
      break;
    }
    case "REGISTRATION_REJECTED": {
      await sendRejectionEmail({
        to: parentEmail,
        camperName,
        campName: registration.camp.name,
        reason: registration.rejectionReason ?? "No reason provided.",
      });
      await prisma.notification.create({
        data: {
          organizationId: registration.camper.organizationId,
          userId: registration.camper.userId,
          registrationId: registration.id,
          channel: "IN_APP",
          title: "Registration Not Approved",
          body: `${camperName}'s registration for ${registration.camp.name} was not approved.`,
        },
      });
      break;
    }
    case "CORRECTION_REQUESTED": {
      await sendCorrectionEmail({
        to: parentEmail,
        camperName,
        campName: registration.camp.name,
        message: registration.correctionRequest ?? "Please review your registration.",
        viewUrl,
      });
      await prisma.notification.create({
        data: {
          organizationId: registration.camper.organizationId,
          userId: registration.camper.userId,
          registrationId: registration.id,
          channel: "IN_APP",
          title: "Action Needed",
          body: `We need more information for ${camperName}'s registration.`,
        },
      });
      break;
    }
    case "REGISTRATION_WAITLISTED": {
      await sendWaitlistEmail({ to: parentEmail, camperName, campName: registration.camp.name });
      await prisma.notification.create({
        data: {
          organizationId: registration.camper.organizationId,
          userId: registration.camper.userId,
          registrationId: registration.id,
          channel: "IN_APP",
          title: "Waitlisted",
          body: `${camperName} is on the waitlist for ${registration.camp.name}.`,
        },
      });
      break;
    }
  }
}

/**
 * Processes one queued side effect. Never throws — failures are recorded on
 * the row with a backoff `runAfter` so the sweep can retry later (PRD Part 4
 * §17: a failed downstream task must never invalidate the approval itself).
 */
export async function processSideEffect(id: string) {
  const effect = await prisma.sideEffect.findUnique({ where: { id } });
  if (!effect || effect.status === "DONE") return;

  try {
    await runEffect(effect.registrationId, effect.type as SideEffectType);
    await prisma.sideEffect.update({ where: { id }, data: { status: "DONE" } });
  } catch (error) {
    const attempts = effect.attempts + 1;
    const backoffMinutes = Math.min(2 ** attempts, 60);
    await prisma.sideEffect.update({
      where: { id },
      data: {
        attempts,
        status: attempts >= MAX_ATTEMPTS ? "FAILED" : "QUEUED",
        lastError: error instanceof Error ? error.message : String(error),
        runAfter: new Date(Date.now() + backoffMinutes * 60 * 1000),
      },
    });
  }
}

/** Best-effort immediate run right after a transition commits; falls back to the sweep on failure. */
export async function runSideEffectsNow(registrationId: string, type: SideEffectType) {
  const effect = await enqueueSideEffect(registrationId, type);
  await processSideEffect(effect.id);
}

/** Sweeps due, non-terminal effects. Intended to be hit by a cron/pinger every minute or so. */
export async function sweepPendingSideEffects(limit = 25) {
  const due = await prisma.sideEffect.findMany({
    where: { status: "QUEUED", runAfter: { lte: new Date() } },
    take: limit,
    orderBy: { runAfter: "asc" },
  });
  for (const effect of due) {
    await processSideEffect(effect.id);
  }
  return { processed: due.length };
}
