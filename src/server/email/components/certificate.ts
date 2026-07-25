// Certificate-style components for the Camp Invitation email — treats the
// email as an A4 admission certificate rather than a marketing email.
// Same table-based, Outlook-safe idiom as cards.ts/special.ts: pure HTML
// string generators, inline styles, plain Unicode/emoji glyphs for "icons"
// (never SVG — matches the established StatusBanner/QRCodeCard convention).

import { theme, escapeHtml } from "../theme";
import type { Branding, NextStepItem } from "../renderer";
import type { InfoRowData } from "./cards";

const DEFAULT_NEXT_STEPS: NextStepItem[] = [
  { icon: "🖨️", title: "Print This Page", description: "Print this page and bring it with you on check-in." },
  { icon: "📱", title: "Bring Your QR Code", description: "Present this QR code during check-in at the pickup center." },
  { icon: "⏰", title: "Arrive On Time", description: "Arrive before the reporting time listed above." },
  { icon: "🎒", title: "Pack & Prepare", description: "Bring all required items listed in your welcome packet." },
];

// ─── OrganizationHeader ─────────────────────────────────────────────────────

export function OrganizationHeader(params: { branding: Branding | null; orgName: string; rightLabel?: string }): string {
  const t = theme;
  const b = params.branding;
  const logo = b?.logoUrl
    ? `<img src="${escapeHtml(b.logoUrl)}" alt="${escapeHtml(params.orgName)}" width="44" height="44" style="display:block;width:44px;height:44px;border-radius:50%;object-fit:cover;" />`
    : "";
  const tagline = b?.tagline
    ? `<div style="font-size:${t.fontSize.caption}; color:${t.color.neutral[500]}; font-family:${t.font.family}; margin-top:2px;">${escapeHtml(b.tagline)}</div>`
    : "";

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:${t.spacing.md};">
  <tr>
    <td valign="middle" width="70%">
      <table cellpadding="0" cellspacing="0">
        <tr>
          ${logo ? `<td valign="middle" style="padding-right:${t.spacing.sm};">${logo}</td>` : ""}
          <td valign="middle">
            <div style="font-size:${t.fontSize.subheading}; font-weight:${t.fontWeight.bold}; color:${t.color.neutral[900]}; font-family:${t.font.family}; letter-spacing:0.3px;">${escapeHtml(params.orgName.toUpperCase())}</div>
            ${tagline}
          </td>
        </tr>
      </table>
    </td>
    <td valign="middle" align="right" width="30%">
      <span style="font-size:${t.fontSize.caption}; color:${t.color.neutral[500]}; font-family:${t.font.family};">${params.rightLabel ? escapeHtml(params.rightLabel) : ""}</span>
    </td>
  </tr>
</table>`;
}

// ─── VerificationCard (Hero + QR merged, two-column) ────────────────────────

export function VerificationCard(params: {
  title: string;
  description: string;
  qrSrc?: string;
  registrationNumber: string;
}): string {
  const t = theme;
  const qrColumn = params.qrSrc
    ? `
    <td valign="top" width="38%" style="padding:${t.spacing.lg}; text-align:center; border-left:1px solid ${t.color.neutral[100]};">
      <span style="font-size:${t.fontSize.label}; color:${t.color.success}; font-family:${t.font.family}; text-transform:uppercase; letter-spacing:0.5px; font-weight:${t.fontWeight.semibold};">Verified Registration</span>
      <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:${t.spacing.sm} 0;">
        <img src="${escapeHtml(params.qrSrc)}" alt="QR Code" width="150" height="150" style="display:block;width:150px;height:150px;background:#FFFFFF;image-rendering:crisp-edges;" />
      </td></tr></table>
      <div style="font-size:${t.fontSize.caption}; font-weight:${t.fontWeight.semibold}; color:${t.color.neutral[900]}; font-family:${t.font.family}; letter-spacing:0.5px;">${escapeHtml(params.registrationNumber)}</div>
      <div style="font-size:${t.fontSize.label}; color:${t.color.success}; font-family:${t.font.family}; margin-top:2px;">✓ Verified by Camply</div>
      <div style="font-size:${t.fontSize.label}; color:${t.color.neutral[400]}; font-family:${t.font.family}; margin-top:6px; line-height:1.4;">Present this QR during check-in.<br/>Do not share this code.</div>
    </td>`
    : "";

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="background:${t.color.neutral[50]}; border-radius:${t.radius.lg}; overflow:hidden; margin:${t.spacing.md} 0;">
  <tr>
    <td valign="top" width="${params.qrSrc ? "62%" : "100%"}" style="padding:${t.spacing.lg};">
      <div style="font-size:${t.fontSize.heading}; font-weight:${t.fontWeight.bold}; color:${t.color.neutral[900]}; font-family:${t.font.family}; margin-bottom:${t.spacing.sm};">${escapeHtml(params.title)}</div>
      <div style="font-size:${t.fontSize.body}; color:${t.color.neutral[700]}; font-family:${t.font.family}; line-height:1.6;">${params.description}</div>
    </td>
    ${qrColumn}
  </tr>
</table>`;
}

