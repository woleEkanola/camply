import QRCode from "qrcode";
import { Resend } from "resend";
import { prisma } from "../db";
import {
  sendAcceptanceEmail,
  sendCorrectionEmail,
  sendRejectionEmail,
  sendWaitlistEmail,
  sendSubmissionEmail,
} from "../email/sendAcceptanceEmail";
import { loadTemplateForEvent } from "../email/templateLoader";
import { renderEmail } from "../email/renderer";
import { buildFromAddress } from "../email/fromAddress";

let resend: Resend | null = null;
function getResend() {
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}

export type SideEffectType =
  | "REGISTRATION_APPROVED"
  | "REGISTRATION_REJECTED"
  | "CORRECTION_REQUESTED"
  | "REGISTRATION_WAITLISTED"
  | "REGISTRATION_SUBMITTED";

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
    include: { camper: { include: { user: true } }, camp: { include: { organization: { select: { slug: true, id: true } } } }, campus: true, tribe: true },
  });
  const parentEmail = registration.camper.user.email;
  const camperName = registration.camper.name;
  const viewUrl = `${APP_URL}/dashboard/register/${registration.id}`;
  const orgSlug = registration.camp.organization?.slug ?? undefined;
  const orgId = registration.camp.organization?.id;

  /**
   * Try sending via the template system first. Falls back to the passed
   * hardcoded function when no template config exists or is disabled.
   */
  async function tryTemplateEmail(
    eventKey: string,
    variables: Record<string, string>,
    hardcodedFn: () => Promise<void>,
  ) {
    if (!orgId) { await hardcodedFn(); return; }
    const loaded = await loadTemplateForEvent(orgId, eventKey);
    if (!loaded || !loaded.channels.includes("EMAIL")) { await hardcodedFn(); return; }

    try {
      const html = await renderEmail({ tiptapJson: loaded.tiptapJson, variables, branding: loaded.branding });
      // Post-process QR code variable — TipTap JSON can't hold base64 images
      let finalHtml = html;
      if (variables.qr_code && variables.qr_code.startsWith("data:image")) {
        finalHtml = finalHtml.replace("{{qr_code}}", `<img src="${variables.qr_code}" alt="QR Code" width="180" height="180" />`);
        finalHtml = finalHtml.replace(variables.qr_code, `<img src="${variables.qr_code}" alt="QR Code" width="180" height="180" />`);
      }
      await getResend().emails.send({
        from: buildFromAddress({ orgSlug, senderName: loaded.branding?.senderName ?? undefined }),
        to: parentEmail,
        subject: loaded.subject,
        html: finalHtml,
      });
    } catch (err) {
      console.error(`[effects] Template email failed for ${eventKey}, falling back to hardcoded:`, err);
      await hardcodedFn();
    }
  }

  switch (type) {
    case "REGISTRATION_APPROVED": {
      if (!registration.qrToken || !registration.registrationNumber) {
        throw new Error("Cannot send acceptance email before QR token and registration number are assigned.");
      }
      const qrDataUrl = await qrDataUrlForToken(registration.qrToken);
      await tryTemplateEmail("REGISTRATION_APPROVED", {
        parent_name: parentEmail,
        camper_name: camperName,
        camp_name: registration.camp.name,
        centre_name: registration.campus.name,
        registration_number: registration.registrationNumber,
        reporting_date: registration.camp.arrivalDate?.toDateString() ?? "",
        qr_code: qrDataUrl,
        registration_url: viewUrl,
        tribe_name: registration.tribe?.name ?? "",
        tribe_color: registration.tribe?.color ?? "",
        organization_name: registration.camp.organization?.slug ?? "",
      }, async () => {
        await sendAcceptanceEmail({
          to: parentEmail, camperName,
          campName: registration.camp.name, centreName: registration.campus.name,
          registrationNumber: registration.registrationNumber!,
          reportingDate: registration.camp.arrivalDate?.toDateString(),
          qrDataUrl, viewUrl,
          remindersHtml: registration.camp.remindersHtml,
          tribeName: registration.tribe?.name, tribeColor: registration.tribe?.color,
          orgSlug,
        });
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
      await tryTemplateEmail("REGISTRATION_REJECTED", {
        parent_name: parentEmail,
        camper_name: camperName,
        camp_name: registration.camp.name,
        rejection_reason: registration.rejectionReason ?? "No reason provided.",
      }, async () => {
        await sendRejectionEmail({
          to: parentEmail, camperName, campName: registration.camp.name,
          reason: registration.rejectionReason ?? "No reason provided.", orgSlug,
        });
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
      await tryTemplateEmail("CORRECTION_REQUESTED", {
        parent_name: parentEmail,
        camper_name: camperName,
        camp_name: registration.camp.name,
        correction_message: registration.correctionRequest ?? "Please review your registration.",
        registration_url: viewUrl,
      }, async () => {
        await sendCorrectionEmail({
          to: parentEmail, camperName, campName: registration.camp.name,
          message: registration.correctionRequest ?? "Please review your registration.",
          viewUrl, orgSlug,
        });
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
      await tryTemplateEmail("REGISTRATION_WAITLISTED", {
        parent_name: parentEmail,
        camper_name: camperName,
        camp_name: registration.camp.name,
      }, async () => {
        await sendWaitlistEmail({ to: parentEmail, camperName, campName: registration.camp.name, orgSlug });
      });
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
    case "REGISTRATION_SUBMITTED": {
      await tryTemplateEmail("REGISTRATION_SUBMITTED", {
        parent_name: parentEmail,
        camper_name: camperName,
        camp_name: registration.camp.name,
      }, async () => {
        await sendSubmissionEmail({ to: parentEmail, camperName, campName: registration.camp.name, orgSlug });
      });
      await prisma.notification.create({
        data: {
          organizationId: registration.camper.organizationId,
          userId: registration.camper.userId,
          registrationId: registration.id,
          channel: "IN_APP",
          title: "Registration Received",
          body: `${camperName}'s registration for ${registration.camp.name} has been received and is pending review.`,
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
    // Broadcast effects are handled differently from registration effects
    if (effect.type === "BROADCAST_SEND" && effect.broadcastRecipientId) {
      await processBroadcastEffect(effect.id);
    } else if (effect.registrationId) {
      await runEffect(effect.registrationId, effect.type as SideEffectType);
    }
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

/**
 * Process a broadcast side effect — renders template + branding and sends via Resend.
 * Handles individual broadcast recipient delivery with status tracking.
 */
async function processBroadcastEffect(effectId: string) {
  const effect = await prisma.sideEffect.findUniqueOrThrow({ where: { id: effectId } });
  const recipient = await prisma.broadcastRecipient.findUniqueOrThrow({ where: { id: effect.broadcastRecipientId! } });
  const broadcast = await prisma.broadcast.findUniqueOrThrow({ where: { id: recipient.broadcastId } });

  const branding = await prisma.organizationBranding.findUnique({ where: { organizationId: broadcast.organizationId } });

  const html = await renderEmail({
    tiptapJson: broadcast.body as Record<string, unknown>,
    variables: {},
    branding: branding ? {
      logoUrl: branding.logoUrl, primaryColor: branding.primaryColor,
      accentColor: branding.accentColor, buttonColor: branding.buttonColor,
      headerImageUrl: branding.headerImageUrl, footerText: branding.footerText,
      supportEmail: branding.supportEmail, supportPhone: branding.supportPhone,
      websiteUrl: branding.websiteUrl, facebookUrl: branding.facebookUrl,
      instagramUrl: branding.instagramUrl, address: branding.address,
    } : null,
  });

  await getResend().emails.send({
    from: buildFromAddress({ senderName: branding?.senderName ?? undefined }),
    to: recipient.email,
    subject: broadcast.subject,
    html,
  });

  await prisma.broadcastRecipient.update({
    where: { id: recipient.id },
    data: { status: "SENT", sentAt: new Date() },
  });
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
