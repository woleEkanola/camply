import crypto from "crypto";
import type { PrismaClient } from "@prisma/client";
import type { CreateBatchEmailOptions, CreateEmailOptions } from "resend";
import { resolveAudience, type ResolvedUser } from "../audience/resolver";
import type { AudienceFilter } from "../audience/filters";
import { injectTracking } from "../tracking/injectTracking";
import { buildCampIdCardData } from "../../idcard/data";
import {
  type CampaignAttachment,
  validateCampaignAttachments,
} from "../../../lib/email/campaignAttachments";
import { CAMP_INVITATION_INCLUDE, buildCampInvitationVariables } from "./personalize";

type TxClient = PrismaClient<any> | Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

interface ResolvedPersonalizedUser extends ResolvedUser {
  registrationId: string;
  readinessIssues: string[];
  camperName: string;
}

export interface CampaignReadinessIssue {
  registrationId: string;
  camperName: string;
  email: string;
  reasons: string[];
}

export interface CampaignReadiness {
  ready: number;
  held: number;
  total: number;
  sharedAttachments: number;
  personalizedPdfs: number;
  estimatedSeconds: number;
  blockingErrors: string[];
  issues: CampaignReadinessIssue[];
}

interface SendCampaignResult extends CampaignReadiness {
  recipientCount: number;
}

const PERSONALIZED_STATUSES = ["APPROVED", "CHECKED_IN"];
const DEFAULT_REQUESTS_PER_SECOND = 4;
let nextResendRequestAt = 0;
let requestSpacingMs = Math.ceil(1000 / configuredRequestsPerSecond());

function configuredRequestsPerSecond(): number {
  const parsed = Number(process.env.RESEND_MAX_REQUESTS_PER_SECOND ?? DEFAULT_REQUESTS_PER_SECOND);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 5) : DEFAULT_REQUESTS_PER_SECOND;
}

function recipientTypeForRole(role: string): string {
  if (role === "PARENT") return "PARENT";
  if (role === "TEACHER") return "TEACHER";
  if (role === "VOLUNTEER") return "VOLUNTEER";
  if (role === "CAMPUS_REPRESENTATIVE") return "CAMPUS_REP";
  return "ADMIN";
}

