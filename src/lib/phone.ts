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
