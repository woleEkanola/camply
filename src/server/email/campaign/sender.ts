import type { PrismaClient } from "@prisma/client";
import { resolveAudience, type ResolvedUser } from "../audience/resolver";
import type { AudienceFilter } from "../audience/filters";
import { injectTracking } from "../tracking/injectTracking";
import { CAMP_INVITATION_INCLUDE, buildCampInvitationVariables } from "./personalize";

type TxClient = PrismaClient | Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

interface SendCampaignResult {
  recipientCount: number;
}

/** A resolved recipient for a personalized (certificate-style) campaign —
 * same shape resolveAudience() returns, plus the registration it's tied
 * to. A parent with two APPROVED registrations for the same camp gets two
 * of these (one per camper), unlike ordinary broadcasts which are keyed
 * one-per-user. */
interface ResolvedPersonalizedUser extends ResolvedUser {
  registrationId: string;
}

function recipientTypeForRole(role: string): string {
  if (role === "PARENT") return "PARENT";
  if (role === "TEACHER") return "TEACHER";
  if (role === "VOLUNTEER") return "VOLUNTEER";
  if (role === "CAMPUS_REPRESENTATIVE") return "CAMPUS_REP";
  return "ADMIN";
}

/**
 * Resolves one recipient per APPROVED registration in the campaign's
 * target camp (campaign.personalizeCampId), instead of resolveAudience()'s
 * flat one-per-user list — required so a personalized certificate email
 * (camper name, room, QR) can be sent per-camper. The existing audience
 * filter still applies as an optional narrowing filter on top (currently:
 * campusId, the most common narrowing case) rather than being ignored.
 */
async function resolvePersonalizedRecipients(
  prisma: TxClient,
  organizationId: string,
  campId: string,
  filter: AudienceFilter
): Promise<ResolvedPersonalizedUser[]> {
  const where: Record<string, unknown> = {
    campId,
    status: "APPROVED",
    deletedAt: null,
    campus: { organizationId },
  };
  const campusId = (filter.filters as { campusId?: string } | undefined)?.campusId;
  if (campusId) where.campusId = campusId;

  const registrations = await (prisma as any).registration.findMany({
    where,
    include: CAMP_INVITATION_INCLUDE,
  });

  const resolved: ResolvedPersonalizedUser[] = [];
  for (const registration of registrations) {
    const personalized = buildCampInvitationVariables(registration);
    if (!personalized) continue;
    resolved.push({
      id: personalized.parentUserId,
      email: personalized.email,
      firstName: null,
      lastName: null,
      role: "PARENT",
      registrationId: registration.id,
    });
  }
  return resolved;
}

/**
 * Renders one campaign email for one recipient (branding + variables + tracking
 * pixel/link-rewriting) and sends it via Resend. Shared by the initial batch in
 * sendCampaign and by the sweep's processCampaignSideEffect so the two paths
 * can't drift apart.
 */
