import { generateHTML } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { EmailButton } from "./buttonExtension";
import { EmailLayout, EmailFooter, SupportCard, Section } from "./components";
import {
  buildApprovedEmail,
  buildSubmittedEmail,
  buildCorrectionEmail,
  buildRejectedEmail,
  buildWaitlistedEmail,
  buildStaffApprovedEmail,
  buildStaffRejectedEmail,
  buildWelcomeEmail,
  buildOtpEmail,
} from "./events/assemblers";

export interface Branding {
  logoUrl?: string | null;
  primaryColor: string;
  accentColor: string;
  buttonColor: string;
  headerImageUrl?: string | null;
  senderName?: string | null;
  footerText?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  websiteUrl?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  address?: string | null;
}

// ─── TipTap → HTML ──────────────────────────────────────────────────────────

export function renderTemplateContent(tiptapJson: Record<string, unknown>, variables: Record<string, string>): string {
  let html = generateHTML(tiptapJson, [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    Underline,
    Link.configure({ openOnClick: true }),
    Image,
    EmailButton,
  ]);

  for (const [key, value] of Object.entries(variables)) {
    html = html.split(`{{${key}}}`).join(value ?? "");
  }

  return html;
}

// ─── Event-based email rendering (new pipeline) ─────────────────────────────

type EmailEventKey =
  | "REGISTRATION_APPROVED"
  | "REGISTRATION_REJECTED"
  | "REGISTRATION_SUBMITTED"
  | "CORRECTION_REQUESTED"
  | "REGISTRATION_WAITLISTED"
  | "STAFF_APPROVED"
  | "STAFF_REJECTED"
  | "OTP_EMAIL"
  | "WELCOME_EMAIL";

const EVENT_ASSEMBLERS: Record<EmailEventKey, (p: {
  variables: Record<string, string>;
  branding: Branding | null;
  bodyContent?: string;
  qrDataUrl?: string;
}) => string> = {
  REGISTRATION_APPROVED: buildApprovedEmail,
  REGISTRATION_REJECTED: buildRejectedEmail,
  REGISTRATION_SUBMITTED: buildSubmittedEmail,
  CORRECTION_REQUESTED: buildCorrectionEmail,
  REGISTRATION_WAITLISTED: buildWaitlistedEmail,
  STAFF_APPROVED: buildStaffApprovedEmail,
  STAFF_REJECTED: buildStaffRejectedEmail,
  OTP_EMAIL: buildOtpEmail,
  WELCOME_EMAIL: buildWelcomeEmail,
};

export async function renderEmailWithEvent(params: {
  eventKey: EmailEventKey;
  variables: Record<string, string>;
  branding: Branding | null;
  tiptapJson?: Record<string, unknown>;
  qrDataUrl?: string;
}): Promise<string> {
  const { eventKey, variables, branding, tiptapJson, qrDataUrl } = params;

  // Render TipTap body content (admin-editable rich text portion)
  let bodyContent: string | undefined;
  if (tiptapJson) {
    bodyContent = renderTemplateContent(tiptapJson, variables);
  }

  const assembler = EVENT_ASSEMBLERS[eventKey];
  if (!assembler) {
    // Fallback for unknown events — render TipTap content with minimal branding
    const content = [
      bodyContent ? Section({ children: bodyContent }) : "",
      SupportCard({ supportEmail: branding?.supportEmail, supportPhone: branding?.supportPhone, websiteUrl: branding?.websiteUrl }),
      EmailFooter({ branding }),
    ].filter(Boolean).join("\n");
    return EmailLayout({ content, branding, previewText: "Camply Notification" });
  }

  return assembler({ variables, branding, bodyContent, qrDataUrl });
}

// ─── Legacy renderEmail (backward-compatible) ───────────────────────────────

export async function renderEmail(params: {
  tiptapJson: Record<string, unknown>;
  variables: Record<string, string>;
  branding: Branding | null;
}): Promise<string> {
  const content = renderTemplateContent(params.tiptapJson, params.variables);
  if (params.branding) {
    const body = [
      Section({ children: content }),
      SupportCard({ supportEmail: params.branding.supportEmail, supportPhone: params.branding.supportPhone, websiteUrl: params.branding.websiteUrl }),
      EmailFooter({ branding: params.branding }),
    ].filter(Boolean).join("\n");
    return EmailLayout({ content: body, branding: params.branding });
  }
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:16px;">${content}</body></html>`;
}
