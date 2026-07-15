// Reusable email components — pure functions returning HTML strings.
// No React, no JSX. Every component consumes theme tokens.

import { theme, escapeHtml } from "../theme";
import type { Branding } from "../renderer";

// ─── Section ─────────────────────────────────────────────────────────────────

export function Section(params: { children: string; padding?: string }): string {
  const p = params.padding ?? `${theme.spacing.lg} ${theme.spacing.xl}`;
  return `<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:${p};">${params.children}</td></tr></table>`;
}

// ─── Divider ────────────────────────────────────────────────────────────────

export function Divider(): string {
  return `<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:0 ${theme.spacing.xl};"><div style="height:1px;background:${theme.color.neutral[200]};"></div></td></tr></table>`;
}

// ─── EmailLayout (full document shell) ──────────────────────────────────────

export function EmailLayout(params: { content: string; branding: Branding | null; previewText?: string }): string {
  const b = params.branding;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${params.previewText ? `<meta name="description" content="${escapeHtml(params.previewText)}">` : ""}
  <style>
    :root {
      --brand-primary: ${b?.primaryColor ?? "#E67E22"};
      --brand-accent: ${b?.accentColor ?? "#E67E22"};
      --brand-button: ${b?.buttonColor ?? "#E67E22"};
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${theme.color.background};font-family:${theme.font.family};-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${theme.color.background};">
    <tr><td align="center" style="padding:${theme.spacing.lg} ${theme.spacing.md} ${theme.spacing.xxl};">
      ${params.content}
    </td></tr>
  </table>
  <!--[if mso]><table width="480" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
</body>
</html>`;
}

// ─── EmailHero ──────────────────────────────────────────────────────────────

export function EmailHero(params: { illustration: string; height?: number }): string {
  const h = params.height ?? 72;
  const isEmoji = /^[\p{Emoji}]/u.test(params.illustration) && params.illustration.length <= 4;
  if (isEmoji) {
    return `<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:${theme.spacing.lg} 0 0; font-size:${Math.round(h * 0.7)}px; line-height:1;">${params.illustration}</td></tr></table>`;
  }
  return `<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:${theme.spacing.md} 0;"><img src="${escapeHtml(params.illustration)}" alt="" width="${h}" height="${h}" style="display:block;max-width:100%;height:auto;" /></td></tr></table>`;
}

// ─── Headline ───────────────────────────────────────────────────────────────

export function Headline(params: { text: string; align?: "left" | "center" }): string {
  const a = params.align ?? "center";
  return `<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="${a}" style="padding:${theme.spacing.md} ${theme.spacing.xl} 0; font-size:${theme.fontSize.heading}; font-weight:${theme.fontWeight.bold}; color:${theme.color.neutral[900]}; font-family:${theme.font.family};">${escapeHtml(params.text)}</td></tr></table>`;
}

// ─── Subheading ─────────────────────────────────────────────────────────────

export function Subheading(params: { text: string; align?: "left" | "center" }): string {
  const a = params.align ?? "center";
  return `<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="${a}" style="padding:${theme.spacing.sm} ${theme.spacing.xl} 0; font-size:${theme.fontSize.subheading}; font-weight:${theme.fontWeight.semibold}; color:${theme.color.neutral[700]}; font-family:${theme.font.family};">${escapeHtml(params.text)}</td></tr></table>`;
}

// ─── BodyText ───────────────────────────────────────────────────────────────

export function BodyText(params: { text: string; align?: "left" | "center"; color?: string }): string {
  const a = params.align ?? "left";
  const c = params.color ?? theme.color.neutral[700];
  return `<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="${a}" style="padding:${theme.spacing.sm} ${theme.spacing.xl}; font-size:${theme.fontSize.body}; font-weight:${theme.fontWeight.normal}; color:${c}; font-family:${theme.font.family}; line-height:1.6;">${escapeHtml(params.text)}</td></tr></table>`;
}
