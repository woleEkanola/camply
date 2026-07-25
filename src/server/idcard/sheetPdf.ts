import { PDFDocument, rgb } from "pdf-lib";

// A4 in points (matches the convention already used in acceptanceLetter.ts).
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;

// CR80 card: 85.60mm x 53.98mm. 1mm = 2.8346pt.
const MM_TO_PT = 2.8346;
const CARD_WIDTH = 85.6 * MM_TO_PT; // ~242.6pt
const CARD_HEIGHT = 53.98 * MM_TO_PT; // ~153.0pt

const MARGIN = 40;
const COLS = 2;
const ROWS = 3;
const COL_GUTTER = (PAGE_WIDTH - 2 * MARGIN - COLS * CARD_WIDTH) / (COLS - 1);
const ROW_GUTTER = 30;

function cardPositions(): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  // pdf-lib's y axis is bottom-up; row 0 is the topmost row on the page.
  const totalGridHeight = ROWS * CARD_HEIGHT + (ROWS - 1) * ROW_GUTTER;
  const topY = PAGE_HEIGHT - MARGIN;
  for (let row = 0; row < ROWS; row++) {
    const y = topY - totalGridHeight + (ROWS - 1 - row) * (CARD_HEIGHT + ROW_GUTTER);
    for (let col = 0; col < COLS; col++) {
      const x = MARGIN + col * (CARD_WIDTH + COL_GUTTER);
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
 * Produces an A4 sheet with 6 identical copies of one camper's ID card (2
 * cols x 3 rows), for print/cut/lamination spares. The card PNG is embedded
 * once and drawn 6 times — this, plus renderCampIdCardPng being the only
 * place the card is ever rendered, is what keeps the email image and every
 * printed copy pixel-identical.
 */
export async function generateCampIdCardSheetPdf(cardPng: Buffer): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const image = await pdfDoc.embedPng(cardPng);

  for (const { x, y } of cardPositions()) {
    page.drawImage(image, { x, y, width: CARD_WIDTH, height: CARD_HEIGHT });
    drawCropMarks(page, x, y);
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
