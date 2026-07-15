// Specialized email components — QR, timeline, alerts, support, footer

import { theme, escapeHtml } from "../theme";
import type { Branding } from "../renderer";

// ─── QRCodeCard ─────────────────────────────────────────────────────────────

export function QRCodeCard(params: { qrDataUrl: string; registrationNumber: string }): string {
  const t = theme;
  return `
<table width="100%" cellpadding="0" cellspacing="0" style="background:${t.color.surface}; border-radius:${t.radius.lg}; overflow:hidden; margin:${t.spacing.lg} 0; box-shadow:${t.shadow.card};">
  <!-- Header -->
  <tr>
    <td style="padding:${t.spacing.lg} ${t.spacing.xl} ${t.spacing.sm}; text-align:center;">
      <span style="font-size:${t.fontSize.label}; color:${t.color.neutral[400]}; font-family:${t.font.family}; text-transform:uppercase; letter-spacing:0.5px;">Verified Registration</span>
    </td>
  </tr>
  <!-- QR Code -->
  <tr>
    <td align="center" style="padding:${t.spacing.md} ${t.spacing.xl};">
      <img src="${escapeHtml(params.qrDataUrl)}" alt="QR Code" width="220" height="220" style="display:block;width:220px;height:220px;background:#FFFFFF;image-rendering:crisp-edges;" />
    </td>
  </tr>
  <!-- Registration Number -->
  <tr>
    <td style="padding:${t.spacing.sm} ${t.spacing.xl}; text-align:center;">
      <span style="font-size:${t.fontSize.caption}; font-weight:${t.fontWeight.semibold}; color:${t.color.neutral[900]}; font-family:${t.font.family}; letter-spacing:0.5px;">${escapeHtml(params.registrationNumber)}</span>
    </td>
  </tr>
  <!-- Verified badge -->
  <tr>
    <td style="padding:${t.spacing.sm} ${t.spacing.xl} ${t.spacing.lg}; text-align:center;">
      <span style="font-size:${t.fontSize.caption}; color:${t.color.success}; font-family:${t.font.family};">✓ Verified by Camply</span>
    </td>
  </tr>
  <!-- Instructions -->
  <tr>
    <td style="padding:0 ${t.spacing.xl} ${t.spacing.lg}; text-align:center;">
      <span style="font-size:${t.fontSize.caption}; color:${t.color.neutral[400]}; font-family:${t.font.family};">Present this QR code during check-in. Do not share this code.</span>
    </td>
  </tr>
</table>`;
}

// ─── Timeline ───────────────────────────────────────────────────────────────

type TimelineStatus = "completed" | "current" | "upcoming";

export interface TimelineStage {
  label: string;
  status: TimelineStatus;
}

