import { prisma } from "../db";
import type { Branding } from "./renderer";

export interface LoadedTemplate {
  subject: string;
  tiptapJson: Record<string, unknown>;
  branding: Branding | null;
  enabled: boolean;
  channels: string[];
}

/**
 * Load the template configuration for a given event in an organization.
 * Returns null if the event is disabled or no config exists.
 */
export async function loadTemplateForEvent(
  organizationId: string,
  event: string
): Promise<LoadedTemplate | null> {
  const config = await prisma.emailEventConfig.findUnique({
    where: { organizationId_event: { organizationId, event } },
    include: { template: true },
  });

  if (!config || !config.enabled) return null;

  const branding = await prisma.organizationBranding.findUnique({
    where: { organizationId },
  });

  return {
    subject: config.template?.subject ?? getDefaultSubject(event),
    tiptapJson: (config.template?.content as Record<string, unknown>) ?? getDefaultContent(event),
    branding: branding
      ? {
          senderName: branding.senderName,
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
        }
      : null,
    enabled: config.enabled,
    channels: config.channels as string[],
  };
}

// ─── Fallback defaults (mirror current hardcoded content) ──────────────────

function getDefaultSubject(event: string): string {
  const subjects: Record<string, string> = {
    REGISTRATION_APPROVED: "You're approved for {{camp_name}}!",
    REGISTRATION_REJECTED: "Update on your registration for {{camp_name}}",
    REGISTRATION_SUBMITTED: "Registration received: {{camper_name}}",
    CORRECTION_REQUESTED: "Action needed for {{camper_name}}'s registration",
    REGISTRATION_WAITLISTED: "{{camper_name}} is on the waitlist for {{camp_name}}",
    STAFF_APPROVED: "You're approved as a {{staff_role}} for {{camp_name}}!",
    STAFF_REJECTED: "Update on your {{staff_role}} registration for {{camp_name}}",
    OTP_EMAIL: "Your OTP Code",
    WELCOME_EMAIL: "Welcome to Camply — verify your email",
  };
  return subjects[event] ?? "Camply Notification";
}

function getDefaultContent(event: string): Record<string, unknown> {
  const messages: Record<string, string> = {
    REGISTRATION_APPROVED: "Congratulations! {{camper_name}} has been approved for {{camp_name}}.",
    REGISTRATION_REJECTED: "{{camper_name}}'s registration for {{camp_name}} was not approved. Reason: {{rejection_reason}}",
    REGISTRATION_SUBMITTED: "We have received {{camper_name}}'s registration for {{camp_name}}. It is pending review and approval.",
    CORRECTION_REQUESTED: "We need more information for {{camper_name}}'s registration to {{camp_name}}. {{correction_message}}",
    REGISTRATION_WAITLISTED: "{{camper_name}} is currently on the waitlist for {{camp_name}}. We'll notify you if a space opens up.",
    STAFF_APPROVED: "Welcome to the team! Your {{staff_role}} registration for {{camp_name}} has been approved.",
    STAFF_REJECTED: "Your {{staff_role}} registration for {{camp_name}} was not approved.",
    OTP_EMAIL: "Your OTP code is: {{otp_code}}",
    WELCOME_EMAIL: "Welcome to Camply! Please verify your email address by clicking the link below:\n\n{{verify_url}}",
  };
  const text = messages[event] ?? "Camply notification.";
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}
