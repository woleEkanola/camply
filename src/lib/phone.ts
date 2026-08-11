const COUNTRY_CODE = "234";

function onlyDigits(raw: string): string {
  return (raw ?? "").replace(/\D/g, "");
}

/**
 * Normalizes any raw phone input — an already-normalized "+234XXXXXXXXXX",
 * legacy "0XXXXXXXXXX" data, a pasted "234XXXXXXXXXX" (no leading 0 or +),
 * or a partial in-progress value — to the 11-digit Nigerian LOCAL form ("0"
 * + 10 digits) used both for the PhoneInput display and completeness
 * checks. Truncates anything longer than 11 digits (defends against a
 * garbage paste rather than silently keeping extra trailing digits).
 */
export function toLocalNigerianDigits(raw: string): string {
  let digits = onlyDigits(raw);
  if (digits.startsWith(COUNTRY_CODE)) {
    digits = "0" + digits.slice(COUNTRY_CODE.length);
  } else if (digits.length === 10 && !digits.startsWith("0")) {
    digits = "0" + digits;
  }
  return digits.slice(0, 11);
}

export function isCompleteNigerianPhone(raw: string): boolean {
  return /^0\d{10}$/.test(toLocalNigerianDigits(raw));
}

/** Canonical stored form: "+234XXXXXXXXXX" once the number is complete, otherwise the partial local digits typed so far. */
export function normalizeNigerianPhone(raw: string): string {
  const local = toLocalNigerianDigits(raw);
  return isCompleteNigerianPhone(local) ? `+${COUNTRY_CODE}${local.slice(1)}` : local;
}

/**
 * Converts a raw StaffProfile.phone value into the bare digit string a
 * `https://wa.me/<digits>` link needs. Deliberately NOT built on
 * `normalizeNigerianPhone`/`toLocalNigerianDigits` above — those assume
 * every number is Nigerian and would mangle any other country's number
 * (e.g. "+1-555-0500" -> "15550500" -> wrongly treated as NG-local and
 * reformatted). Returns null for blank input so callers can render a
 * "No phone on file" fallback instead of a dead wa.me link.
 */
export function toWhatsAppDigits(raw: string): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const digits = onlyDigits(trimmed);
  if (!digits) return null;
  if (trimmed.startsWith("+")) return digits; // already international — pass through
  if (digits.startsWith(COUNTRY_CODE)) return digits;
  if (/^0\d{10}$/.test(digits)) return COUNTRY_CODE + digits.slice(1); // NG local
  return digits; // best effort — still yields a usable wa.me link
}

// Nigerian phone numbers are 11 digits in local format (0XXXXXXXXXX) or
// "+234" followed by 10 digits in international format (+234XXXXXXXXXX,
// 14 characters including the +). Strips everything else as the user types
// so a NUMBER-type form field can never exceed a valid Nigerian length.
export function sanitizeNigerianPhoneInput(raw: string): string {
  let value = raw.replace(/[^\d+]/g, "");
  const hasLeadingPlus = value.startsWith("+");
  value = (hasLeadingPlus ? "+" : "") + value.replace(/\+/g, "");
  return hasLeadingPlus ? value.slice(0, 14) : value.slice(0, 11);
}
