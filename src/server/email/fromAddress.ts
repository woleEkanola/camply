/**
 * Builds a Resend-compatible "from" string with optional display name.
 * Format: "Sender Name <slug@camply.ng>" or just the email address.
 */
export function buildFromAddress(params: {
  orgSlug?: string | null;
  senderName?: string | null;
  fallback?: string;
}): string {
  const email = params.orgSlug
    ? `${params.orgSlug}@camply.ng`
    : params.fallback ?? "donotreply@camply.ng";

  if (params.senderName) {
    return `${params.senderName} <${email}>`;
  }
  return email;
}
