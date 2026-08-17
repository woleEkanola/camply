import { PDFDocument, rgb } from "pdf-lib";

// A4 in points (matches the convention already used in acceptanceLetter.ts).
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;

// CR80 card: 85.60mm x 53.98mm. 1mm = 2.8346pt.
const MM_TO_PT = 2.8346;
const CARD_WIDTH = 85.6 * MM_TO_PT; // ~242.6pt
const CARD_HEIGHT = 53.98 * MM_TO_PT; // ~153.0pt

const MARGIN_X = 40;
const COLS = 2;
const ROWS = 4;
export const CARDS_PER_PAGE = COLS * ROWS;
const COL_GUTTER = (PAGE_WIDTH - 2 * MARGIN_X - COLS * CARD_WIDTH) / (COLS - 1);
const ROW_GUTTER = 18;

function cardPositions(): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  // pdf-lib's y axis is bottom-up; row 0 is the topmost row on the page.
  const totalGridHeight = ROWS * CARD_HEIGHT + (ROWS - 1) * ROW_GUTTER;
  const bottomY = (PAGE_HEIGHT - totalGridHeight) / 2;
  for (let row = 0; row < ROWS; row++) {
    const y = bottomY + (ROWS - 1 - row) * (CARD_HEIGHT + ROW_GUTTER);
    for (let col = 0; col < COLS; col++) {
      const x = MARGIN_X + col * (CARD_WIDTH + COL_GUTTER);
      positions.push({ x, y });
    }
  }
  return positions;
}

function drawCropMarks(page: import("pdf-lib").PDFPage, x: number, y: number) {
  const gap = 3;
  const len = 8;
  const color = rgb(0, 0, 0);
  const thickness = 0.5;

  const corners: { cx: number; cy: number; dx: -1 | 1; dy: -1 | 1 }[] = [
    { cx: x, cy: y, dx: -1, dy: -1 },
    { cx: x + CARD_WIDTH, cy: y, dx: 1, dy: -1 },
    { cx: x, cy: y + CARD_HEIGHT, dx: -1, dy: 1 },
    { cx: x + CARD_WIDTH, cy: y + CARD_HEIGHT, dx: 1, dy: 1 },
  ];

  for (const { cx, cy, dx, dy } of corners) {
    // Horizontal segment, offset outward on the x axis.
    page.drawLine({
      start: { x: cx + dx * gap, y: cy },
      end: { x: cx + dx * (gap + len), y: cy },
      thickness,
      color,
    });
    // Vertical segment, offset outward on the y axis.
    page.drawLine({
      start: { x: cx, y: cy + dy * gap },
      end: { x: cx, y: cy + dy * (gap + len) },
      thickness,
      color,
    });
  }
}

/**
 * Produces an A4 sheet with 8 identical copies of one person's ID card (2
 * cols x 4 rows), for print/cut/lamination spares. The card PNG is embedded
 * once and drawn 6 times — this, plus renderCampIdCardPng being the only
 * place the card is ever rendered, is what keeps the email image and every
 * printed copy pixel-identical.
 */
export async function generateCampIdCardSheetPdf(cardPng: Buffer): Promise<Buffer> {
  return generateIdCardSheetPdf(Array(CARDS_PER_PAGE).fill(cardPng));
}

/**
 * Bulk export path: lays out one card per slot (8 per A4 page), paginating
 * as needed, rather than repeating a single card 6 times. Reuses the exact
 * grid/crop-mark layout above so bulk sheets are pixel-identical to the
 * single-camper spares sheet.
 *
 * `format` controls how pdf-lib embeds the source images. `embedPng` decodes
 * to raw RGBA and retains it (~2.5MB per CR80-at-300DPI card) until `save()`
 * — fine for a handful of cards, but the reason a few hundred cards used to
 * exhaust memory. `embedJpg` carries the JPEG bytes through as DCTDecode
 * data with no raster decode, cutting that to the JPEG's own size (~60-90KB
 * at the quality idCards.ts renders at). The bulk export builder always
 * passes "jpeg"; the single-camper spares sheet (generateCampIdCardSheetPdf,
 * one card, 8 slots) keeps "png" — at that scale the memory difference is
 * irrelevant and lossless output is free.
 */
export async function generateIdCardSheetPdf(cardImages: Buffer[], format: "png" | "jpeg" = "png"): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const positions = cardPositions();

  // Embed each unique buffer once, not once per slot — generateCampIdCardSheetPdf
  // passes the same Buffer instance 8 times, and re-embedding it per slot silently
  // bloated the PDF (and broke the "embedded once" invariant callers rely on).
  // Buffer-identity keying is correct for both current callers: the repeated-
  // object case above, and the bulk path, where every card is a distinct
  // render and therefore a distinct object — a content hash would key
  // identically there, just with extra hashing cost for no cache hits.
  const embedded = new Map<Buffer, Awaited<ReturnType<typeof pdfDoc.embedPng>>>();
  async function embedOnce(image: Buffer) {
    const cached = embedded.get(image);
    if (cached) return cached;
    const embeddedImage = format === "jpeg" ? await pdfDoc.embedJpg(image) : await pdfDoc.embedPng(image);
    embedded.set(image, embeddedImage);
    return embeddedImage;
  }

  for (let i = 0; i < cardImages.length; i += CARDS_PER_PAGE) {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const pageCards = cardImages.slice(i, i + CARDS_PER_PAGE);
    for (let j = 0; j < pageCards.length; j++) {
      const image = await embedOnce(pageCards[j]);
      const { x, y } = positions[j];
      page.drawImage(image, { x, y, width: CARD_WIDTH, height: CARD_HEIGHT });
      drawCropMarks(page, x, y);
    }
  }

  if (cardImages.length === 0) {
    pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
