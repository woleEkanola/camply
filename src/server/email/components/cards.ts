// Interactive email components — status banners, cards, buttons, etc.

import { theme, escapeHtml } from "../theme";

export type StatusType = "success" | "warning" | "danger" | "info" | "neutral";

const STATUS_STYLES: Record<StatusType, { bg: string; border: string; text: string; icon: string }> = {
  success: { bg: "#F0FDF4", border: "#16A34A", text: "#166534", icon: "✓" },
  warning: { bg: "#FFF7ED", border: "#D97706", text: "#9A3412", icon: "!" },
  danger: { bg: "#FEF2F2", border: "#DC2626", text: "#991B1B", icon: "✕" },
  info: { bg: "#EFF6FF", border: "#2563EB", text: "#1E40AF", icon: "ℹ" },
  neutral: { bg: "#F9FAFB", border: "#9CA3AF", text: "#4B5563", icon: "•" },
};

// ─── StatusBanner ───────────────────────────────────────────────────────────

export function StatusBanner(params: { type: StatusType; title: string; subtitle?: string }): string {
  const s = STATUS_STYLES[params.type];
  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin:${theme.spacing.md} 0;">
  <tr>
    <td style="padding:${theme.spacing.lg} ${theme.spacing.xl}; background:${s.bg}; border-left:4px solid ${s.border}; border-radius:${theme.radius.md};">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:${theme.fontSize.subheading}; font-weight:${theme.fontWeight.bold}; color:${s.text}; font-family:${theme.font.family}; padding-bottom:${params.subtitle ? theme.spacing.xs : "0"};">
            ${escapeHtml(params.title)}
          </td>
        </tr>
        ${params.subtitle ? `<tr><td style="font-size:${theme.fontSize.body}; color:${s.text}; font-family:${theme.font.family};">${escapeHtml(params.subtitle)}</td></tr>` : ""}
      </table>
    </td>
  </tr>
</table>`;
}

// ─── InfoCard ───────────────────────────────────────────────────────────────

export interface InfoRowData {
  label: string;
  value: string;
}

export function InfoCard(params: { rows: InfoRowData[] }): string {
  if (!params.rows.length) return "";
  const t = theme;
  const rows = params.rows.map((r, i) => `
    <tr>
      <td style="padding:${t.spacing.md} ${t.spacing.lg}; border-bottom:${i < params.rows.length - 1 ? `1px solid ${t.color.neutral[100]}` : "none"};">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:${t.fontSize.label}; color:${t.color.neutral[400]}; font-family:${t.font.family}; text-transform:uppercase; letter-spacing:0.5px; padding-bottom:2px;">${escapeHtml(r.label)}</td>
          </tr>
          <tr>
            <td style="font-size:${t.fontSize.body}; font-weight:${t.fontWeight.semibold}; color:${t.color.neutral[900]}; font-family:${t.font.family};">${escapeHtml(r.value)}</td>
          </tr>
        </table>
      </td>
    </tr>`).join("");
  return `
<table width="100%" cellpadding="0" cellspacing="0" style="background:${t.color.surface}; border-radius:${t.radius.lg}; overflow:hidden; margin:${t.spacing.md} 0; box-shadow:${t.shadow.card};">
  ${rows}
</table>`;
}

// ─── InfoRow ────────────────────────────────────────────────────────────────

export function InfoRow(params: { label: string; value: string }): string {
  const t = theme;
  return `
<table width="100%" cellpadding="0" cellspacing="0">
  <tr>
    <td style="padding:${t.spacing.sm} ${t.spacing.xl}; font-size:${t.fontSize.caption}; color:${t.color.neutral[500]}; font-family:${t.font.family};" width="30%">${escapeHtml(params.label)}</td>
    <td style="padding:${t.spacing.sm} ${t.spacing.xl}; font-size:${t.fontSize.body}; font-weight:${t.fontWeight.semibold}; color:${t.color.neutral[900]}; font-family:${t.font.family};">${escapeHtml(params.value)}</td>
  </tr>
</table>`;
}

// ─── PrimaryButton ──────────────────────────────────────────────────────────

export function PrimaryButton(params: { label: string; href: string }): string {
  const t = theme;
  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin:${t.spacing.lg} 0;">
  <tr>
    <td align="center" style="padding:0 ${t.spacing.xl};">
      <a href="${escapeHtml(params.href)}" style="display:inline-block;padding:${t.spacing.md} ${t.spacing.xl};background:${t.color.button};color:#FFFFFF;font-size:${t.fontSize.body};font-weight:${t.fontWeight.bold};font-family:${t.font.family};text-decoration:none;border-radius:${t.radius.md};text-align:center;" target="_blank">${escapeHtml(params.label)}</a>
    </td>
  </tr>
</table>`;
}

// ─── SecondaryButton ────────────────────────────────────────────────────────

export function SecondaryButton(params: { label: string; href: string }): string {
  const t = theme;
  return `
<table width="100%" cellpadding="0" cellspacing="0" style="margin:${t.spacing.sm} 0;">
  <tr>
    <td align="center" style="padding:0 ${t.spacing.xl};">
      <a href="${escapeHtml(params.href)}" style="display:inline-block;padding:${t.spacing.md} ${t.spacing.xl};border:1px solid ${t.color.neutral[300]};color:${t.color.neutral[700]};font-size:${t.fontSize.body};font-weight:${t.fontWeight.semibold};font-family:${t.font.family};text-decoration:none;border-radius:${t.radius.md};text-align:center;" target="_blank">${escapeHtml(params.label)}</a>
    </td>
  </tr>
</table>`;
}
