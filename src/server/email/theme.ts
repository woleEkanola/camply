// Design token system for Camply transactional emails.
// Every email component consumes these tokens. Nothing is hardcoded.

export const theme = {
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "16px",
    lg: "24px",
    xl: "32px",
    xxl: "48px",
  },
  radius: {
    sm: "6px",
    md: "10px",
    lg: "16px",
    xl: "24px",
  },
  font: {
    family: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  fontSize: {
    heading: "22px",
    subheading: "16px",
    body: "14px",
    caption: "12px",
    label: "11px",
  },
  fontWeight: {
    bold: "700",
    semibold: "600",
    normal: "400",
  },
  color: {
    // Primary/accent/button are injected as CSS custom properties from branding
    primary: "var(--brand-primary, #E67E22)",
    accent: "var(--brand-accent, #E67E22)",
    button: "var(--brand-button, #E67E22)",
    success: "#16A34A",
    warning: "#D97706",
    danger: "#DC2626",
    info: "#2563EB",
    neutral: {
      50: "#FAFAFA",
      100: "#F5F5F5",
      200: "#E5E5E5",
      300: "#D4D4D4",
      400: "#A3A3A3",
      500: "#737373",
      700: "#404040",
      900: "#171717",
    },
    surface: "#FFFFFF",
    background: "#F8F9FA",
  },
  shadow: {
    card: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
  },
} as const;

/** HTML-escape a string for safe interpolation */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
