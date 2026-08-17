import QRCode from "qrcode";
import {
  createCanvas,
  loadImage,
  CARD_WIDTH,
  CARD_HEIGHT,
  CORNER_RADIUS,
  ACCENT_COLOR,
  MUTED_TEXT,
  DARK_TEXT,
  HAIRLINE,
  HEADER_HEIGHT,
  BAND_X,
  BAND_CORNER,
  BODY_X,
  QR_BOX_SIZE,
  QR_BOX_X,
  BODY_MAX_WIDTH,
  roundRectPath,
  fitFontSize,
  truncateToFit,
  fitTextBlock,
  fillTextTracked,
  drawDotGrid,
  drawChurchGlyph,
  drawPersonGlyph,
  loadLogoOrNull,
  initials,
  type RenderCardOptions,
  SHEET_COLS,
  SHEET_ROWS,
  SHEET_GAP,
  SHEET_SCALE,
} from "./cardPrimitives";

export interface CampIdCardData {
  camperName: string;
  campusName: string;
  gender: string | null;
  tribeName: string;
  tribeColor: string; // hex; fallback '#1E3A8A' applied by the caller if Tribe.color is null
  campName: string;
  campYear: string;
  logoUrl: string | null;
  qrToken: string;
}

export async function renderCampIdCardPng(data: CampIdCardData, options?: RenderCardOptions): Promise<Buffer> {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  const [logo, qrBuffer] = await Promise.all([
    loadLogoOrNull(data.logoUrl, options?.logoCache),
    QRCode.toBuffer(data.qrToken, { width: 600, margin: 1 }),
  ]);
  const qrImage = await loadImage(qrBuffer);

  // White background, clipped to the card's rounded outline so nothing
  // drawn afterward can bleed past the corners.
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  roundRectPath(ctx, 0, 0, CARD_WIDTH, CARD_HEIGHT, CORNER_RADIUS);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // ─── Decorative halftone texture, bottom-left (behind everything else).
  // Hugs the left edge and stays faint so it never competes with the info
  // rows that sit just to its right.
  drawDotGrid(ctx, {
    x: 8, y: 424, width: 96, height: 210,
    spacing: 21, radius: 3.2, color: "#2563EB", fade: "toRight", maxAlpha: 0.5,
  });

  // ─── Tribe-colour band, top-right, with a rounded bottom-left corner so the
  // white header reads as a tab tucked beneath it (matches the reference).
  ctx.fillStyle = data.tribeColor;
  ctx.beginPath();
  ctx.moveTo(BAND_X, 0);
  ctx.lineTo(CARD_WIDTH, 0);
  ctx.lineTo(CARD_WIDTH, HEADER_HEIGHT);
  ctx.lineTo(BAND_X + BAND_CORNER, HEADER_HEIGHT);
  ctx.quadraticCurveTo(BAND_X, HEADER_HEIGHT, BAND_X, HEADER_HEIGHT - BAND_CORNER);
  ctx.closePath();
  ctx.fill();

  // Halftone texture inside the band's right end.
  ctx.save();
  ctx.beginPath();
  ctx.rect(BAND_X, 0, CARD_WIDTH - BAND_X, HEADER_HEIGHT);
  ctx.clip();
  drawDotGrid(ctx, {
    x: CARD_WIDTH - 232, y: 8, width: 232, height: HEADER_HEIGHT,
    spacing: 17, radius: 2.8, color: "#FFFFFF", fade: "toLeft",
  });
  ctx.restore();

  // Accent bar underlining the white header tab, meeting the band.
  ctx.fillStyle = ACCENT_COLOR;
  roundRectPath(ctx, 28, HEADER_HEIGHT - 9, BAND_X - 28, 9, 4.5);
  ctx.fill();

  // ─── Circular logo badge, top-left.
  const badgeCx = 95;
  const badgeCy = 76;
  const badgeR = 47;
  ctx.save();
  ctx.beginPath();
  ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (logo) {
    ctx.drawImage(logo, badgeCx - badgeR, badgeCy - badgeR, badgeR * 2, badgeR * 2);
  } else {
    ctx.fillStyle = "#EFF6FF";
    ctx.fillRect(badgeCx - badgeR, badgeCy - badgeR, badgeR * 2, badgeR * 2);
    ctx.fillStyle = ACCENT_COLOR;
    ctx.font = "bold 30px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials(data.campName), badgeCx, badgeCy);
  }
  ctx.restore();
  ctx.strokeStyle = DARK_TEXT;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2);
  ctx.stroke();

  // ─── Camp name + year, right of the logo badge, shrink-to-fit so long camp
  // names never collide with the vertical rule before the band.
  const campTextX = badgeCx + badgeR + 22;
  const campMaxWidth = BAND_X - 46 - campTextX;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = DARK_TEXT;
  const campUpper = data.campName.toUpperCase();
  const campSize = fitFontSize(ctx, campUpper, campMaxWidth, { start: 38, min: 20, step: 2 });
  ctx.font = `bold ${campSize}px Inter, sans-serif`;
  ctx.fillText(truncateToFit(ctx, campUpper, campMaxWidth), campTextX, 84);
  ctx.fillStyle = ACCENT_COLOR;
  ctx.font = "bold 32px Inter, sans-serif";
  ctx.fillText(data.campYear, campTextX, 128);

  // Vertical hairline between the camp block and the band.
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(BAND_X - 30, 34);
  ctx.lineTo(BAND_X - 30, 118);
  ctx.stroke();

  // ─── Tribe name, centred in the band, shrink-to-fit.
  const bandInnerWidth = CARD_WIDTH - BAND_X - 56;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFFFFF";
  const tribeUpper = data.tribeName.toUpperCase();
  const tribeFit = fitTextBlock(ctx, tribeUpper, bandInnerWidth, { start: 60, min: 24, maxLines: 2, lineHeight: 0.95 });
  ctx.font = `bold ${tribeFit.fontSize}px Inter, sans-serif`;
  const tribeStartY = HEADER_HEIGHT / 2 - tribeFit.height / 2 + tribeFit.fontSize / 2 - 4;
  tribeFit.lines.forEach((line, index) => ctx.fillText(line, BAND_X + (CARD_WIDTH - BAND_X) / 2, tribeStartY + index * tribeFit.lineHeight));

  // ─── Camper name — the dominant element, wrapping to at most two lines.
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = DARK_TEXT;
  // Starts large enough that a typical two-part name stacks onto two lines,
  // matching the reference artwork's proportions.
  const nameFit = fitTextBlock(ctx, data.camperName, BODY_MAX_WIDTH, { start: 92, min: 30, maxLines: 2 });
  const nameSize = nameFit.fontSize;
  const nameLines = nameFit.lines;
  ctx.font = `bold ${nameSize}px Inter, sans-serif`;
  const nameLineHeight = nameFit.lineHeight;
  // Anchor the block so one- and two-line names share the same optical centre:
  // a short single-line name drops lower so the body doesn't sit top-heavy.
  const nameTop = nameLines.length >= 2 ? 232 : 278;
  nameLines.forEach((line, i) => {
    ctx.fillText(line, BODY_X, nameTop + i * nameLineHeight);
  });
  const nameBottom = nameTop + (nameLines.length - 1) * nameLineHeight;

  // Short accent rule under the name.
  const ruleY = nameBottom + 36;
  ctx.strokeStyle = ACCENT_COLOR;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(BODY_X, ruleY);
  ctx.lineTo(BODY_X + Math.min(BODY_MAX_WIDTH, 382), ruleY);
  ctx.stroke();

  // ─── Campus / Gender rows — solid accent disc + glyph, tracked label, bold value.
  function drawInfoRow(centerY: number, label: string, value: string, glyph: "church" | "person") {
    const discR = 24;
    const discCx = BODY_X + discR;
    ctx.fillStyle = ACCENT_COLOR;
    ctx.beginPath();
    ctx.arc(discCx, centerY, discR, 0, Math.PI * 2);
    ctx.fill();
    if (glyph === "church") drawChurchGlyph(ctx, discCx, centerY, discR * 1.55, ACCENT_COLOR);
    else drawPersonGlyph(ctx, discCx, centerY, discR * 1.55);

    const textX = discCx + discR + 22;
    const valueMaxWidth = BODY_MAX_WIDTH - (textX - BODY_X);
    ctx.textAlign = "left";
    ctx.fillStyle = MUTED_TEXT;
    ctx.font = "bold 18px Inter, sans-serif";
    fillTextTracked(ctx, label.toUpperCase(), textX, centerY - 8, 1.6);
    ctx.fillStyle = DARK_TEXT;
    ctx.font = "bold 26px Inter, sans-serif";
    ctx.fillText(truncateToFit(ctx, value, valueMaxWidth), textX, centerY + 24);
  }

  const campusRowY = ruleY + 56;
  drawInfoRow(campusRowY, "Campus", data.campusName, "church");

  const rowSeparatorY = campusRowY + 56;
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(BODY_X, rowSeparatorY);
  ctx.lineTo(BODY_X + Math.min(BODY_MAX_WIDTH, 382), rowSeparatorY);
  ctx.stroke();

  drawInfoRow(rowSeparatorY + 52, "Gender", data.gender ?? "—", "person");

  // ─── QR code: large rounded container on the right, vertically centred in
  // the body, with an inset quiet zone for scan reliability.
  const qrInset = 22;
  const qrSize = QR_BOX_SIZE - qrInset * 2;
  const qrBoxY = HEADER_HEIGHT + Math.round((CARD_HEIGHT - HEADER_HEIGHT - QR_BOX_SIZE) / 2);

  roundRectPath(ctx, QR_BOX_X, qrBoxY, QR_BOX_SIZE, QR_BOX_SIZE, 20);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.strokeStyle = ACCENT_COLOR;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.drawImage(qrImage, QR_BOX_X + qrInset, qrBoxY + qrInset, qrSize, qrSize);

  ctx.restore(); // undo the card-outline clip

  // Faint cut guide tracing the card's exact outline, so a printed sheet can
  // be trimmed accurately. Drawn after the clip is released (a stroke inside
  // the clip would lose its outer half) and kept light enough not to read as
  // part of the design on screen.
  roundRectPath(ctx, 1.5, 1.5, CARD_WIDTH - 3, CARD_HEIGHT - 3, CORNER_RADIUS - 1);
  ctx.strokeStyle = "#CBD5E1";
  ctx.lineWidth = 3;
  ctx.stroke();

  if (options?.encodeAs === "jpeg") return canvas.encode("jpeg", options.jpegQuality ?? 90);
  return canvas.encode("png");
}

const SHEET_CARD_W = Math.round(CARD_WIDTH * SHEET_SCALE);
const SHEET_CARD_H = Math.round(CARD_HEIGHT * SHEET_SCALE);
const SHEET_W = SHEET_CARD_W * SHEET_COLS + SHEET_GAP * (SHEET_COLS + 1);
const SHEET_H = SHEET_CARD_H * SHEET_ROWS + SHEET_GAP * (SHEET_ROWS + 1);

export async function renderCampIdCardSheetPng(data: CampIdCardData): Promise<Buffer> {
  const singlePng = await renderCampIdCardPng(data);
  const singleImg = await loadImage(singlePng);

  const canvas = createCanvas(SHEET_W, SHEET_H);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, SHEET_W, SHEET_H);

  for (let row = 0; row < SHEET_ROWS; row++) {
    for (let col = 0; col < SHEET_COLS; col++) {
      const x = SHEET_GAP + col * (SHEET_CARD_W + SHEET_GAP);
      const y = SHEET_GAP + row * (SHEET_CARD_H + SHEET_GAP);
      ctx.drawImage(singleImg, x, y, SHEET_CARD_W, SHEET_CARD_H);
    }
  }

  return canvas.encode("png");
}
