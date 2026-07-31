import { describe, expect, it, vi, afterEach } from "vitest";
import { renderCampIdCardPng, renderCampIdCardSheetPng, type CampIdCardData } from "../renderCard";

const SAMPLE: CampIdCardData = {
  camperName: "James Adelabu",
  campusName: "Igando Campus",
  gender: "Male",
  tribeName: "Pistis",
  tribeColor: "#1E3A8A",
  campName: "TCN Teens Camp",
  campYear: "2026",
  logoUrl: null,
  qrToken: "SAMPLE-PREVIEW-QR",
};

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("renderCampIdCardPng", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a PNG buffer at exactly 1011x638 (CR80 @ 300 DPI)", async () => {
    const png = await renderCampIdCardPng(SAMPLE);
    expect(Buffer.isBuffer(png)).toBe(true);
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);

    // IHDR chunk immediately follows the signature: width/height are the
    // first 8 bytes of chunk data, starting at byte 16.
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    expect(width).toBe(1011);
    expect(height).toBe(638);
  });

  it("renders a long tribe name (shrink-to-fit) without throwing", async () => {
    const png = await renderCampIdCardPng({ ...SAMPLE, tribeName: "Mighty Warriors Of Faith" });
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("renders a long camper name (shrink-to-fit + ellipsis path) without throwing", async () => {
    const png = await renderCampIdCardPng({
      ...SAMPLE,
      camperName: "Oluwaseunfunmi Adeyemi-Babatunde Okonkwo-Chukwuemeka",
    });
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("falls back gracefully when the logo URL fetch fails", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));
    const png = await renderCampIdCardPng({ ...SAMPLE, logoUrl: "https://broken.example/logo.png" });
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("falls back gracefully when the logo URL returns a non-OK response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }) as any);
    const png = await renderCampIdCardPng({ ...SAMPLE, logoUrl: "https://missing.example/logo.png" });
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it("renders with no gender set", async () => {
    const png = await renderCampIdCardPng({ ...SAMPLE, gender: null });
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);
  });
});

describe("renderCampIdCardSheetPng", () => {
  it("renders a 2×3 grid PNG (six cards on one image)", async () => {
    const png = await renderCampIdCardSheetPng(SAMPLE);
    expect(Buffer.isBuffer(png)).toBe(true);
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);

    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    expect(width).toBeGreaterThan(1000);
    expect(height).toBeGreaterThan(900);
  });
});