export function Timeline(params: { stages: TimelineStage[] }): string {
  const t = theme;
  const circles = params.stages.map((s, i) => {
    let fill: string;
    let border: string;
    if (s.status === "completed") { fill = t.color.success; border = t.color.success; }
    else if (s.status === "current") { fill = t.color.primary; border = t.color.primary; }
    else { fill = t.color.surface; border = t.color.neutral[300]; }
    const connector = i < params.stages.length - 1
      ? `<td style="width:100%;height:2px;background:${s.status === "completed" ? t.color.success : t.color.neutral[200]};"></td>`
      : `<td style="width:100%;"></td>`;
    return `
    <td align="center" style="padding:${t.spacing.sm}; vertical-align:top;">
      <div style="width:18px;height:18px;border-radius:50%;background:${fill};border:2px solid ${border};margin:0 auto;"></div>
      <div style="font-size:${t.fontSize.caption}; color:${s.status === "upcoming" ? t.color.neutral[400] : t.color.neutral[900]}; font-family:${t.font.family}; margin-top:4px; max-width:80px;">${escapeHtml(s.label)}</div>
    </td>
    ${connector}`;
  }).join("");

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin:${t.spacing.md} 0;">
  <tr>${circles}</tr>
</table>`;
}

// ─── AlertCard ──────────────────────────────────────────────────────────────

export function AlertCard(params: { type: "warning" | "danger" | "info"; title: string; message: string }): string {
  const t = theme;
  const colors = {
    warning: { bg: "#FFF7ED", border: t.color.warning, text: "#9A3412" },
    danger: { bg: "#FEF2F2", border: t.color.danger, text: "#991B1B" },
    info: { bg: "#EFF6FF", border: t.color.info, text: "#1E40AF" },
  };
  const c = colors[params.type];
  return `
<table width="100%" cellpadding="0" cellspacing="0" style="background:${c.bg}; border-left:4px solid ${c.border}; border-radius:${t.radius.md}; margin:${t.spacing.md} 0;">
  <tr>
    <td style="padding:${t.spacing.lg} ${t.spacing.lg};">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="font-size:${t.fontSize.body}; font-weight:${t.fontWeight.bold}; color:${c.text}; font-family:${t.font.family}; padding-bottom:4px;">${escapeHtml(params.title)}</td></tr>
        <tr><td style="font-size:${t.fontSize.caption}; color:${c.text}; font-family:${t.font.family};">${escapeHtml(params.message)}</td></tr>
      </table>
    </td>
  </tr>
</table>`;
}

// ─── SupportCard ────────────────────────────────────────────────────────────

export function SupportCard(params: { supportEmail?: string | null; supportPhone?: string | null; websiteUrl?: string | null }): string {
  const t = theme;
  if (!params.supportEmail && !params.supportPhone && !params.websiteUrl) return "";
  const links: string[] = [];
  if (params.supportEmail) links.push(`<a href="mailto:${escapeHtml(params.supportEmail)}" style="color:${t.color.accent}; text-decoration:none; font-family:${t.font.family};">${escapeHtml(params.supportEmail)}</a>`);
  if (params.supportPhone) links.push(`<span style="color:${t.color.neutral[700]}; font-family:${t.font.family};">${escapeHtml(params.supportPhone)}</span>`);
  if (params.websiteUrl) links.push(`<a href="${escapeHtml(params.websiteUrl)}" style="color:${t.color.accent}; text-decoration:none; font-family:${t.font.family};">Website</a>`);
  return `
<table width="100%" cellpadding="0" cellspacing="0" style="background:${t.color.neutral[50]}; border-radius:${t.radius.md}; margin:${t.spacing.lg} 0;">
  <tr>
    <td style="padding:${t.spacing.lg} ${t.spacing.xl}; text-align:center;">
      <div style="font-size:${t.fontSize.body}; font-weight:${t.fontWeight.semibold}; color:${t.color.neutral[900]}; font-family:${t.font.family}; margin-bottom:${t.spacing.sm};">Need help?</div>
      <div style="font-size:${t.fontSize.caption}; color:${t.color.neutral[500]}; font-family:${t.font.family}; line-height:1.6;">${links.join(" &middot; ")}</div>
    </td>
  </tr>
</table>`;
}

// ─── Footer ─────────────────────────────────────────────────────────────────

export function EmailFooter(params: { branding: Branding | null }): string {
  const t = theme;
  const b = params.branding;
  const social: string[] = [];
  if (b?.facebookUrl) social.push(`<a href="${escapeHtml(b.facebookUrl)}" style="color:${t.color.neutral[500]}; text-decoration:none; margin:0 6px; font-family:${t.font.family};">Facebook</a>`);
  if (b?.instagramUrl) social.push(`<a href="${escapeHtml(b.instagramUrl)}" style="color:${t.color.neutral[500]}; text-decoration:none; margin:0 6px; font-family:${t.font.family};">Instagram</a>`);
  const addressLine = b?.address ? `<div style="font-size:${t.fontSize.caption}; color:${t.color.neutral[400]}; font-family:${t.font.family}; margin-bottom:${t.spacing.sm};">${escapeHtml(b.address)}</div>` : "";
  const socialLine = social.length ? `<div style="margin-bottom:${t.spacing.sm};">${social.join("")}</div>` : "";
  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:${t.spacing.xxl}; border-top:1px solid ${t.color.neutral[200]};">
  <tr>
    <td style="padding:${t.spacing.xl} ${t.spacing.xl}; text-align:center;">
      ${addressLine}
      ${socialLine}
      <div style="font-size:${t.fontSize.caption}; color:${t.color.neutral[400]}; font-family:${t.font.family};">Powered by Camply</div>
    </td>
  </tr>
</table>`;
}

// ─── NextSteps ──────────────────────────────────────────────────────────────

export function NextSteps(params: { steps: string[] }): string {
  if (!params.steps.length) return "";
  const t = theme;
  const items = params.steps.map((step, i) => `
    <tr>
      <td style="padding:${t.spacing.sm} ${t.spacing.xl}; font-size:${t.fontSize.body}; color:${t.color.neutral[700]}; font-family:${t.font.family};">
        <span style="display:inline-block;width:20px;height:20px;line-height:20px;border-radius:50%;background:${t.color.neutral[200]};color:${t.color.neutral[900]};text-align:center;font-size:${t.fontSize.caption};font-weight:${t.fontWeight.bold};margin-right:${t.spacing.sm};">${i + 1}</span>
        ${escapeHtml(step)}
      </td>
    </tr>`).join("");
  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin:${t.spacing.lg} 0;">
  <tr>
    <td style="padding:${t.spacing.md} ${t.spacing.xl}; font-size:${t.fontSize.subheading}; font-weight:${t.fontWeight.semibold}; color:${t.color.neutral[900]}; font-family:${t.font.family};">What's next</td>
  </tr>
  ${items}
</table>`;
}
