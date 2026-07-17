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
