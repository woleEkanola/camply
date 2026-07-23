import { test, expect } from "@playwright/test";
import { normalizeScannedQRToken } from "../src/lib/qr";

test.describe("QR Code Engine & Normalization Verification", () => {
  test("1. Normalizes raw token string", () => {
    expect(normalizeScannedQRToken("   sample_qr_token_123   ")).toBe("sample_qr_token_123");
  });

  test("2. Extracts token from URL query parameters (?token=...)", () => {
    expect(normalizeScannedQRToken("https://camply.app/check-in?token=TOKEN_PARAM_999")).toBe("TOKEN_PARAM_999");
    expect(normalizeScannedQRToken("http://localhost:3001/api/qr?qrToken=TOKEN_PARAM_888")).toBe("TOKEN_PARAM_888");
  });

  test("3. Extracts token from URL path (/api/qr/[token])", () => {
    expect(normalizeScannedQRToken("http://localhost:3001/api/qr/PATH_TOKEN_777")).toBe("PATH_TOKEN_777");
  });

  test("4. Extracts token from JSON stringified QR payloads", () => {
    const jsonStr = JSON.stringify({ qrToken: "JSON_TOKEN_555", regId: "123" });
    expect(normalizeScannedQRToken(jsonStr)).toBe("JSON_TOKEN_555");
  });

  test("5. Preserves Registration Numbers and IDs", () => {
    expect(normalizeScannedQRToken("JT-CAMP-VI-00045")).toBe("JT-CAMP-VI-00045");
  });
});