// ─── SplitInfoCard (two side-by-side InfoCard-style columns) ────────────────

function infoColumn(title: string, rows: InfoRowData[]): string {
  const t = theme;
  if (!rows.length) return "";
  const rowsHtml = rows
    .map(
      (r, i) => `
    <tr>
      <td style="padding:${t.spacing.sm} 0; border-bottom:${i < rows.length - 1 ? `1px solid ${t.color.neutral[100]}` : "none"};">
        <div style="font-size:${t.fontSize.label}; color:${t.color.neutral[400]}; font-family:${t.font.family}; text-transform:uppercase; letter-spacing:0.5px;">${escapeHtml(r.label)}</div>
        <div style="font-size:${t.fontSize.body}; font-weight:${t.fontWeight.semibold}; color:${t.color.neutral[900]}; font-family:${t.font.family}; margin-top:2px;">${escapeHtml(r.value)}</div>
      </td>
    </tr>`
    )
    .join("");

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="background:${t.color.surface}; border-radius:${t.radius.lg}; box-shadow:${t.shadow.card};">
  <tr><td style="padding:${t.spacing.md} ${t.spacing.lg} 0;">
    <div style="font-size:${t.fontSize.label}; font-weight:${t.fontWeight.bold}; color:${t.color.primary}; font-family:${t.font.family}; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:${t.spacing.xs};">${escapeHtml(title)}</div>
  </td></tr>
  <tr><td style="padding:0 ${t.spacing.lg} ${t.spacing.md};">
    <table width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
  </td></tr>
</table>`;
}

export function SplitInfoCard(params: {
  leftTitle: string;
  leftRows: InfoRowData[];
  rightTitle: string;
  rightRows: InfoRowData[];
  notice?: string;
}): string {
  const t = theme;
  const left = infoColumn(params.leftTitle, params.leftRows);
  const right = infoColumn(params.rightTitle, params.rightRows);
  const noticeHtml = params.notice
    ? `<tr><td style="padding-top:${t.spacing.sm};"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:#FFFBEB; border-radius:${t.radius.sm}; padding:${t.spacing.sm} ${t.spacing.md}; font-size:${t.fontSize.caption}; color:#92400E; font-family:${t.font.family}; line-height:1.5;">${params.notice}</td></tr></table></td></tr>`
    : "";

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin:${t.spacing.md} 0;">
  <tr>
    <td valign="top" width="48%">${left}</td>
    <td width="4%"></td>
    <td valign="top" width="48%">
      <table width="100%" cellpadding="0" cellspacing="0"><tr><td>${right}</td></tr>${noticeHtml}</table>
    </td>
  </tr>
</table>`;
}

// ─── TimelineCompact ─────────────────────────────────────────────────────────

export type CertificateTimelineStatus = "completed" | "current" | "upcoming";

export interface CertificateTimelineStage {
  label: string;
  date?: string;
  status: CertificateTimelineStatus;
}

export function TimelineCompact(params: { title?: string; stages: CertificateTimelineStage[] }): string {
  const t = theme;
  const cells = params.stages
    .map((s, i) => {
      const isLast = i === params.stages.length - 1;
      const fill = s.status === "completed" ? t.color.success : s.status === "current" ? t.color.primary : t.color.surface;
      const border = s.status === "completed" || s.status === "current" ? fill : t.color.neutral[300];
      const glyph = s.status === "completed" ? "✓" : "";
      const connector = !isLast
        ? `<td style="width:100%;height:2px;background:${s.status === "completed" ? t.color.success : t.color.neutral[200]};"></td>`
        : "";
      return `
    <td align="center" style="vertical-align:top; padding:0 2px;">
      <div style="width:22px;height:22px;line-height:20px;border-radius:50%;background:${fill};border:2px solid ${border};color:#FFFFFF;font-size:11px;font-weight:${t.fontWeight.bold};text-align:center;margin:0 auto;font-family:${t.font.family};">${glyph}</div>
      <div style="font-size:10px; font-weight:${s.status === "current" ? t.fontWeight.bold : t.fontWeight.normal}; color:${s.status === "upcoming" ? t.color.neutral[400] : t.color.neutral[900]}; font-family:${t.font.family}; margin-top:4px; max-width:74px;">${escapeHtml(s.label)}</div>
      ${s.date ? `<div style="font-size:10px; color:${s.status === "current" ? t.color.primary : t.color.neutral[400]}; font-family:${t.font.family};">${escapeHtml(s.date)}</div>` : ""}
    </td>
    ${connector}`;
    })
    .join("");

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin:${t.spacing.md} 0; background:${t.color.surface}; border-radius:${t.radius.lg}; box-shadow:${t.shadow.card};">
  ${params.title ? `<tr><td style="padding:${t.spacing.md} ${t.spacing.lg} 0; font-size:${t.fontSize.label}; font-weight:${t.fontWeight.bold}; color:${t.color.primary}; font-family:${t.font.family}; text-transform:uppercase; letter-spacing:0.5px;">${escapeHtml(params.title)}</td></tr>` : ""}
  <tr><td style="padding:${t.spacing.md} ${t.spacing.lg};">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>
  </td></tr>
</table>`;
}

