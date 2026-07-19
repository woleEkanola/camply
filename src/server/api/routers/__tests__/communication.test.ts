import { describe, expect, it } from "vitest";
import { resolveApprovedQrSrc } from "../communication";

const SAMPLE_DATA_URI = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHQAAAB0CAYAAABUmhYnAAAA";
const APP_URL = "https://app.camply.ng";

describe("resolveApprovedQrSrc", () => {
  it("uses the fixed hosted sample QR for a real test send (email clients strip data: URIs)", () => {
    const src = resolveApprovedQrSrc({ qrCode: SAMPLE_DATA_URI, isRealSend: true, appUrl: APP_URL });
    expect(src).toBe("https://app.camply.ng/api/qr/sample");
  });

  it("keeps the sample data: URI for the in-app preview iframe (no email client involved)", () => {
    const src = resolveApprovedQrSrc({ qrCode: SAMPLE_DATA_URI, isRealSend: false, appUrl: APP_URL });
    expect(src).toBe(SAMPLE_DATA_URI);
  });

  it("passes through an already-hosted http(s) QR unchanged, real send or not", () => {
    const hosted = "https://app.camply.ng/api/qr/real-token-abc";
    expect(resolveApprovedQrSrc({ qrCode: hosted, isRealSend: true, appUrl: APP_URL })).toBe(hosted);
    expect(resolveApprovedQrSrc({ qrCode: hosted, isRealSend: false, appUrl: APP_URL })).toBe(hosted);
  });

  it("falls back to the tiny placeholder PNG when qrCode is missing/unrecognized and it's just a preview", () => {
    const src = resolveApprovedQrSrc({ qrCode: undefined, isRealSend: false, appUrl: APP_URL });
    expect(src).toMatch(/^data:image\/png;base64,/);
  });
});