async function renderAndSendCampaignEmail(
  campaign: any,
  recipient: { id: string; email: string; registrationId?: string | null }
): Promise<{ providerMessageId: string | undefined }> {
  const org = campaign.organization;
  const branding = org?.branding;

  const brandingParams = branding
    ? {
        logoUrl: branding.logoUrl,
        primaryColor: branding.primaryColor,
        accentColor: branding.accentColor,
        buttonColor: branding.buttonColor,
        headerImageUrl: branding.headerImageUrl,
        footerText: branding.footerText,
        supportEmail: branding.supportEmail,
        supportPhone: branding.supportPhone,
        websiteUrl: branding.websiteUrl,
        facebookUrl: branding.facebookUrl,
        instagramUrl: branding.instagramUrl,
        address: branding.address,
        tagline: branding.tagline,
        supportTitle: branding.supportTitle,
        supportDescription: branding.supportDescription,
        footerCopyright: branding.footerCopyright,
        phone: branding.phone,
        xUrl: branding.xUrl,
        linkedinUrl: branding.linkedinUrl,
        nextSteps: branding.nextSteps,
      }
    : null;

  const { interpolateSubject } = await import("../interpolate");
  const { resolveFromAddress } = await import("../resolveFromAddress");

  const { from, replyTo } = await resolveFromAddress({
    organizationId: campaign.organizationId,
    broadcast: campaign,
    senderName: branding?.senderName,
  });

  let rawHtml: string;
  let interpolatedSubject: string;

  if (campaign.personalizeEvent && recipient.registrationId) {
    // Personalized certificate-style send (e.g. Camp Invitation) — one
    // recipient per registration, its own camper/room/QR variables,
    // rendered through the event-assembler pipeline instead of the
    // generic TipTap-only path.
    const { renderEmailWithEvent } = await import("../renderer");
    const prisma = (await import("../../db")).prisma;

    const registration = await (prisma as any).registration.findUniqueOrThrow({
      where: { id: recipient.registrationId },
      include: CAMP_INVITATION_INCLUDE,
    });
    const personalized = buildCampInvitationVariables(registration);
    const variables = { ...(personalized?.variables ?? {}), support_email: branding?.supportEmail ?? "" };

    ({ text: interpolatedSubject } = interpolateSubject(campaign.subject, variables));
    ({ html: rawHtml } = await renderEmailWithEvent({
      eventKey: campaign.personalizeEvent,
      variables,
      branding: brandingParams,
      tiptapJson: campaign.body as Record<string, unknown>,
      qrDataUrl: personalized?.qrSrc,
      previewText: campaign.previewText,
      idCard: {
        enabled: !!branding?.idCardEnabled,
        imageUrl: registration.qrToken
          ? `${process.env.NEXTAUTH_URL ?? "http://localhost:3001"}/api/id-card/${registration.qrToken}`
          : null,
      },
    }));
  } else {
    const { renderEmail } = await import("../renderer");
    const variables = {
      organization_name: org?.name ?? "",
      support_email: branding?.supportEmail ?? "",
      support_phone: branding?.supportPhone ?? "",
      sender_name: branding?.senderName ?? "",
      dashboard_url: `${process.env.NEXTAUTH_URL ?? "http://localhost:3001"}/dashboard`,
    };
    ({ text: interpolatedSubject } = interpolateSubject(campaign.subject, variables));
    ({ html: rawHtml } = await renderEmail({
      tiptapJson: campaign.body as Record<string, unknown>,
      variables,
      branding: brandingParams,
    }));
  }

  const html = injectTracking(rawHtml, { recipientId: recipient.id, campaignId: campaign.id });

  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const resendResult = await resend.emails.send({
    from,
    to: recipient.email,
    subject: interpolatedSubject,
    html,
    replyTo,
    attachments: campaign.attachments
      ? (campaign.attachments as Array<{ url: string; fileName: string }>).map((a) => ({
          filename: a.fileName,
          path: a.url,
        }))
      : undefined,
  });

  return { providerMessageId: resendResult.data?.id ?? undefined };
}

/**
 * Sends (or resumes sending) a campaign.
 *
 * Resume semantics: which recipients already exist is decided by the
 * EmailRecipient rows' userIds — NOT by side-effect txIds (those are recipient
 * ids, a different id space — mixing them up resends to everyone). A campaign
 * in SENDING with existing effects is a resume (e.g. after PAUSED), not an
 * error; COMPLETED/CANCELLED campaigns refuse to send.
 */
