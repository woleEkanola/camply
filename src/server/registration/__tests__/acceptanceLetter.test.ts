import { describe, expect, it } from "vitest";
import { generateAcceptanceLetterPdf } from "../acceptanceLetter";

// 1x1 transparent PNG, reused as a stand-in QR code — the letter only cares
// that it's a valid embeddable PNG data URL, not its visual content.
const SAMPLE_QR_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("generateAcceptanceLetterPdf", () => {
  it("succeeds without a tribe (pre-allocation registrations)", async () => {
    const bytes = await generateAcceptanceLetterPdf({
      campName: "Test Camp",
      campusName: "Test Campus",
      camperName: "Test Camper",
      registrationNumber: "TC-0001",
      qrDataUrl: SAMPLE_QR_DATA_URL,
    });
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("produces different output when a tribe name is included — the Tribe line is real, not a no-op", async () => {
    const base = {
      campName: "Test Camp",
      campusName: "Test Campus",
      camperName: "Test Camper",
      registrationNumber: "TC-0001",
      qrDataUrl: SAMPLE_QR_DATA_URL,
    };
    const withoutTribe = await generateAcceptanceLetterPdf(base);
    const withTribe = await generateAcceptanceLetterPdf({ ...base, tribeName: "Tribe of Judah" });
    expect(Buffer.compare(withoutTribe, withTribe)).not.toBe(0);
  });
});