function publicAppUrl(): { url: string; error?: string } {
  const raw = (process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3001").replace(/\/$/, "");
  try {
    const url = new URL(raw);
    if (process.env.NODE_ENV === "production" && (url.protocol !== "https:" || ["localhost", "127.0.0.1"].includes(url.hostname))) {
      return { url: raw, error: "APP_URL must be a public HTTPS address before personalized ID-card emails can be sent." };
    }
    return { url: raw };
  } catch {
    return { url: raw, error: "APP_URL is not a valid absolute URL." };
  }
}

function campaignFilter(campaign: any): AudienceFilter {
  return (campaign.savedAudience?.filterDefinition || campaign.audienceFilter || { recipientType: "ALL" }) as AudienceFilter;
}

function personalizedWhere(campaign: any, filter: AudienceFilter, manualEmails: string[]) {
  const where: Record<string, unknown> = {
    campId: campaign.personalizeCampId,
    status: { in: PERSONALIZED_STATUSES },
    deletedAt: null,
    campus: { organizationId: campaign.organizationId },
  };
  const campusId = (filter.filters as { campusId?: string } | undefined)?.campusId;
  if (campusId) where.campusId = campusId;
  if (manualEmails.length > 0) where.camper = { user: { email: { in: manualEmails } } };
  return where;
}

function assessRegistration(registration: any, commonIssues: string[]): string[] {
  const reasons = [...commonIssues];
  if (!registration.camper?.user?.email) reasons.push("Parent email is missing.");
  if (!registration.registrationNumber) reasons.push("Registration number is missing.");
  if (!registration.qrToken) reasons.push("QR token is missing.");
  if (!registration.tribe) reasons.push("Tribe is not assigned.");
  if (!registration.camper?.name) reasons.push("Camper name is missing.");
  if (reasons.length === 0 && !buildCampIdCardData(registration)) reasons.push("The personalized ID card could not be rendered from this registration.");
  return [...new Set(reasons)];
}

async function resolvePersonalizedRecipients(
  prisma: TxClient,
  campaign: any,
  filter: AudienceFilter,
  manualEmails: string[]
): Promise<ResolvedPersonalizedUser[]> {
  const brandingEnabled = !!campaign.organization?.branding?.idCardEnabled;
  const appUrl = publicAppUrl();
  const commonIssues = [
    ...(!brandingEnabled ? ["Camp ID cards are disabled in Communication settings."] : []),
    ...(appUrl.error ? [appUrl.error] : []),
  ];
  const registrations = await (prisma as any).registration.findMany({
    where: personalizedWhere(campaign, filter, manualEmails),
    include: CAMP_INVITATION_INCLUDE,
    orderBy: { createdAt: "asc" },
  });

  return registrations.map((registration: any) => ({
    id: registration.camper.userId,
    email: registration.camper.user?.email ?? "",
    firstName: null,
    lastName: null,
    role: "PARENT",
    registrationId: registration.id,
    camperName: registration.camper.name,
    readinessIssues: assessRegistration(registration, commonIssues),
  }));
}

async function loadCampaign(prisma: TxClient, campaignId: string) {
  return (prisma as any).emailCampaign.findUnique({
    where: { id: campaignId },
    include: { organization: { include: { branding: true } }, savedAudience: true },
  });
}

async function resolveRecipients(prisma: TxClient, campaign: any, manualEmails: string[]) {
  const filter = campaignFilter(campaign);
  if (campaign.personalizeEvent && campaign.personalizeCampId) {
    return resolvePersonalizedRecipients(prisma, campaign, filter, manualEmails);
  }
  if (manualEmails.length > 0) {
    const users = await (prisma as any).user.findMany({
      where: { email: { in: manualEmails }, organizationId: campaign.organizationId },
    });
    return users.map((user: any) => ({ ...user, readinessIssues: [] }));
  }
  const result = await resolveAudience(prisma, campaign.organizationId, filter);
  return result.users.map((user) => ({ ...user, readinessIssues: [] }));
}

export async function getCampaignReadiness(
  prisma: TxClient,
  campaignId: string,
  opts?: { manualEmails?: string[] }
): Promise<CampaignReadiness> {
  const campaign = await loadCampaign(prisma, campaignId);
  if (!campaign) throw new Error("Campaign not found");
  const attachments = (campaign.attachments || []) as CampaignAttachment[];
  const blockingErrors = validateCampaignAttachments(attachments);
  const manualEmails = [...new Set((opts?.manualEmails ?? []).map((email) => email.trim().toLowerCase()).filter(Boolean))];
  const recipients = await resolveRecipients(prisma, campaign, manualEmails);
  const issues: CampaignReadinessIssue[] = recipients
    .filter((recipient: any) => recipient.readinessIssues.length > 0)
    .map((recipient: any) => ({
      registrationId: recipient.registrationId,
      camperName: recipient.camperName || recipient.firstName || "Camper",
      email: recipient.email,
      reasons: recipient.readinessIssues,
    }));
  const ready = recipients.length - issues.length;
  const personalized = !!(campaign.personalizeEvent && campaign.personalizeCampId);
  const individual = personalized || attachments.length > 0;
  return {
    ready,
    held: issues.length,
    total: recipients.length,
    sharedAttachments: attachments.length,
    personalizedPdfs: personalized ? ready : 0,
    estimatedSeconds: ready === 0 ? 0 : individual ? Math.ceil(ready / configuredRequestsPerSecond()) : Math.ceil(ready / (configuredRequestsPerSecond() * 100)),
    blockingErrors,
    issues,
  };
}

function brandingParams(branding: any) {
  return branding ? {
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
  } : null;
}

async function prepareCampaignEmail(campaign: any, recipient: any): Promise<CreateEmailOptions> {
  const org = campaign.organization;
  const branding = org?.branding;
  const { interpolateSubject } = await import("../interpolate");
  const { resolveFromAddress } = await import("../resolveFromAddress");
  const { from, replyTo } = await resolveFromAddress({
    organizationId: campaign.organizationId,
    broadcast: campaign,
    senderName: branding?.senderName,
  });

  let rawHtml: string;
  let interpolatedSubject: string;
  const sharedAttachments = ((campaign.attachments || []) as CampaignAttachment[]).map((attachment) => ({
    filename: attachment.fileName,
    path: attachment.url,
  }));
  const generatedAttachments: Array<{ filename: string; path: string }> = [];

  if (campaign.personalizeEvent && recipient.registrationId) {
    const { renderEmailWithEvent } = await import("../renderer");
    const prisma = (await import("../../db")).prisma;
    const registration = await (prisma as any).registration.findUniqueOrThrow({
      where: { id: recipient.registrationId },
      include: CAMP_INVITATION_INCLUDE,
    });
    const reasons = assessRegistration(registration, [
      ...(!branding?.idCardEnabled ? ["Camp ID cards are disabled in Communication settings."] : []),
      ...(publicAppUrl().error ? [publicAppUrl().error!] : []),
    ]);
    if (reasons.length > 0) throw new PermanentCampaignError(reasons.join(" "));
    const personalized = buildCampInvitationVariables(registration)!;
    const variables = { ...personalized.variables, support_email: branding?.supportEmail ?? "" };
    ({ text: interpolatedSubject } = interpolateSubject(campaign.subject, variables));
    const baseUrl = publicAppUrl().url;
    ({ html: rawHtml } = await renderEmailWithEvent({
      eventKey: campaign.personalizeEvent,
      variables,
      branding: brandingParams(branding),
      tiptapJson: campaign.body as Record<string, unknown>,
      qrDataUrl: personalized.qrSrc,
      previewText: campaign.previewText,
      idCard: { enabled: true, imageUrl: `${baseUrl}/api/id-card/${registration.qrToken}/sheet` },
    }));
    const safeNumber = String(registration.registrationNumber).replace(/[^a-zA-Z0-9_-]+/g, "-");
    generatedAttachments.push({
      filename: `camp-id-card-${safeNumber}.pdf`,
      path: `${baseUrl}/api/id-card/${registration.qrToken}/sheet.pdf`,
    });
  } else {
    const { renderEmail } = await import("../renderer");
    const variables = {
      organization_name: org?.name ?? "",
      support_email: branding?.supportEmail ?? "",
      support_phone: branding?.supportPhone ?? "",
      sender_name: branding?.senderName ?? "",
      dashboard_url: `${publicAppUrl().url}/dashboard`,
    };
    ({ text: interpolatedSubject } = interpolateSubject(campaign.subject, variables));
    ({ html: rawHtml } = await renderEmail({
      tiptapJson: campaign.body as Record<string, unknown>,
      variables,
      branding: brandingParams(branding),
    }));
  }

  return {
    from,
    to: recipient.email,
    subject: interpolatedSubject,
    html: injectTracking(rawHtml, { recipientId: recipient.id, campaignId: campaign.id }),
    replyTo,
    attachments: [...generatedAttachments, ...sharedAttachments].length > 0
      ? [...generatedAttachments, ...sharedAttachments]
      : undefined,
  };
}

export class PermanentCampaignError extends Error {}

export class ResendCampaignError extends Error {
  constructor(message: string, public readonly retryAfterMs?: number, public readonly permanent = false) {
    super(message);
  }
}

async function waitForRateSlot() {
  const delay = Math.max(0, nextResendRequestAt - Date.now());
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  nextResendRequestAt = Date.now() + requestSpacingMs;
}

function applyRateHeaders(headers: Record<string, string> | null) {
  if (!headers) return;
  const limit = Number(headers["ratelimit-limit"] ?? headers["x-ratelimit-limit"]);
  if (Number.isFinite(limit) && limit > 0) requestSpacingMs = Math.max(requestSpacingMs, Math.ceil(1000 / limit));
  const remaining = Number(headers["ratelimit-remaining"] ?? headers["x-ratelimit-remaining"]);
  const retryAfter = Number(headers["retry-after"]);
  if (remaining === 0 && Number.isFinite(retryAfter)) nextResendRequestAt = Math.max(nextResendRequestAt, Date.now() + retryAfter * 1000);
}

function resendError(result: { error: any; headers: Record<string, string> | null }): ResendCampaignError {
  const retryAfter = Number(result.headers?.["retry-after"]);
  const status = result.error?.statusCode;
  const permanent = status != null && status >= 400 && status < 500 && status !== 408 && status !== 409 && status !== 429;
  return new ResendCampaignError(result.error?.message || "Resend rejected the email.", Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined, permanent);
}

async function sendPreparedEmail(payload: CreateEmailOptions, idempotencyKey: string) {
  const { Resend } = await import("resend");
  await waitForRateSlot();
  const result = await new Resend(process.env.RESEND_API_KEY).emails.send(payload, { idempotencyKey });
  applyRateHeaders(result.headers);
  if (result.error) throw resendError(result);
  return result.data.id;
}

export async function sendCampaign(
  prisma: TxClient,
  campaignId: string,
  opts?: { manualEmails?: string[] }
): Promise<SendCampaignResult> {
  const campaign = await loadCampaign(prisma, campaignId);
  if (!campaign) throw new Error("Campaign not found");
  if (["COMPLETED", "CANCELLED"].includes(campaign.status)) throw new Error(`Campaign is already ${campaign.status.toLowerCase()}`);
  const attachmentErrors = validateCampaignAttachments((campaign.attachments || []) as CampaignAttachment[]);
  if (attachmentErrors.length > 0) throw new Error(attachmentErrors.join(" "));

  const manualEmails = [...new Set((opts?.manualEmails ?? []).map((email) => email.trim().toLowerCase()).filter(Boolean))];
  const users = await resolveRecipients(prisma, campaign, manualEmails);
  if (["DRAFT", "SCHEDULED"].includes(campaign.status)) {
    const claimed = await (prisma as any).emailCampaign.updateMany({
      where: { id: campaignId, status: campaign.status },
      data: { status: "QUEUING", startedAt: campaign.startedAt ?? new Date() },
    });
    if (claimed.count === 0) throw new Error("This campaign is already being queued by another operator.");
  }
  const existingRecipients = await (prisma as any).emailRecipient.findMany({
    where: { campaignId },
    select: { userId: true, registrationId: true },
  });
  const existingKeys = new Set(existingRecipients.map((recipient: any) => recipient.registrationId ?? recipient.userId));
  const newUsers = users.filter((user: any) => !existingKeys.has(user.registrationId ?? user.id));
  if (existingRecipients.length === 0 && newUsers.length === 0) {
    await (prisma as any).emailCampaign.update({ where: { id: campaignId }, data: { status: "FAILED" } });
    throw new Error("No recipients found for the selected audience");
  }

  const created = newUsers.length > 0
    ? await (prisma as any).$transaction(newUsers.map((user: any) => (prisma as any).emailRecipient.create({
        data: {
          campaignId,
          organizationId: campaign.organizationId,
          userId: user.id,
          registrationId: user.registrationId ?? null,
          email: user.email,
          recipientType: recipientTypeForRole(user.role),
          deliveryStatus: user.readinessIssues.length > 0 ? "HELD" : "QUEUED",
          failedReason: user.readinessIssues.length > 0 ? user.readinessIssues.join(" ") : null,
        },
      })))
    : [];

  const readyRecipients = created.filter((recipient: any) => recipient.deliveryStatus === "QUEUED");
  if (readyRecipients.length > 0) {
    await (prisma as any).sideEffect.createMany({
      data: readyRecipients.map((recipient: any) => ({
        campaignId,
        organizationId: campaign.organizationId,
        type: "CAMPAIGN_SEND",
        status: "QUEUED",
        deliverySource: "CAMPAIGN",
        recipientEmail: recipient.email,
        recipientType: recipient.recipientType,
        txId: recipient.id,
      })),
    });
  }

  const heldCount = await (prisma as any).emailRecipient.count({ where: { campaignId, deliveryStatus: "HELD" } });
  const queuedCount = await (prisma as any).emailRecipient.count({ where: { campaignId, deliveryStatus: "QUEUED" } });
  await (prisma as any).emailCampaign.update({
    where: { id: campaignId },
    data: {
      status: queuedCount > 0 ? "SENDING" : heldCount > 0 ? "NEEDS_ATTENTION" : "COMPLETED",
      startedAt: campaign.startedAt ?? new Date(),
      completedAt: queuedCount === 0 && heldCount === 0 ? new Date() : null,
      recipientCount: existingRecipients.length + newUsers.length,
    },
  });

  const readiness = await getCampaignReadiness(prisma, campaignId, { manualEmails });
  return { ...readiness, recipientCount: existingRecipients.length + newUsers.length };
}

export async function processCampaignSideEffect(prisma: TxClient, effectId: string): Promise<void> {
  const effect = await (prisma as any).sideEffect.findUniqueOrThrow({ where: { id: effectId } });
  const recipient = await (prisma as any).emailRecipient.findUniqueOrThrow({ where: { id: effect.txId } });
  const campaign = await loadCampaign(prisma, effect.campaignId!);
  const payload = await prepareCampaignEmail(campaign, recipient);
  const providerMessageId = await sendPreparedEmail(payload, `campaign-${campaign.id}-recipient-${recipient.id}`);
  await (prisma as any).emailRecipient.update({
    where: { id: recipient.id },
    data: { deliveryStatus: "SENT", sentAt: new Date(), providerMessageId, failedReason: null },
  });
}

export async function processCampaignEffectBatch(prisma: TxClient, effectIds: string[]): Promise<void> {
  if (effectIds.length === 0) return;
  const effects = await (prisma as any).sideEffect.findMany({ where: { id: { in: effectIds } }, orderBy: { id: "asc" } });
  const campaign = await loadCampaign(prisma, effects[0].campaignId);
  if (!campaign) throw new Error("Campaign not found");
  const hasAttachments = !!campaign.personalizeEvent || ((campaign.attachments || []) as unknown[]).length > 0;
  if (hasAttachments) {
    for (const effect of effects) await processCampaignSideEffect(prisma, effect.id);
    return;
  }

  const recipients = await (prisma as any).emailRecipient.findMany({ where: { id: { in: effects.map((effect: any) => effect.txId) } } });
  const byId = new Map(recipients.map((recipient: any) => [recipient.id, recipient]));
  const orderedRecipients = effects.map((effect: any) => byId.get(effect.txId));
  const payloads: CreateBatchEmailOptions[] = [];
  for (const recipient of orderedRecipients) payloads.push(await prepareCampaignEmail(campaign, recipient) as CreateBatchEmailOptions);
  const digest = crypto.createHash("sha256").update(effects.map((effect: any) => effect.id).join(",")).digest("hex").slice(0, 32);
  const { Resend } = await import("resend");
  await waitForRateSlot();
  const result = await new Resend(process.env.RESEND_API_KEY).batch.send(payloads, { idempotencyKey: `campaign-${campaign.id}-batch-${digest}` });
  applyRateHeaders(result.headers);
  if (result.error) throw resendError(result);
  await (prisma as any).$transaction(orderedRecipients.map((recipient: any, index: number) => (prisma as any).emailRecipient.update({
    where: { id: recipient.id },
    data: { deliveryStatus: "SENT", sentAt: new Date(), providerMessageId: result.data.data[index]?.id, failedReason: null },
  })));
}

export async function retryHeldCampaignRecipients(prisma: TxClient, campaignId: string) {
  const campaign = await loadCampaign(prisma, campaignId);
  if (!campaign) throw new Error("Campaign not found");
  const held = await (prisma as any).emailRecipient.findMany({ where: { campaignId, deliveryStatus: "HELD", registrationId: { not: null } } });
  let queued = 0;
  for (const recipient of held) {
    const claimed = await (prisma as any).emailRecipient.updateMany({
      where: { id: recipient.id, deliveryStatus: "HELD" },
      data: { deliveryStatus: "PROCESSING" },
    });
    if (claimed.count === 0) continue;
    const registration = await (prisma as any).registration.findUnique({ where: { id: recipient.registrationId }, include: CAMP_INVITATION_INCLUDE });
    if (!registration) {
      await (prisma as any).emailRecipient.update({ where: { id: recipient.id }, data: { deliveryStatus: "HELD", failedReason: "Registration no longer exists." } });
      continue;
    }
    const reasons = assessRegistration(registration, [
      ...(!campaign.organization?.branding?.idCardEnabled ? ["Camp ID cards are disabled in Communication settings."] : []),
      ...(publicAppUrl().error ? [publicAppUrl().error!] : []),
    ]);
    if (reasons.length > 0) {
      await (prisma as any).emailRecipient.update({ where: { id: recipient.id }, data: { deliveryStatus: "HELD", failedReason: reasons.join(" ") } });
      continue;
    }
    await (prisma as any).$transaction([
      (prisma as any).emailRecipient.update({ where: { id: recipient.id }, data: { email: registration.camper.user.email, deliveryStatus: "QUEUED", failedReason: null } }),
      (prisma as any).sideEffect.create({ data: { campaignId, organizationId: campaign.organizationId, type: "CAMPAIGN_SEND", status: "QUEUED", deliverySource: "CAMPAIGN", recipientEmail: registration.camper.user.email, recipientType: "PARENT", txId: recipient.id } }),
    ]);
    queued++;
  }
  if (queued > 0) await (prisma as any).emailCampaign.update({ where: { id: campaignId }, data: { status: "SENDING", completedAt: null } });
  const stillHeld = await (prisma as any).emailRecipient.count({ where: { campaignId, deliveryStatus: "HELD" } });
  return { queued, stillHeld };
}

export async function scheduleCampaign(prisma: TxClient, campaignId: string, scheduledFor: Date): Promise<void> {
  await (prisma as any).emailCampaign.update({ where: { id: campaignId }, data: { status: "SCHEDULED", scheduledFor } });
}

export async function processScheduledCampaigns(prisma: TxClient): Promise<void> {
  const due = await (prisma as any).emailCampaign.findMany({ where: { status: "SCHEDULED", scheduledFor: { lte: new Date() } }, take: 10 });
  for (const campaign of due) {
    try { await sendCampaign(prisma, campaign.id); }
    catch (error) { console.error(`Failed to process scheduled campaign ${campaign.id}:`, error); }
  }
}