export async function sendCampaign(
  prisma: TxClient,
  campaignId: string
): Promise<SendCampaignResult> {
  const campaign = await (prisma as any).emailCampaign.findUnique({
    where: { id: campaignId },
    include: { organization: { include: { branding: true } }, savedAudience: true },
  });

  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status === "COMPLETED") throw new Error("Campaign is already completed");
  if (campaign.status === "CANCELLED") throw new Error("Campaign is cancelled");

  // Resolve audience — prefer savedAudience filterDefinition, fall back to inline audienceFilter
  let filter: AudienceFilter;
  if (campaign.savedAudience?.filterDefinition) {
    filter = campaign.savedAudience.filterDefinition as AudienceFilter;
  } else {
    filter = (campaign.audienceFilter || { recipientType: "ALL" }) as AudienceFilter;
  }

  // Personalized certificate-style campaigns (e.g. Camp Invitation) resolve
  // one recipient per APPROVED registration in the target camp, not
  // resolveAudience()'s flat one-per-user list — see resolvePersonalizedRecipients.
  const users: (ResolvedUser | ResolvedPersonalizedUser)[] =
    campaign.personalizeEvent && campaign.personalizeCampId
      ? await resolvePersonalizedRecipients(prisma, campaign.organizationId, campaign.personalizeCampId, filter)
      : (await resolveAudience(prisma, campaign.organizationId, filter)).users;

  // Resume-safe dedupe: recipients already created for THIS campaign. Keyed
  // by registrationId when personalized (a parent with two approved
  // registrations for the same camp must get two separate invitations, not
  // be deduped down to one by a shared userId), by userId otherwise.
  const existingRecipients = await (prisma as any).emailRecipient.findMany({
    where: { campaignId },
    select: { userId: true, registrationId: true },
  });
  const dedupeKey = (u: { id: string; registrationId?: string }) => u.registrationId ?? u.id;
  const existingKeys = new Set<string>(existingRecipients.map((r: any) => r.registrationId ?? r.userId));
  const newUsers = users.filter((u) => !existingKeys.has(dedupeKey(u as ResolvedPersonalizedUser)));

  if (existingRecipients.length === 0 && newUsers.length === 0) {
    await (prisma as any).emailCampaign.update({
      where: { id: campaignId },
      data: { status: "FAILED" },
    });
    throw new Error("No recipients found for the selected audience");
  }

  // Update campaign status (idempotent on resume)
  await (prisma as any).emailCampaign.update({
    where: { id: campaignId },
    data: {
      status: "SENDING",
      startedAt: campaign.startedAt ?? new Date(),
      recipientCount: users.length,
    },
  });

  if (newUsers.length > 0) {
    // Batch create recipients
    const recipients = await (prisma as any).$transaction(
      newUsers.map((user: ResolvedUser | ResolvedPersonalizedUser) =>
        (prisma as any).emailRecipient.create({
          data: {
            campaignId,
            organizationId: campaign.organizationId,
            userId: user.id,
            registrationId: (user as ResolvedPersonalizedUser).registrationId ?? null,
            email: user.email,
            recipientType: recipientTypeForRole(user.role),
            deliveryStatus: "QUEUED",
          },
        })
      )
    );

    // Batch create side effects
    await (prisma as any).sideEffect.createMany({
      data: recipients.map((recipient: any, i: number) => ({
        campaignId,
        organizationId: campaign.organizationId,
        type: "CAMPAIGN_SEND",
        status: "QUEUED",
        deliverySource: "CAMPAIGN",
        recipientEmail: newUsers[i].email,
        recipientType: newUsers[i].role,
        txId: recipient.id,
      })),
    });
  }

  // Process first batch (up to 50) immediately
  const due = await (prisma as any).sideEffect.findMany({
    where: {
      campaignId,
      type: "CAMPAIGN_SEND",
      status: "QUEUED",
      runAfter: { lte: new Date() },
    },
    take: 50,
  });

  for (const effect of due) {
    try {
      const recipient = await (prisma as any).emailRecipient.findUnique({
        where: { id: effect.txId },
      });
      if (!recipient) continue;

      const { providerMessageId } = await renderAndSendCampaignEmail(campaign, recipient);

      await (prisma as any).emailRecipient.update({
        where: { id: recipient.id },
        data: {
          deliveryStatus: "SENT",
          sentAt: new Date(),
          providerMessageId: providerMessageId ?? undefined,
        },
      });
      await (prisma as any).sideEffect.update({
        where: { id: effect.id },
        data: { status: "DONE" },
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await (prisma as any).emailRecipient.update({
        where: { id: effect.txId },
        data: {
          deliveryStatus: "FAILED",
          failedReason: errorMsg,
          retryCount: { increment: 1 },
        },
      }).catch(() => {});
      await (prisma as any).sideEffect.update({
        where: { id: effect.id },
        data: {
          status: "FAILED",
          lastError: errorMsg,
          attempts: { increment: 1 },
        },
      }).catch(() => {});
    }
  }

  // If the immediate batch drained the queue, the campaign is done
  const remaining = await (prisma as any).sideEffect.count({
    where: { campaignId, type: "CAMPAIGN_SEND", status: "QUEUED" },
  });
  if (remaining === 0) {
    await (prisma as any).emailCampaign.update({
      where: { id: campaignId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  }

  return { recipientCount: users.length };
}

export async function processCampaignSideEffect(
  prisma: TxClient,
  effectId: string
): Promise<void> {
  const effect = await (prisma as any).sideEffect.findUniqueOrThrow({ where: { id: effectId } });
  const recipient = await (prisma as any).emailRecipient.findUniqueOrThrow({ where: { id: effect.txId } });
  const campaign = await (prisma as any).emailCampaign.findUniqueOrThrow({
    where: { id: effect.campaignId! },
    include: { organization: { include: { branding: true } } },
  });

  const { providerMessageId } = await renderAndSendCampaignEmail(campaign, recipient);

  await (prisma as any).emailRecipient.update({
    where: { id: recipient.id },
    data: {
      deliveryStatus: "SENT",
      sentAt: new Date(),
      providerMessageId: providerMessageId ?? undefined,
    },
  });
}

export async function scheduleCampaign(
  prisma: TxClient,
  campaignId: string,
  scheduledFor: Date
): Promise<void> {
  await (prisma as any).emailCampaign.update({
    where: { id: campaignId },
    data: { status: "SCHEDULED", scheduledFor },
  });
}

export async function processScheduledCampaigns(
  prisma: TxClient
): Promise<void> {
  const due = await (prisma as any).emailCampaign.findMany({
    where: {
      status: "SCHEDULED",
      scheduledFor: { lte: new Date() },
    },
    take: 10,
  });

  for (const campaign of due) {
    try {
      await sendCampaign(prisma, campaign.id);
    } catch (err) {
      console.error(
        `Failed to process scheduled campaign ${campaign.id}:`,
        err
      );
    }
  }
}
