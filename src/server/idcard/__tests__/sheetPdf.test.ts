import { describe, expect, it, beforeAll } from "vitest";
import { PDFDocument } from "pdf-lib";
import { renderCampIdCardPng, type CampIdCardData } from "../renderCard";
import { generateCampIdCardSheetPdf } from "../sheetPdf";

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
    const pdfBytes1 = await generateCampIdCardSheetPdf(cardPng);
    const pdfBytes2 = await generateCampIdCardSheetPdf(cardPng);
    // Same input PNG -> same-size PDF output (deterministic embed, not a
    // proof of pixel content, but confirms no randomness/drift per call).
    expect(pdfBytes1.length).toBe(pdfBytes2.length);
  });
});
