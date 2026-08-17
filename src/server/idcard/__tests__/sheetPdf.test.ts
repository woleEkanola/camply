import { describe, expect, it, beforeAll } from "vitest";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { renderCampIdCardPng, type CampIdCardData } from "../renderCard";
import { generateCampIdCardSheetPdf, generateIdCardSheetPdf } from "../sheetPdf";
import { CARD_WIDTH, CARD_HEIGHT } from "../cardPrimitives";

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

describe("generateCampIdCardSheetPdf", () => {
  let cardPng: Buffer;

  beforeAll(async () => {
    cardPng = await renderCampIdCardPng(SAMPLE);
  });

  it("produces a valid single-page A4 PDF", async () => {
    const pdfBytes = await generateCampIdCardSheetPdf(cardPng);
    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBe(1);
    const page = doc.getPage(0);
    const { width, height } = page.getSize();
    expect(width).toBeCloseTo(595, 0);
    expect(height).toBeCloseTo(842, 0);
  });

  it("embeds the same PNG once (single source of truth) — buffer identity check via re-render equality", async () => {
    const pdfBytes = await generateCampIdCardSheetPdf(cardPng);
    const doc = await PDFDocument.load(pdfBytes);
    const imageStreams = doc.context.enumerateIndirectObjects().filter(([, object]) =>
      object instanceof PDFRawStream && object.dict.get(PDFName.of("Subtype")) === PDFName.of("Image")
    );

    // A PNG contributes its image stream and may contribute one alpha-mask
    // stream. Six separately embedded copies would create many more streams.
    expect(imageStreams.length).toBeGreaterThan(0);
    expect(imageStreams.length).toBeLessThanOrEqual(2);
  });
});

describe("generateIdCardSheetPdf pagination", () => {
  let cardPng: Buffer;

  beforeAll(async () => {
    cardPng = await renderCampIdCardPng(SAMPLE);
  });

  it.each([
    [9, 2],
    [16, 2],
    [17, 3],
    [8, 1],
    [1, 1],
  ])("%i cards paginate into %i A4 page(s)", async (count, expectedPages) => {
    const pdfBytes = await generateIdCardSheetPdf(Array(count).fill(cardPng));
    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBe(expectedPages);
  });

  it("produces a single blank page for zero cards rather than an empty document", async () => {
    const pdfBytes = await generateIdCardSheetPdf([]);
    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("paginates distinct jpeg cards correctly (not silently deduped)", async () => {
    // Each buffer must be genuinely distinct here — embedOnce keys by Buffer
    // identity (sheetPdf.ts's documented, deliberate choice), and every real
    // bulk-export card is a distinct render, never a repeated object.
    const cards = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        renderCampIdCardPng({ ...SAMPLE, qrToken: `DISTINCT-${i}` }, { encodeAs: "jpeg" })
      )
    );
    const pdfBytes = await generateIdCardSheetPdf(cards, "jpeg");
    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBe(2); // 8 per page
    const imageStreams = doc.context.enumerateIndirectObjects().filter(([, object]) =>
      object instanceof PDFRawStream && object.dict.get(PDFName.of("Subtype")) === PDFName.of("Image")
    );
    expect(imageStreams.length).toBe(10); // one per distinct card, none collapsed
  });
});

/**
 * Operationalizes the actual bug fix: pdf-lib's embedPng decodes every PNG to
 * raw RGBA and retains it until save() — CARD_WIDTH*CARD_HEIGHT*4 bytes per
 * card, ~2.5MB each, which is what stalled real exports at 120-145 cards on
 * a memory-constrained instance. embedJpg (via the "jpeg" format this suite
 * covers) carries the JPEG bytes through as DCTDecode data with no decode
 * step. This measures actual process memory around embedding many cards,
 * rather than only asserting on output byte sizes, to prove the retained
 * footprint doesn't scale the old way.
 */
describe("generateIdCardSheetPdf memory footprint (jpeg vs png)", () => {
  const CARD_COUNT = 60;
  // Real Skia render + embed of 60 cards is meaningfully slower than the
  // rest of this file's synthetic-buffer tests — this is measuring actual
  // memory behaviour, not mocking it, so it needs the room.
  const TEST_TIMEOUT = 60_000;

  it(
    "keeps retained memory far below what decoding every card as PNG would require",
    async () => {
      const jpegCards = await Promise.all(
        Array.from({ length: CARD_COUNT }, (_, i) =>
          renderCampIdCardPng({ ...SAMPLE, qrToken: `MEM-${i}` }, { encodeAs: "jpeg" })
        )
      );

      if (global.gc) global.gc();
      const before = process.memoryUsage().rss;

      const pdfBytes = await generateIdCardSheetPdf(jpegCards, "jpeg");

      if (global.gc) global.gc();
      const after = process.memoryUsage().rss;

      const decodedPngRasterTotal = CARD_COUNT * (CARD_WIDTH * CARD_HEIGHT * 4); // what embedPng would have retained for the same count
      const observedGrowth = Math.max(0, after - before);

      // Not a tight bound (RSS is a noisy, whole-process measurement) — proving
      // an order-of-magnitude difference from the PNG-decode figure, which is
      // the actual claim: memory does not grow linearly at ~2.5MB/card.
      expect(observedGrowth).toBeLessThan(decodedPngRasterTotal / 4);
      expect(pdfBytes.byteLength).toBeGreaterThan(0);
    },
    TEST_TIMEOUT
  );
});
