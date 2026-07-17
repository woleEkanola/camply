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
import { interpolateTipTapJson } from "./interpolate";

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

export function renderTemplateContent(
  tiptapJson: Record<string, unknown>,
  variables: Record<string, string>
): { html: string; unknownTokens: string[] } {
  const { node: interpolatedJson, unknownTokens } = interpolateTipTapJson(tiptapJson, variables);

  const html = generateHTML(interpolatedJson, [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    Underline,
    Link.configure({ openOnClick: true }),
    Image,
    EmailButton,
  ]);

  return { html, unknownTokens };
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
  previewText?: string;
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
  previewText?: string | null;
}): Promise<{ html: string; unknownTokens: string[] }> {
  const { eventKey, variables, branding, tiptapJson, qrDataUrl, previewText } = params;

  let bodyContent: string | undefined;
  let unknownTokens: string[] = [];

  if (tiptapJson) {
    const contentResult = renderTemplateContent(tiptapJson, variables);
    bodyContent = contentResult.html;
    unknownTokens = contentResult.unknownTokens;
  }

  const assembler = EVENT_ASSEMBLERS[eventKey];
  if (!assembler) {
    // Fallback for unknown events — render TipTap content with minimal branding
    const content = [
      bodyContent ? Section({ children: bodyContent }) : "",
      SupportCard({ supportEmail: branding?.supportEmail, supportPhone: branding?.supportPhone, websiteUrl: branding?.websiteUrl }),
      EmailFooter({ branding }),
    ].filter(Boolean).join("\n");
    return {
      html: EmailLayout({ content, branding, previewText: previewText || "Camply Notification" }),
      unknownTokens,
    };
  }

  return {
    html: assembler({
      variables,
      branding,
      bodyContent,
      qrDataUrl,
      previewText: previewText ?? undefined,
    }),
    unknownTokens,
  };
}

// ─── Legacy renderEmail (backward-compatible) ───────────────────────────────

export async function renderEmail(params: {
  tiptapJson: Record<string, unknown>;
  variables: Record<string, string>;
  branding: Branding | null;
}): Promise<{ html: string; unknownTokens: string[] }> {
  const { html: content, unknownTokens } = renderTemplateContent(params.tiptapJson, params.variables);
  if (params.branding) {
    const body = [
      Section({ children: content }),
      SupportCard({ supportEmail: params.branding.supportEmail, supportPhone: params.branding.supportPhone, websiteUrl: params.branding.websiteUrl }),
      EmailFooter({ branding: params.branding }),
    ].filter(Boolean).join("\n");
    return {
      html: EmailLayout({ content: body, branding: params.branding }),
      unknownTokens,
    };
  }
  return {
    html: `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:16px;">${content}</body></html>`,
    unknownTokens,
  };
}
