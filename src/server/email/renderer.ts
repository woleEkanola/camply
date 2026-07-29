import { generateHTML } from "@tiptap/html/server";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { EmailButton } from "./buttonExtension";
import { EmailLayout, EmailFooter, SupportCard, Section, APPEND_SLOT } from "./components";
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
  buildCampInvitationEmail,
} from "./events/assemblers";
import { interpolateTipTapJson } from "./interpolate";

const ID_CARD_TOKEN_RE = /\{\{\s*camp_id_card\s*\}\}/g;

/**
 * Removes the literal {{camp_id_card}} token from template content.
 *
 * The card is never rendered inline where the token happens to sit — it is
 * always appended as its own page at the very end of the email (see
 * renderIdCardPage / appendIdCardPage). The token remains in the editor so
 * admins can see the template is opted in, but its position is ignored.
 *
 * Deliberately not a generic "HTML block variable": camp_id_card is the only
 * token that expands to markup, so it stays a pre-pass rather than a new
 * capability in interpolateHtml/interpolateTipTapJson, which only ever
 * substitute plain (escaped) strings.
 */
export function stripIdCardToken(html: string): string {
  return html.replace(ID_CARD_TOKEN_RE, "");
}

/**
 * The Camp ID card as a standalone page, or "" when the feature/template
 * isn't opted in or there's no image (e.g. no registration context).
 *
 * `page-break-before` is what makes it land on a second sheet when printed;
 * email clients that ignore print CSS simply show it at the bottom, which is
 * the intended reading order either way.
 */
export function renderIdCardPage(opts: { enabled: boolean; imageUrl: string | null }): string {
  if (!opts.enabled || !opts.imageUrl) return "";
  const escapedUrl = opts.imageUrl.replace(/"/g, "&quot;");
  return `
<div class="camply-id-card-page" style="page-break-before:always;break-before:page;margin-top:24px;">
  <img src="${escapedUrl}" alt="Camp ID Card" width="600" style="display:block;max-width:100%;width:100%;height:auto;border:0;" />
</div>`;
}

/** Fills the layout's append slot (or clears it when nothing is appended). */
export function appendIdCardPage(fullHtml: string, opts?: { enabled: boolean; imageUrl: string | null }): string {
  return fullHtml.replace(APPEND_SLOT, opts ? renderIdCardPage(opts) : "");
}

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
  // Camp Invitation certificate email fields (Phase 2 email redesign)
  tagline?: string | null;
  supportTitle?: string | null;
  supportDescription?: string | null;
  footerCopyright?: string | null;
  phone?: string | null;
  xUrl?: string | null;
  linkedinUrl?: string | null;
  nextSteps?: NextStepItem[] | null;
}

export interface NextStepItem {
  icon: string;
  title: string;
  description: string;
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
  | "WELCOME_EMAIL"
  // Campaign-triggered only (never an automatic lifecycle trigger — not
  // part of EmailEventConfig's event list) — see src/server/email/campaign/.
  | "CAMP_INVITATION";

const EVENT_ASSEMBLERS: Record<EmailEventKey, (p: {
  variables: Record<string, string>;
  branding: Branding | null;
  bodyContent?: string;
  qrSrc?: string;
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
  CAMP_INVITATION: buildCampInvitationEmail,
};

export async function renderEmailWithEvent(params: {
  eventKey: EmailEventKey;
  variables: Record<string, string>;
  branding: Branding | null;
  tiptapJson?: Record<string, unknown>;
  qrDataUrl?: string;
  previewText?: string | null;
  idCard?: { enabled: boolean; imageUrl: string | null };
}): Promise<{ html: string; unknownTokens: string[] }> {
  const { eventKey, variables, branding, tiptapJson, qrDataUrl, previewText, idCard } = params;

  let bodyContent: string | undefined;
  let unknownTokens: string[] = [];

  if (tiptapJson) {
    const contentResult = renderTemplateContent(tiptapJson, variables);
    // Always strip the token from the body — the card is appended as its own
    // page at the end, never rendered where the token sits.
    bodyContent = stripIdCardToken(contentResult.html);
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
      html: appendIdCardPage(
        EmailLayout({ content, branding, previewText: previewText || "Camply Notification" }),
        idCard
      ),
      unknownTokens,
    };
  }

  return {
    html: appendIdCardPage(
      assembler({
        variables,
        branding,
        bodyContent,
        qrSrc: qrDataUrl,
        previewText: previewText ?? undefined,
      }),
      idCard
    ),
    unknownTokens,
  };
}

// ─── Legacy renderEmail (backward-compatible) ───────────────────────────────

export async function renderEmail(params: {
  tiptapJson: Record<string, unknown>;
  variables: Record<string, string>;
  branding: Branding | null;
  idCard?: { enabled: boolean; imageUrl: string | null };
}): Promise<{ html: string; unknownTokens: string[] }> {
  const { html: rawContent, unknownTokens } = renderTemplateContent(params.tiptapJson, params.variables);
  const content = stripIdCardToken(rawContent);
  if (params.branding) {
    const body = [
      Section({ children: content }),
      SupportCard({ supportEmail: params.branding.supportEmail, supportPhone: params.branding.supportPhone, websiteUrl: params.branding.websiteUrl }),
      EmailFooter({ branding: params.branding }),
    ].filter(Boolean).join("\n");
    return {
      html: appendIdCardPage(EmailLayout({ content: body, branding: params.branding }), params.idCard),
      unknownTokens,
    };
  }
  // Unbranded fallback has no EmailLayout (and so no append slot) — put the
  // card page directly after the content instead.
  const idCardPage = params.idCard ? renderIdCardPage(params.idCard) : "";
  return {
    html: `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:16px;">${content}${idCardPage}</body></html>`,
    unknownTokens,
  };
}
