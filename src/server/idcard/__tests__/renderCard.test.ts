import { describe, expect, it, vi, afterEach } from "vitest";
import jsQR from "jsqr";
import { renderCampIdCardPng, renderCampIdCardSheetPng, type CampIdCardData } from "../renderCard";
import { createCanvas, loadImage, fitTextBlock, BODY_MAX_WIDTH, CARD_WIDTH, CARD_HEIGHT } from "../cardPrimitives";

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

/**
 * The bulk export builder (idCards.ts) renders every card as JPEG so pdf-lib
 * can embed it without decoding ~2.5MB of raster per card — the fix for the
 * OOM that stalled real exports at 120-145 cards. This is the one real risk
 * of that tradeoff: does the QR code — the only part of the card that has to
 * be machine-readable, not just legible — still decode after compression?
 */
describe("renderCampIdCardPng — JPEG output for bulk export", () => {
  const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

  it("produces a JPEG at the default quality", async () => {
    const jpeg = await renderCampIdCardPng(SAMPLE, { encodeAs: "jpeg" });
    expect(jpeg.subarray(0, 3)).toEqual(JPEG_MAGIC);
  });

  it("stays far smaller than what pdf-lib would retain per embedded PNG", async () => {
    // The comparison that actually matters is not against the PNG *file*'s
    // own compressed size (a card like this, mostly flat colour and text,
    // is already a fairly compact PNG) — it's against what pdf-lib's
    // embedPng call decodes it BACK to and retains until save(): raw RGBA,
    // width*height*4 bytes, regardless of how well the source PNG
    // compressed. That decoded-raster figure is the actual memory cost the
    // JPEG path (embedJpg, which never decodes) avoids.
    const decodedRasterBytes = CARD_WIDTH * CARD_HEIGHT * 4;
    const jpeg = await renderCampIdCardPng(SAMPLE, { encodeAs: "jpeg" });
    expect(jpeg.byteLength).toBeLessThan(decodedRasterBytes / 10);
  });

  it("keeps the QR code scannable at the quality idCards.ts renders at (90)", async () => {
    const jpeg = await renderCampIdCardPng(SAMPLE, { encodeAs: "jpeg", jpegQuality: 90 });
    const image = await loadImage(jpeg);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, image.width, image.height);

    const decoded = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), width, height);
    expect(decoded?.data).toBe(SAMPLE.qrToken);
  });

  it("shares one logo fetch across cards that pass the same cache", async () => {
    // The response content doesn't matter for this test — only that fetch is
    // hit exactly once. A 404 still exercises the real fetch call and lets
    // loadLogoOrNull fall back to the initials badge, same as any other card
    // whose logo can't be loaded.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }));
    const logoCache = new Map();
    const data = { ...SAMPLE, logoUrl: "https://org.example/logo.png" };
    await Promise.all([
      renderCampIdCardPng(data, { logoCache }),
      renderCampIdCardPng(data, { logoCache }),
      renderCampIdCardPng(data, { logoCache }),
    ]);
    // Three cards, one shared URL, one fetch — not three. This is what makes
    // a several-thousand-card export avoid several-thousand HTTP round-trips
    // for a logo that's identical across the whole org.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("fitTextBlock", () => {
  it("keeps long and unbreakable names inside the reserved text column", () => {
    const ctx = createCanvas(1011, 638).getContext("2d");
    for (const name of [
      "Oluwaseunfunmi Adeyemi-Babatunde Okonkwo-Chukwuemeka",
      "ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ",
    ]) {
      const fitted = fitTextBlock(ctx, name, BODY_MAX_WIDTH, { start: 92, min: 30, maxLines: 2 });
      expect(fitted.lines.length).toBeLessThanOrEqual(2);
      expect(fitted.width).toBeLessThanOrEqual(BODY_MAX_WIDTH);
      expect(fitted.fontSize).toBeGreaterThanOrEqual(30);
    }
  });
});

describe("renderCampIdCardSheetPng", () => {
  it("renders a 2x4 grid PNG (eight cards on one image)", async () => {
    const png = await renderCampIdCardSheetPng(SAMPLE);
    expect(Buffer.isBuffer(png)).toBe(true);
    expect(png.subarray(0, 8)).toEqual(PNG_MAGIC);

    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    expect(width).toBeGreaterThan(1000);
    expect(height).toBeGreaterThan(1200);
  });
});
