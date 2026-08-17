// Certificate-style components for the Camp Invitation email — treats the
// email as an A4 admission certificate rather than a marketing email.
// Same table-based, Outlook-safe idiom as cards.ts/special.ts: pure HTML
// string generators, inline styles.
//
// Icons are hosted PNGs from /api/email-icon/[name] — never inline <svg>,
// which Gmail and Outlook.com strip entirely, and never emoji, which render
// as full-colour platform glyphs that differ per OS and can't match the
// approved green line-art. See src/server/email/icons.ts for the registry.
//
// Spacing here is deliberately tighter than theme.spacing: this template has
// to fit on one A4 page (~1047px of usable height at 794px wide with 10mm
// margins), which the shared marketing-email scale overflows.

import { theme, escapeHtml } from "../theme";
import { ICON_PATHS, isEmailIconName, type EmailIconName } from "../icons";
import type { Branding, NextStepItem } from "../renderer";
import type { InfoRowData } from "./cards";

const APP_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3001";

/** Certificate-local spacing scale — ~25% tighter than theme.spacing. */
const c = {
  xs: "3px",
  sm: "6px",
  md: "12px",
  lg: "18px",
};

const AMBER = "#D97706";

/**
 * Hosted-PNG icon. Sizes must be in the route's allowlist (see
 * app/api/email-icon/[name]/route.ts) or it silently falls back to 16px.
 */
function icon(name: EmailIconName, opts?: { size?: number; color?: string }): string {
  const size = opts?.size ?? 16;
  const color = (opts?.color ?? theme.color.success).replace("#", "");
  return `<img src="${APP_URL}/api/email-icon/${name}?c=${color}&amp;s=${size}" width="${size}" height="${size}" alt="" style="display:block;border:0;outline:none;text-decoration:none;" />`;
}

/** Rows may carry an icon; those that do render inline (icon | label | value). */
export type CertificateInfoRow = InfoRowData & { icon?: EmailIconName };

const DEFAULT_NEXT_STEPS: NextStepItem[] = [
  { icon: "printer", title: "Print This Page", description: "Print this page and bring it with you on check-in." },
  { icon: "qr-code", title: "Bring Your QR Code", description: "Present this QR code during check-in." },
  { icon: "clock", title: "Arrive On Time", description: "Arrive before the reporting time listed above." },
  { icon: "backpack", title: "Pack & Prepare", description: "Bring all required items listed in your welcome packet." },
];

// ─── OrganizationHeader ─────────────────────────────────────────────────────

export function OrganizationHeader(params: { branding: Branding | null; orgName: string; rightLabel?: string }): string {
  const t = theme;
  const b = params.branding;
  const logo = b?.logoUrl
    ? `<img src="${escapeHtml(b.logoUrl)}" alt="${escapeHtml(params.orgName)}" width="40" height="40" style="display:block;width:40px;height:40px;border-radius:50%;object-fit:cover;" />`
    : "";
  const tagline = b?.tagline
    ? `<div style="font-size:${t.fontSize.caption}; color:${t.color.neutral[500]}; font-family:${t.font.family}; margin-top:2px;">${escapeHtml(b.tagline)}</div>`
    : "";

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:${c.sm};">
  <tr>
    <td valign="middle" width="70%">
      <table cellpadding="0" cellspacing="0">
        <tr>
          ${logo ? `<td valign="middle" style="padding-right:${c.sm};">${logo}</td>` : ""}
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
    <td valign="top" width="38%" style="padding:${c.md} ${c.lg}; text-align:center; border-left:1px solid ${t.color.neutral[100]};">
      <span style="font-size:${t.fontSize.label}; color:${t.color.success}; font-family:${t.font.family}; text-transform:uppercase; letter-spacing:0.5px; font-weight:${t.fontWeight.semibold};">Verified Registration</span>
      <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:${c.sm} 0;">
        <img src="${escapeHtml(params.qrSrc)}" alt="QR Code" width="118" height="118" style="display:block;width:118px;height:118px;background:#FFFFFF;image-rendering:crisp-edges;" />
      </td></tr></table>
      <div style="font-size:${t.fontSize.caption}; font-weight:${t.fontWeight.semibold}; color:${t.color.neutral[900]}; font-family:${t.font.family}; letter-spacing:0.5px;">${escapeHtml(params.registrationNumber)}</div>
      <table cellpadding="0" cellspacing="0" align="center" style="margin:2px auto 0;"><tr>
        <td valign="middle" style="padding-right:4px;">${icon("check-badge", { size: 12 })}</td>
        <td valign="middle" style="font-size:${t.fontSize.label}; color:${t.color.success}; font-family:${t.font.family};">Verified by Camply</td>
      </tr></table>
      <div style="font-size:${t.fontSize.label}; color:${t.color.neutral[400]}; font-family:${t.font.family}; margin-top:5px; line-height:1.4;">Present this QR during check-in.<br/>Do not share this code.</div>
    </td>`
    : "";

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="background:${t.color.neutral[50]}; border-radius:${t.radius.lg}; overflow:hidden; margin:0 0 ${c.md};">
  <tr>
    <td valign="middle" width="${params.qrSrc ? "62%" : "100%"}" style="padding:${c.md} ${c.lg};">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td valign="middle" width="72" style="padding-right:${c.md};">
          <table cellpadding="0" cellspacing="0"><tr>
            <td align="center" valign="middle" width="56" height="56" style="width:56px;height:56px;background:${t.color.success};border-radius:50%;">${icon("check", { size: 32, color: "#FFFFFF" })}</td>
          </tr></table>
        </td>
        <td valign="middle">
          <div style="font-size:20px; font-weight:${t.fontWeight.bold}; color:${t.color.neutral[900]}; font-family:${t.font.family}; margin-bottom:${c.sm};">${escapeHtml(params.title)}</div>
          <div style="font-size:${t.fontSize.body}; color:${t.color.neutral[700]}; font-family:${t.font.family}; line-height:1.5;">${params.description}</div>
        </td>
      </tr></table>
    </td>
    ${qrColumn}
  </tr>
</table>`;
}

