import { generateHTML } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { EmailButton } from "./buttonExtension";

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

/**
 * Render TipTap JSON content to HTML string with variable interpolation.
 */
export function renderTemplateContent(tiptapJson: Record<string, unknown>, variables: Record<string, string>): string {
  let html = generateHTML(tiptapJson, [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    Underline,
    Link.configure({ openOnClick: true }),
    Image,
    EmailButton,
  ]);

  // Interpolate {{variables}} — replace all occurrences
  for (const [key, value] of Object.entries(variables)) {
    html = html.split(`{{${key}}}`).join(value ?? "");
  }

  return html;
}

/**
 * Wrap content HTML in the full email layout with branding header/footer.
 */
export function wrapWithBranding(contentHtml: string, branding: Branding): string {
  const logoRow = branding.logoUrl
    ? `<img src="${branding.logoUrl}" alt="Logo" style="max-height:60px;margin-bottom:16px;" />`
    : "";

  const headerImage = branding.headerImageUrl
    ? `<img src="${branding.headerImageUrl}" alt="" style="width:100%;max-width:480px;margin-bottom:16px;border-radius:12px 12px 0 0;" />`
    : "";

  const socialLinks: string[] = [];
  if (branding.websiteUrl) socialLinks.push(`<a href="${branding.websiteUrl}" style="color:${branding.accentColor};text-decoration:none;">Website</a>`);
  if (branding.facebookUrl) socialLinks.push(`<a href="${branding.facebookUrl}" style="color:${branding.accentColor};text-decoration:none;">Facebook</a>`);
  if (branding.instagramUrl) socialLinks.push(`<a href="${branding.instagramUrl}" style="color:${branding.accentColor};text-decoration:none;">Instagram</a>`);

  const hasFooter = branding.footerText || branding.address || socialLinks.length > 0 || branding.supportEmail;
  const footerBlock = hasFooter
    ? `
    <tr>
      <td style="padding:24px;border-top:1px solid #eeeeee;font-size:12px;color:#888888;line-height:1.6;">
        ${branding.footerText ? `<p style="margin:0 0 8px;">${branding.footerText}</p>` : ""}
        ${branding.address ? `<p style="margin:0 0 8px;">${branding.address}</p>` : ""}
        ${socialLinks.length > 0 ? `<p style="margin:0;">${socialLinks.join(" &middot; ")}</p>` : ""}
        ${branding.supportEmail ? `<p style="margin:8px 0 0;">Contact: <a href="mailto:${branding.supportEmail}" style="color:${branding.accentColor};">${branding.supportEmail}</a></p>` : ""}
      </td>
    </tr>`
    : "";

  // Inject branding colors as CSS custom properties so the EmailButton and
  // any future branded elements can pick them up.
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      --brand-primary: ${branding.primaryColor};
      --brand-accent: ${branding.accentColor};
      --brand-button: ${branding.buttonColor};
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;">
          ${headerImage ? `<tr><td style="padding:0;">${headerImage}</td></tr>` : ""}
          ${logoRow ? `<tr><td style="padding:24px 24px 0;">${logoRow}</td></tr>` : ""}
          <tr>
            <td style="padding:24px;line-height:1.6;color:#333333;">
              ${contentHtml}
            </td>
          </tr>
          ${footerBlock}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Full render pipeline: TipTap JSON → variable interpolation → content HTML → brand wrapper → final HTML.
 */
export async function renderEmail(params: {
  tiptapJson: Record<string, unknown>;
  variables: Record<string, string>;
  branding: Branding | null;
}): Promise<string> {
  const content = renderTemplateContent(params.tiptapJson, params.variables);
  if (params.branding) {
    return wrapWithBranding(content, params.branding);
  }
  // No branding configured — return content with minimal wrapper
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:16px;">${content}</body></html>`;
}