// ─── NextStepsCard ───────────────────────────────────────────────────────────

export function NextStepsCard(params: { steps?: NextStepItem[] | null }): string {
  const t = theme;
  const steps = params.steps && params.steps.length ? params.steps : DEFAULT_NEXT_STEPS;
  if (!steps.length) return "";

  const cellWidth = Math.floor(100 / steps.length);
  const cells = steps
    .map(
      (s, i) => `
    <td valign="top" width="${cellWidth}%" style="padding:${t.spacing.sm}; text-align:center;">
      <div style="font-size:24px; line-height:1;">${s.icon}</div>
      <div style="font-size:${t.fontSize.caption}; font-weight:${t.fontWeight.bold}; color:${t.color.neutral[900]}; font-family:${t.font.family}; margin-top:${t.spacing.xs};">${i + 1}. ${escapeHtml(s.title.toUpperCase())}</div>
      <div style="font-size:11px; color:${t.color.neutral[500]}; font-family:${t.font.family}; margin-top:2px; line-height:1.4;">${escapeHtml(s.description)}</div>
    </td>`
    )
    .join("");

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin:${t.spacing.md} 0; background:${t.color.neutral[50]}; border-radius:${t.radius.lg};">
  <tr><td style="padding:${t.spacing.md} ${t.spacing.lg} 0; font-size:${t.fontSize.subheading}; font-weight:${t.fontWeight.bold}; color:${t.color.primary}; font-family:${t.font.family};">WHAT'S NEXT?</td></tr>
  <tr><td style="padding:${t.spacing.sm} ${t.spacing.md} ${t.spacing.md};">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>
  </td></tr>
</table>`;
}

// ─── ContactCard ─────────────────────────────────────────────────────────────

export function ContactCard(params: { branding: Branding | null }): string {
  const t = theme;
  const b = params.branding;
  if (!b?.supportEmail && !b?.supportPhone && !b?.websiteUrl) return "";

  const title = b.supportTitle || "Need Help?";
  const description = b.supportDescription || "We're here to help.";

  const items: { label: string; value: string; href?: string }[] = [];
  items.push({ label: title.toUpperCase(), value: description });
  if (b.supportEmail) items.push({ label: "SUPPORT EMAIL", value: b.supportEmail, href: `mailto:${b.supportEmail}` });
  if (b.supportPhone) items.push({ label: "PHONE", value: b.supportPhone, href: `tel:${b.supportPhone}` });
  if (b.websiteUrl) items.push({ label: "WEBSITE", value: b.websiteUrl.replace(/^https?:\/\//, ""), href: b.websiteUrl });

  const cellWidth = Math.floor(100 / items.length);
  const cells = items
    .map(
      (item) => `
    <td valign="top" width="${cellWidth}%" style="padding:${t.spacing.sm} ${t.spacing.xs};">
      <div style="font-size:${t.fontSize.label}; color:${t.color.neutral[400]}; font-family:${t.font.family}; text-transform:uppercase; letter-spacing:0.5px;">${escapeHtml(item.label)}</div>
      ${
        item.href
          ? `<a href="${escapeHtml(item.href)}" style="font-size:${t.fontSize.caption}; font-weight:${t.fontWeight.semibold}; color:${t.color.accent}; text-decoration:none; font-family:${t.font.family};">${escapeHtml(item.value)}</a>`
          : `<div style="font-size:${t.fontSize.caption}; font-weight:${t.fontWeight.semibold}; color:${t.color.neutral[700]}; font-family:${t.font.family};">${escapeHtml(item.value)}</div>`
      }
    </td>`
    )
    .join("");

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin:${t.spacing.md} 0; background:#FFFBEB; border-radius:${t.radius.md};">
  <tr><td style="padding:${t.spacing.sm} ${t.spacing.md};">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>
  </td></tr>
</table>`;
}

