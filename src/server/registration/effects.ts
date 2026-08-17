import QRCode from "qrcode";
import { Resend } from "resend";
import { prisma } from "../db";
import { logDelivery } from "../email/logDelivery";
import {
  sendAcceptanceEmail,
  sendCorrectionEmail,
  sendRejectionEmail,
  sendWaitlistEmail,
  sendSubmissionEmail,
  sendTribeChangedEmail,
} from "../email/sendAcceptanceEmail";
import { loadTemplateForEvent } from "../email/templateLoader";
import { renderEmail, renderEmailWithEvent } from "../email/renderer";
import { resolveFromAddress } from "../email/resolveFromAddress";
import { interpolateSubject } from "../email/interpolate";
import {
  PermanentCampaignError,
  ResendCampaignError,
  processCampaignEffectBatch,
  processCampaignSideEffect,
} from "../email/campaign/sender";

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
  | "REGISTRATION_SUBMITTED"
  | "TRIBE_CHANGED";

const MAX_ATTEMPTS = 5;
const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3001";

/** Email clients strip data: URIs from <img src> — only a hosted http(s) URL or (for the in-app template preview) a data URI is safe to render. */
function isRenderableQrSrc(value: string | undefined): value is string {
  return !!value && (value.startsWith("data:image") || value.startsWith("http://") || value.startsWith("https://"));
}

/** Queues a post-transition side effect (email/notification) in the DB-backed outbox (PRD Part 6 §3, §16). */
export async function enqueueSideEffect(registrationId: string, type: SideEffectType) {
  // Attribute the effect to an org so the admin delivery queue can scope by it.
  const registration = await prisma.registration.findUnique({
    where: { id: registrationId },
    select: { camp: { select: { organizationId: true } } },
  });
  return prisma.sideEffect.create({
    data: { registrationId, type, organizationId: registration?.camp.organizationId ?? null },
  });
}

export async function qrDataUrlForToken(token: string): Promise<string> {
  return QRCode.toDataURL(token, { width: 300, margin: 1 });
}

/**
 * Queues a correction email for a registration whose tribe has actually
 * changed (not a first-time assignment — that's already covered by the
 * approval email). The previous tribe's name can't be recovered from
 * `Registration.tribe` once overwritten, so it's snapshotted onto
 * `SideEffect.payload` at enqueue time rather than re-read at send time.
 *
 * Debounced against an already-QUEUED TRIBE_CHANGED effect for the same
 * registration so correcting a mistake twice in quick succession sends one
 * email, not two — the later enqueue just refreshes the snapshot in place.
 *
 * Deliberately called outside the assignment transaction (fire-and-forget,
 * errors logged not thrown) so a mail-queue failure can never roll back the
 * tribe write itself — mirrors the outbox pattern used everywhere else here.
 *
 * Also kicks off processing immediately (fire-and-forget, via `setImmediate`
 * — same pattern as the sweep's own self-continuation), rather than leaving
 * it for the next cron sweep — this is a correction for something the
 * parent may already be holding a wrong answer for, so it shouldn't wait on
 * cron any longer than it has to (and per the campaign auto-send work,
 * cron's `render.yaml` deployment is a known gap anyway). Fire-and-forget
 * rather than awaited so a tribe-assignment mutation never blocks on an
 * email send, and so a second reassignment landing within the same instant
 * still has a real chance to hit the debounce path above instead of racing
 * a synchronous send.
 */
export async function enqueueTribeChangedEffect(params: {
  registrationId: string;
  previousTribeId: string;
  previousTribeName: string;
}) {
  let effectId: string;
  try {
    const registration = await prisma.registration.findUnique({
      where: { id: params.registrationId },
      select: { camp: { select: { organizationId: true } } },
    });
    const payload = { previousTribeId: params.previousTribeId, previousTribeName: params.previousTribeName };
    const existing = await prisma.sideEffect.findFirst({
      where: { registrationId: params.registrationId, type: "TRIBE_CHANGED", status: "QUEUED" },
    });
    if (existing) {
      await prisma.sideEffect.update({ where: { id: existing.id }, data: { payload } });
      effectId = existing.id;
    } else {
      const created = await prisma.sideEffect.create({
        data: {
          registrationId: params.registrationId,
          type: "TRIBE_CHANGED",
          organizationId: registration?.camp.organizationId ?? null,
          payload,
        },
      });
      effectId = created.id;
    }
  } catch (error) {
    console.error(`[effects] Failed to enqueue TRIBE_CHANGED for registration ${params.registrationId}:`, error);
    return;
  }
  setImmediate(() => {
    processSideEffect(effectId).catch((error) => {
      console.error(`[effects] Immediate processing of TRIBE_CHANGED effect ${effectId} failed, leaving it for the sweep:`, error);
    });
  });
}