// ─── SplitInfoCard (two side-by-side InfoCard-style columns) ────────────────

function infoColumn(title: string, rows: CertificateInfoRow[], titleIcon?: EmailIconName): string {
  const t = theme;
  if (!rows.length) return "";

  const rowsHtml = rows
    .map((r, i) => {
      const border = i < rows.length - 1 ? `1px solid ${t.color.neutral[100]}` : "none";
      // Slightly below theme.fontSize so long values ("Thursday, August 14,
      // 2026") stay on one line inside a half-width A4 column.
      const label = `<span style="font-size:10px; color:${t.color.neutral[400]}; font-family:${t.font.family}; text-transform:uppercase; letter-spacing:0.4px;">${escapeHtml(r.label)}</span>`;
      const value = `<span style="font-size:13px; font-weight:${t.fontWeight.semibold}; color:${t.color.neutral[900]}; font-family:${t.font.family};">${escapeHtml(r.value)}</span>`;

      // Iconed rows read as a single line (icon | label | value); rows with no
      // icon keep the stacked label-over-value form.
      if (r.icon) {
        return `
    <tr>
      <td width="24" valign="middle" style="padding:5px 0; border-bottom:${border};">${icon(r.icon, { size: 15 })}</td>
      <td width="44%" valign="middle" style="padding:5px 8px 5px 0; border-bottom:${border}; white-space:nowrap;">${label}</td>
      <td valign="middle" style="padding:5px 0; border-bottom:${border};">${value}</td>
    </tr>`;
      }

      return `
    <tr>
      <td colspan="3" style="padding:5px 0; border-bottom:${border};">
        <div>${label}</div>
        <div style="margin-top:2px;">${value}</div>
      </td>
    </tr>`;
    })
    .join("");

  const heading = titleIcon
    ? `<table cellpadding="0" cellspacing="0"><tr>
        <td valign="middle" style="padding-right:6px;">${icon(titleIcon, { size: 18 })}</td>
        <td valign="middle" style="font-size:${t.fontSize.label}; font-weight:${t.fontWeight.bold}; color:${t.color.success}; font-family:${t.font.family}; text-transform:uppercase; letter-spacing:0.5px;">${escapeHtml(title)}</td>
      </tr></table>`
    : `<div style="font-size:${t.fontSize.label}; font-weight:${t.fontWeight.bold}; color:${t.color.primary}; font-family:${t.font.family}; text-transform:uppercase; letter-spacing:0.5px;">${escapeHtml(title)}</div>`;

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="background:${t.color.surface}; border-radius:${t.radius.lg}; box-shadow:${t.shadow.card};">
  <tr><td style="padding:${c.md} ${c.lg} ${c.xs};">${heading}</td></tr>
  <tr><td style="padding:0 ${c.lg} ${c.md};">
    <table width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
  </td></tr>
</table>`;
}

export function SplitInfoCard(params: {
  leftTitle: string;
  leftRows: CertificateInfoRow[];
  rightTitle: string;
  rightRows: CertificateInfoRow[];
  notice?: string;
  leftIcon?: EmailIconName;
  rightIcon?: EmailIconName;
}): string {
  const t = theme;
  const left = infoColumn(params.leftTitle, params.leftRows, params.leftIcon);
  const right = infoColumn(params.rightTitle, params.rightRows, params.rightIcon);
  const noticeHtml = params.notice
    ? `<tr><td style="padding-top:${c.sm};"><table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="26" valign="top" style="background:#FFFBEB; border-radius:${t.radius.sm} 0 0 ${t.radius.sm}; padding:${c.sm} 0 ${c.sm} ${c.sm};">${icon("exclamation-circle", { size: 16, color: AMBER })}</td>
        <td valign="middle" style="background:#FFFBEB; border-radius:0 ${t.radius.sm} ${t.radius.sm} 0; padding:${c.sm} ${c.md} ${c.sm} 6px; font-size:${t.fontSize.caption}; color:#92400E; font-family:${t.font.family}; line-height:1.5;">${params.notice}</td>
      </tr></table></td></tr>`
    : "";

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 ${c.md};">
  <tr>
    <td valign="top" width="50%">${left}</td>
    <td width="3%"></td>
    <td valign="top" width="47%">
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
  icon?: EmailIconName;
}

export function TimelineCompact(params: { title?: string; stages: CertificateTimelineStage[] }): string {
  const t = theme;
  const n = params.stages.length;
  // Stage columns share most of the width; the remainder is split evenly
  // between the connectors. Percentages are required here — a connector cell
  // set to width:100% would swallow the whole row instead of stretching.
  const stagePct = n > 1 ? Math.floor(76 / n) : 100;
  const connectorPct = n > 1 ? Math.floor((100 - stagePct * n) / (n - 1)) : 0;

  const cells = params.stages
    .map((s, i) => {
      const isLast = i === params.stages.length - 1;
      const isCurrent = s.status === "current";

      // The active stage is a solid green disc with a white check; every other
      // stage is a pale disc carrying its own outline icon.
      const bg = isCurrent ? t.color.success : "#F3F4F6";
      const glyph = isCurrent
        ? icon("check", { size: 18, color: "#FFFFFF" })
        : s.icon
          ? icon(s.icon, { size: 16, color: s.status === "completed" ? t.color.success : t.color.neutral[400] })
          : "";

      const connector = !isLast
        ? `<td width="${connectorPct}%" valign="top" style="padding-top:15px;">
             <div style="height:2px;line-height:2px;font-size:0;background:${s.status === "completed" ? t.color.success : t.color.neutral[200]};">&nbsp;</div>
           </td>`
        : "";

      return `
    <td align="center" width="${stagePct}%" style="vertical-align:top; padding:0 2px;">
      <table cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;"><tr>
        <td align="center" valign="middle" width="32" height="32" style="width:32px;height:32px;background:${bg};border-radius:50%;">${glyph}</td>
      </tr></table>
      <div style="font-size:10px; font-weight:${isCurrent ? t.fontWeight.bold : t.fontWeight.normal}; color:${s.status === "upcoming" ? t.color.neutral[400] : t.color.neutral[900]}; font-family:${t.font.family}; margin-top:4px;">${escapeHtml(s.label)}</div>
      ${s.date ? `<div style="font-size:10px; color:${isCurrent ? t.color.success : t.color.neutral[400]}; font-family:${t.font.family};">${escapeHtml(s.date)}</div>` : ""}
    </td>
    ${connector}`;
    })
    .join("");

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 ${c.md}; background:${t.color.surface}; border-radius:${t.radius.lg}; box-shadow:${t.shadow.card};">
  ${params.title ? `<tr><td style="padding:${c.md} ${c.lg} 0; font-size:${t.fontSize.label}; font-weight:${t.fontWeight.bold}; color:${t.color.success}; font-family:${t.font.family}; text-transform:uppercase; letter-spacing:0.5px;">${escapeHtml(params.title)}</td></tr>` : ""}
  <tr><td style="padding:${c.sm} ${c.lg};">
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
    .map((s, i) => {
      // Branding.nextSteps is admin-editable JSON and existing orgs still have
      // emoji stored there — render those raw rather than dropping the icon.
      const glyph = isEmailIconName(s.icon)
        ? `<table cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;"><tr><td>${icon(s.icon, { size: 26 })}</td></tr></table>`
        : `<div style="font-size:24px; line-height:1;">${s.icon}</div>`;

      return `
    <td valign="top" width="${cellWidth}%" style="padding:${c.sm} ${c.xs}; text-align:center;">
      ${glyph}
      <div style="font-size:${t.fontSize.caption}; font-weight:${t.fontWeight.bold}; color:${t.color.success}; font-family:${t.font.family}; margin-top:${c.xs};">${i + 1}. ${escapeHtml(s.title.toUpperCase())}</div>
      <div style="font-size:11px; color:${t.color.neutral[500]}; font-family:${t.font.family}; margin-top:2px; line-height:1.4;">${escapeHtml(s.description)}</div>
    </td>`;
    })
    .join("");

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 ${c.md}; background:${t.color.neutral[50]}; border-radius:${t.radius.lg};">
  <tr><td style="padding:${c.md} ${c.lg} 0; font-size:${t.fontSize.label}; font-weight:${t.fontWeight.bold}; color:${t.color.success}; font-family:${t.font.family}; text-transform:uppercase; letter-spacing:0.5px;">What's Next?</td></tr>
  <tr><td style="padding:${c.sm} ${c.md};">
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

  const items: { label: string; value: string; href?: string; icon: EmailIconName }[] = [];
  items.push({ label: title.toUpperCase(), value: description, icon: "headphones" });
  if (b.supportEmail) items.push({ label: "SUPPORT EMAIL", value: b.supportEmail, href: `mailto:${b.supportEmail}`, icon: "envelope" });
  if (b.supportPhone) items.push({ label: "PHONE", value: b.supportPhone, href: `tel:${b.supportPhone}`, icon: "phone" });
  if (b.websiteUrl) items.push({ label: "WEBSITE", value: b.websiteUrl.replace(/^https?:\/\//, ""), href: b.websiteUrl, icon: "globe-alt" });

  const cellWidth = Math.floor(100 / items.length);
  const cells = items
    .map(
      (item) => `
    <td valign="middle" width="${cellWidth}%" style="padding:${c.sm} ${c.xs};">
      <table cellpadding="0" cellspacing="0"><tr>
        <td valign="middle" style="padding-right:8px;">${icon(item.icon, { size: 20, color: AMBER })}</td>
        <td valign="middle">
          <div style="font-size:${t.fontSize.label}; font-weight:${t.fontWeight.bold}; color:${t.color.neutral[700]}; font-family:${t.font.family}; text-transform:uppercase; letter-spacing:0.5px;">${escapeHtml(item.label)}</div>
          ${
            item.href
              ? `<a href="${escapeHtml(item.href)}" style="font-size:${t.fontSize.caption}; color:${t.color.accent}; text-decoration:underline; font-family:${t.font.family};">${escapeHtml(item.value)}</a>`
              : `<div style="font-size:${t.fontSize.caption}; color:${t.color.neutral[500]}; font-family:${t.font.family};">${escapeHtml(item.value)}</div>`
          }
        </td>
      </tr></table>
    </td>`
    )
    .join("");

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 ${c.md}; background:#FFFBEB; border-radius:${t.radius.md};">
  <tr><td style="padding:${c.sm} ${c.md};">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>
  </td></tr>
</table>`;
}

// ─── CertificateFooter ───────────────────────────────────────────────────────

export function CertificateFooter(params: { branding: Branding | null; orgName: string }): string {
  const t = theme;
  const b = params.branding;

  const socialLinks: { url: string; name: EmailIconName }[] = [];
  if (b?.facebookUrl) socialLinks.push({ url: b.facebookUrl, name: "facebook" });
  if (b?.instagramUrl) socialLinks.push({ url: b.instagramUrl, name: "instagram" });
  if (b?.xUrl) socialLinks.push({ url: b.xUrl, name: "x" });
  if (b?.linkedinUrl) socialLinks.push({ url: b.linkedinUrl, name: "linkedin" });

  const social = socialLinks
    .map(
      (s) =>
        `<td style="padding:0 5px;"><a href="${escapeHtml(s.url)}">${icon(s.name, { size: 18, color: t.color.neutral[700] })}</a></td>`
    )
    .join("");

  const copyright = b?.footerCopyright || `© ${new Date().getFullYear()} ${params.orgName}. All rights reserved.`;
  const tagline = b?.tagline ? `<div style="font-size:${t.fontSize.caption}; color:${t.color.neutral[400]}; font-family:${t.font.family};">${escapeHtml(b.tagline)}</div>` : "";

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:${c.sm}; border-top:1px solid ${t.color.neutral[200]};">
  <tr>
    <td style="padding:${c.sm} ${c.lg}; text-align:center;">
      ${social ? `<table cellpadding="0" cellspacing="0" align="center" style="margin:0 auto ${c.sm};"><tr>${social}</tr></table>` : ""}
      <div style="font-size:${t.fontSize.caption}; color:${t.color.neutral[400]}; font-family:${t.font.family};">${escapeHtml(copyright)}</div>
      ${tagline}
    </td>
  </tr>
</table>`;
}