// ─── CertificateFooter ───────────────────────────────────────────────────────

export function CertificateFooter(params: { branding: Branding | null; orgName: string }): string {
  const t = theme;
  const b = params.branding;
  const social: string[] = [];
  if (b?.facebookUrl) social.push(`<a href="${escapeHtml(b.facebookUrl)}" style="color:${t.color.neutral[500]}; text-decoration:none; margin:0 6px; font-family:${t.font.family};">Facebook</a>`);
  if (b?.instagramUrl) social.push(`<a href="${escapeHtml(b.instagramUrl)}" style="color:${t.color.neutral[500]}; text-decoration:none; margin:0 6px; font-family:${t.font.family};">Instagram</a>`);
  if (b?.xUrl) social.push(`<a href="${escapeHtml(b.xUrl)}" style="color:${t.color.neutral[500]}; text-decoration:none; margin:0 6px; font-family:${t.font.family};">X</a>`);
  if (b?.linkedinUrl) social.push(`<a href="${escapeHtml(b.linkedinUrl)}" style="color:${t.color.neutral[500]}; text-decoration:none; margin:0 6px; font-family:${t.font.family};">LinkedIn</a>`);

  const copyright = b?.footerCopyright || `© ${new Date().getFullYear()} ${params.orgName}. All rights reserved.`;
  const tagline = b?.tagline ? `<div style="font-size:${t.fontSize.caption}; color:${t.color.neutral[400]}; font-family:${t.font.family};">${escapeHtml(b.tagline)}</div>` : "";

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:${t.spacing.lg}; border-top:1px solid ${t.color.neutral[200]};">
  <tr>
    <td style="padding:${t.spacing.md} ${t.spacing.lg}; text-align:center;">
      ${social.length ? `<div style="margin-bottom:${t.spacing.sm};">${social.join("")}</div>` : ""}
      <div style="font-size:${t.fontSize.caption}; color:${t.color.neutral[400]}; font-family:${t.font.family};">${escapeHtml(copyright)}</div>
      ${tagline}
    </td>
  </tr>
</table>`;
}