async function runEffect(registrationId: string, type: SideEffectType, payload?: Record<string, unknown> | null) {
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
      const qrCode = isRenderableQrSrc(variables.qr_code) ? variables.qr_code : undefined;
      
      // Resolve from-address and replyTo
      const { from, replyTo } = await resolveFromAddress({
        organizationId: orgId,
        event: eventKey,
        senderName: loaded.branding?.senderName,
        senderMode: loaded.senderMode,
        customFromLocalPart: loaded.customFromLocalPart,
        replyTo: loaded.replyTo,
      });

      // Safe interpolation for subject and preview text
      const { text: interpolatedSubject } = interpolateSubject(loaded.subject, variables);
      const { text: interpolatedPreviewText } = interpolateSubject(loaded.previewText ?? "", variables);

      const { html } = await renderEmailWithEvent({
        eventKey: eventKey as any,
        tiptapJson: loaded.tiptapJson,
        variables,
        branding: loaded.branding,
        qrDataUrl: qrCode,
        previewText: interpolatedPreviewText,
      });

      const result = await getResend().emails.send({
        from,
        to: parentEmail,
        subject: interpolatedSubject,
        html: html,
        replyTo,
      });
      await logDelivery({
        prisma,
        email: parentEmail,
        userId: registration.camper.userId,
        organizationId: registration.camp.organizationId,
        registrationId: registration.id,
        recipientType: "PARENT",
        deliverySource: eventKey,
        subject: interpolatedSubject,
        providerMessageId: result.data?.id ?? undefined,
        deliveryStatus: "SENT",
      });
    } catch (err) {
      console.error(`[effects] Template email failed for ${eventKey}, falling back to hardcoded:`, err);
      try { await hardcodedFn(); } catch { /* hardcoded also failed */ }
    }
  }

  switch (type) {
    case "REGISTRATION_APPROVED": {
      if (!registration.qrToken || !registration.registrationNumber) {
        throw new Error("Cannot send acceptance email before QR token and registration number are assigned.");
      }
      const qrImageUrl = `${APP_URL}/api/qr/${registration.qrToken}`;
      await tryTemplateEmail("REGISTRATION_APPROVED", {
        parent_name: parentEmail,
        camper_name: camperName,
        camp_name: registration.camp.name,
        centre_name: registration.campus.name,
        registration_number: registration.registrationNumber,
        reporting_date: registration.camp.arrivalDate?.toDateString() ?? "",
        qr_code: qrImageUrl,
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
          qrSrc: qrImageUrl, viewUrl,
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
    case "TRIBE_CHANGED": {
      // A registration without a current tribe (cleared, not reassigned)
      // has nothing correct to tell the parent — skip rather than send a
      // blank/confusing email.
      if (!registration.tribe) break;
      const previousTribeName = typeof payload?.previousTribeName === "string" ? payload.previousTribeName : "";
      await tryTemplateEmail("TRIBE_CHANGED", {
        parent_name: parentEmail,
        camper_name: camperName,
        camp_name: registration.camp.name,
        previous_tribe_name: previousTribeName,
        tribe_name: registration.tribe.name,
        tribe_color: registration.tribe.color ?? "",
        registration_url: viewUrl,
      }, async () => {
        await sendTribeChangedEmail({
          to: parentEmail, camperName, campName: registration.camp.name,
          previousTribeName, tribeName: registration.tribe!.name, tribeColor: registration.tribe!.color,
          viewUrl, orgSlug,
        });
      });
      await prisma.notification.create({
        data: {
          organizationId: registration.camper.organizationId,
          userId: registration.camper.userId,
          registrationId: registration.id,
          channel: "IN_APP",
          title: "Tribe Updated",
          body: `${camperName}'s tribe for ${registration.camp.name} is now ${registration.tribe.name}.`,
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
  if (!effect || effect.status !== "QUEUED") return;

  const claimed = await prisma.sideEffect.updateMany({
    where: { id, status: "QUEUED" },
    data: { status: "PROCESSING" },
  });
  if (claimed.count === 0) return;
  if (effect.type === "CAMPAIGN_SEND" && effect.txId) {
    await prisma.emailRecipient.updateMany({
      where: { id: effect.txId, deliveryStatus: "QUEUED" },
      data: { deliveryStatus: "PROCESSING" },
    });
  }

  // Campaign effects respect the campaign's own lifecycle: a CANCELLED campaign
  // must never send again; a PAUSED campaign defers without burning attempts.
  if (effect.type === "CAMPAIGN_SEND" && effect.campaignId) {
    const campaign = await prisma.emailCampaign.findUnique({
      where: { id: effect.campaignId },
      select: { status: true },
    });
    if (campaign?.status === "CANCELLED") {
      await prisma.sideEffect.update({ where: { id }, data: { status: "CANCELLED" } });
      if (effect.txId) await prisma.emailRecipient.updateMany({ where: { id: effect.txId, deliveryStatus: "PROCESSING" }, data: { deliveryStatus: "CANCELLED" } });
      return;
    }
    if (campaign?.status === "PAUSED" || campaign?.status === "NEEDS_ATTENTION") {
      await prisma.sideEffect.update({
        where: { id },
        data: { status: "QUEUED", runAfter: new Date(Date.now() + 60 * 1000) },
      });
      if (effect.txId) await prisma.emailRecipient.updateMany({ where: { id: effect.txId, deliveryStatus: "PROCESSING" }, data: { deliveryStatus: "QUEUED" } });
      return;
    }
  }

  try {
    // Broadcast effects are handled differently from registration effects
    if (effect.type === "BROADCAST_SEND" && effect.broadcastRecipientId) {
      await processBroadcastEffect(effect.id);
    } else if (effect.type === "CAMPAIGN_SEND" && effect.campaignId) {
      await processCampaignSideEffect(prisma, effect.id);
    } else if (effect.registrationId) {
      await runEffect(effect.registrationId, effect.type as SideEffectType, effect.payload as Record<string, unknown> | null);
    }
    await prisma.sideEffect.update({ where: { id }, data: { status: "DONE" } });

    // When a campaign's queue drains, mark it COMPLETED (failures are visible
    // per-recipient in campaign stats — COMPLETED means "send run finished").
    if (effect.type === "CAMPAIGN_SEND" && effect.campaignId) {
      await finalizeCampaignIfDrained(effect.campaignId);
    }
  } catch (error) {
    await recordEffectFailure(effect, error);
    if (effect.campaignId) await finalizeCampaignIfDrained(effect.campaignId);
  }
}

async function finalizeCampaignIfDrained(campaignId: string) {
  const active = await prisma.sideEffect.count({
    where: { campaignId, type: "CAMPAIGN_SEND", status: { in: ["QUEUED", "PROCESSING"] } },
  });
  if (active > 0) return;
  const held = await prisma.emailRecipient.count({ where: { campaignId, deliveryStatus: "HELD" } });
  await prisma.emailCampaign.updateMany({
    where: { id: campaignId, status: "SENDING" },
    data: held > 0
      ? { status: "NEEDS_ATTENTION", completedAt: null }
      : { status: "COMPLETED", completedAt: new Date() },
  });
}

async function recordEffectFailure(effect: { id: string; txId: string | null; attempts: number }, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof PermanentCampaignError) {
    await prisma.$transaction([
      prisma.sideEffect.update({ where: { id: effect.id }, data: { status: "CANCELLED", lastError: message } }),
      ...(effect.txId ? [prisma.emailRecipient.update({ where: { id: effect.txId }, data: { deliveryStatus: "HELD", failedReason: message } })] : []),
    ]);
    return;
  }
  const attempts = effect.attempts + 1;
  const permanent = error instanceof ResendCampaignError && error.permanent;
  const terminal = permanent || attempts >= MAX_ATTEMPTS;
  const delayMs = error instanceof ResendCampaignError && error.retryAfterMs
    ? error.retryAfterMs
    : Math.min(2 ** attempts, 60) * 60 * 1000;
  await prisma.$transaction([
    prisma.sideEffect.update({
      where: { id: effect.id },
      data: { attempts, status: terminal ? "FAILED" : "QUEUED", lastError: message, runAfter: new Date(Date.now() + delayMs) },
    }),
    ...(effect.txId ? [prisma.emailRecipient.update({
      where: { id: effect.txId },
      data: { deliveryStatus: terminal ? "FAILED" : "QUEUED", failedReason: message, retryCount: { increment: 1 } },
    })] : []),
  ]);
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

  const org = await prisma.organization.findUnique({
    where: { id: broadcast.organizationId },
    include: { branding: true },
  });

  let campName = "";
  if (broadcast.campId) {
    const camp = await prisma.camp.findUnique({ where: { id: broadcast.campId } });
    if (camp) campName = camp.name;
  }

  const branding = org?.branding;

  // Build generic variables for broadcasts
  const variables = {
    organization_name: org?.name ?? "",
    camp_name: campName,
    support_email: branding?.supportEmail ?? "",
    support_phone: branding?.supportPhone ?? "",
    sender_name: branding?.senderName ?? "",
    dashboard_url: `${APP_URL}/dashboard`,
  };

  // Resolve from-address and replyTo for this broadcast
  const { from, replyTo } = await resolveFromAddress({
    organizationId: broadcast.organizationId,
    broadcast,
    senderName: branding?.senderName,
  });

  const { text: interpolatedSubject } = interpolateSubject(broadcast.subject, variables);

  const { html } = await renderEmail({
    tiptapJson: broadcast.body as Record<string, unknown>,
    variables,
    branding: branding ? {
      logoUrl: branding.logoUrl,
      primaryColor: branding.primaryColor,
      accentColor: branding.accentColor,
      buttonColor: branding.buttonColor,
      headerImageUrl: branding.headerImageUrl,
      senderName: branding.senderName,
      footerText: branding.footerText,
      supportEmail: branding.supportEmail,
      supportPhone: branding.supportPhone,
      websiteUrl: branding.websiteUrl,
      facebookUrl: branding.facebookUrl,
      instagramUrl: branding.instagramUrl,
      address: branding.address,
    } : null,
  });

  await getResend().emails.send({
    from,
    to: recipient.email,
    subject: interpolatedSubject,
    html,
    replyTo,
  });

  await logDelivery({
    prisma,
    email: recipient.email,
    userId: recipient.recipientId,
    organizationId: broadcast.organizationId,
    recipientType: broadcast.audience === "PARENTS" ? "PARENT" : broadcast.audience === "TEACHERS" ? "TEACHER" : broadcast.audience === "VOLUNTEERS" ? "VOLUNTEER" : "PARENT",
    deliverySource: "BROADCAST",
    subject: interpolatedSubject,
    deliveryStatus: "SENT",
  });

  await prisma.broadcastRecipient.update({
    where: { id: recipient.id },
    data: { status: "SENT", sentAt: new Date() },
  });
}

// Arbitrary constant identifying this sweep's Postgres advisory lock —
// unique within the app, never reused for anything else.
const SWEEP_LOCK_KEY = 847_362_910;
// Leaves margin inside a one-minute cron tick so a run that hits this budget
// still finishes (and releases the lock) well before the next tick fires.
const SWEEP_WALL_CLOCK_BUDGET_MS = 45_000;
// A safety cap on self-continuation depth, not a ceiling normal operation
// should ever approach — at 200/run this is 10,000 effects deep.
const SWEEP_MAX_CONTINUATION_DEPTH = 50;

/**
 * Sweeps due, non-terminal effects. Safe to call from a cron/pinger every
 * minute or so, but also self-continues (see below) so it no longer
 * *depends* on that — a large campaign or backlog drains itself.
 */
export async function sweepPendingSideEffects(limit = 200, opts?: { continuationDepth?: number }): Promise<{ processed: number; skipped?: boolean }> {
  // Serializes overlapping invocations. A cron tick, a self-continuation, a
  // campaign's immediate post-send kick, and someone clicking "Send queued
  // now" can all land within moments of each other; without this they'd
  // each run their own in-process Resend rate limiter (sender.ts)
  // concurrently and collectively exceed the intended send rate.
  // pg_try_advisory_lock is non-blocking — a losing caller returns
  // immediately rather than queueing up behind the winner.
  //
  // Acquire and release must run on the *same* Postgres connection — advisory
  // locks are session-scoped, and Prisma's normal pool round-robins across
  // separate `await`s, so two independent `$queryRaw` calls (the original
  // shape of this function) could silently land on different connections:
  // the unlock would then no-op and the lock would stay held forever on
  // whichever connection acquired it. `$transaction` pins one connection for
  // its callback's lifetime purely to make that pairing safe; `runSweep`
  // itself still goes through the normal pool on separate connections, it is
  // not part of this SQL transaction.
  const result = await prisma.$transaction(async (tx) => {
    const lockRows = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(${SWEEP_LOCK_KEY}) AS locked`;
    if (!lockRows[0]?.locked) return { processed: 0, skipped: true as const };

    try {
      const processed = await runSweep(limit);
      return { processed, skipped: false as const };
    } finally {
      await tx.$queryRaw`SELECT pg_advisory_unlock(${SWEEP_LOCK_KEY})`;
    }
  }, { timeout: SWEEP_WALL_CLOCK_BUDGET_MS + 15_000, maxWait: 10_000 });

  if (result.skipped) return { processed: 0, skipped: true };

  // Self-continuation: a full page suggests more due work is waiting right
  // now rather than a minute from now. Chained instead of waiting for the
  // next external trigger — this is what lets a large campaign fully drain
  // without depending on cron running at all. Fire-and-forget so this call's
  // own caller isn't held up by it.
  const depth = opts?.continuationDepth ?? 0;
  if (result.processed >= limit && depth < SWEEP_MAX_CONTINUATION_DEPTH) {
    setImmediate(() => {
      sweepPendingSideEffects(limit, { continuationDepth: depth + 1 }).catch((error) => {
        console.error("[sweep] self-continuation failed:", error);
      });
    });
  }
  return { processed: result.processed };
}

async function runSweep(limit: number): Promise<number> {
  const startedAt = Date.now();
  const withinBudget = () => Date.now() - startedAt < SWEEP_WALL_CLOCK_BUDGET_MS;

  // Fire any scheduled campaigns whose time has come — their sends enqueue
  // CAMPAIGN_SEND effects which the loop below then picks up.
  try {
    const { processScheduledCampaigns } = await import("../email/campaign/sender");
    await processScheduledCampaigns(prisma);
  } catch (error) {
    console.error("[sweep] processScheduledCampaigns failed:", error);
  }

  await prisma.sideEffect.updateMany({
    where: { status: "PROCESSING", updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) }, type: { not: { startsWith: "SCORE_" } } },
    data: { status: "QUEUED", runAfter: new Date() },
  });
  await prisma.emailRecipient.updateMany({
    where: { deliveryStatus: "PROCESSING", updatedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) } },
    data: { deliveryStatus: "QUEUED" },
  });

  const due = await prisma.sideEffect.findMany({
    // Excludes SCORE_* — those are drained separately by drainScoreQueue
    // (src/server/leaderboard/queue.ts), so a burst of QR scans can't starve
    // email/PDF delivery by filling this queue.
    where: { status: "QUEUED", runAfter: { lte: new Date() }, type: { not: { startsWith: "SCORE_" } } },
    take: limit,
    orderBy: { runAfter: "asc" },
  });
  const campaignGroups = new Map<string, typeof due>();
  const simple: typeof due = [];
  for (const effect of due) {
    if (effect.type !== "CAMPAIGN_SEND" || !effect.campaignId) {
      simple.push(effect);
      continue;
    }
    const group = campaignGroups.get(effect.campaignId) ?? [];
    group.push(effect);
    campaignGroups.set(effect.campaignId, group);
  }

  // Anything not attempted because the budget ran out stays QUEUED
  // untouched — picked up by the next run (self-continuation or the next
  // cron tick), never lost or double-counted.
  let processed = 0;
  for (const effect of simple) {
    if (!withinBudget()) return processed;
    await processSideEffect(effect.id);
    processed++;
  }

  for (const [campaignId, effects] of campaignGroups) {
    if (!withinBudget()) return processed;
    const campaign = await prisma.emailCampaign.findUnique({ where: { id: campaignId }, select: { status: true, personalizeEvent: true, attachments: true } });
    if (campaign?.status !== "SENDING") {
      for (const effect of effects) {
        if (!withinBudget()) return processed;
        await processSideEffect(effect.id);
        processed++;
      }
      continue;
    }
    const claimed: typeof effects = [];
    for (const effect of effects) {
      const result = await prisma.sideEffect.updateMany({ where: { id: effect.id, status: "QUEUED" }, data: { status: "PROCESSING" } });
      if (result.count === 0) continue;
      claimed.push(effect);
      if (effect.txId) await prisma.emailRecipient.updateMany({ where: { id: effect.txId, deliveryStatus: "QUEUED" }, data: { deliveryStatus: "PROCESSING" } });
    }
    const chunkSize = campaign.personalizeEvent || (Array.isArray(campaign.attachments) && campaign.attachments.length > 0) ? 1 : 100;
    for (let offset = 0; offset < claimed.length; offset += chunkSize) {
      // Already-claimed (PROCESSING) effects must be seen through rather
      // than abandoned mid-chunk-loop — the budget only gates starting a
      // *new* chunk, not finishing one in progress.
      if (offset > 0 && !withinBudget()) break;
      const chunk = claimed.slice(offset, offset + chunkSize);
      try {
        await processCampaignEffectBatch(prisma, chunk.map((effect) => effect.id));
        await prisma.sideEffect.updateMany({ where: { id: { in: chunk.map((effect) => effect.id) }, status: "PROCESSING" }, data: { status: "DONE" } });
      } catch (error) {
        for (const effect of chunk) await recordEffectFailure(effect, error);
      }
      processed += chunk.length;
    }
    await finalizeCampaignIfDrained(campaignId);
  }
  return processed;
}
