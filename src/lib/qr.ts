/**
 * Normalizes and extracts clean tokens from scanned QR code strings.
 * Handles raw tokens, full URLs, query parameters, JSON payloads, and trailing whitespace.
 */
export function normalizeScannedQRToken(rawInput: string): string {
  if (!rawInput) return "";

  let cleaned = rawInput.trim();

  // Strip quotes if stringified JSON or quoted string
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // 1. JSON Payload extraction
  if (cleaned.startsWith("{") && cleaned.endsWith("}")) {
    try {
      const parsed = JSON.parse(cleaned);
      const token =
        parsed.qrToken ||
        parsed.token ||
        parsed.registrationToken ||
        parsed.registrationNumber ||
        parsed.id ||
        parsed.camperId;
      if (token && typeof token === "string") {
        return token.trim();
      }
    } catch {
      // Fallback to text parsing if JSON parse fails
    }
  }

  // 2. Full URL or Path extraction
  if (cleaned.includes("://") || cleaned.startsWith("/")) {
    try {
      // Handle relative paths by adding dummy origin
      const dummyOrigin = "https://camply.internal";
      const urlStr = cleaned.startsWith("/") ? `${dummyOrigin}${cleaned}` : cleaned;
      const parsedUrl = new URL(urlStr);

      // Check query parameters
      const paramToken =
        parsedUrl.searchParams.get("qrToken") ||
        parsedUrl.searchParams.get("token") ||
        parsedUrl.searchParams.get("qr") ||
        parsedUrl.searchParams.get("id") ||
        parsedUrl.searchParams.get("reg");

      if (paramToken) {
        return paramToken.trim();
      }

      // Check path segments (e.g., /api/qr/CMX12345 or /check-in/CMX12345)
      const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
      if (pathSegments.length > 0) {
        const lastSegment = pathSegments[pathSegments.length - 1];
        if (lastSegment && lastSegment !== "qr" && lastSegment !== "check-in") {
          return lastSegment.trim();
        }
      }
    } catch {
      // Fallback to regex token extraction if URL parsing fails
    }
  }

  // 3. Fallback regex match for token parameter in unparseable URLs
  const urlParamMatch = cleaned.match(/(?:token|qr|id)=([a-zA-Z0-9_\-]+)/i);
  if (urlParamMatch && urlParamMatch[1]) {
    return urlParamMatch[1].trim();
  }

  return cleaned;
}
