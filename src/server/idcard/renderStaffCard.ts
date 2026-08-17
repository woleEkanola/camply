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
  drawBriefcaseGlyph,
  drawShieldGlyph,
  loadLogoOrNull,
  initials,
  type RenderCardOptions,
  SHEET_COLS,
  SHEET_ROWS,
  SHEET_GAP,
  SHEET_SCALE,
} from "./cardPrimitives";

export interface StaffIdCardData {
  staffName: string;
  roleLabel: "TEACHER" | "VOLUNTEER";
  campusName: string;
  gender: string | null;
  departmentLine: string | null; // null when neither a department nor a volunteerCategory is set
  tribeLine: string | null; // null when no tribe assigned — the card must render fine without this row
  campName: string;
  campYear: string;
  logoUrl: string | null;
  qrToken: string;
}

// Fixed per-role band colours — deliberately NOT derived from tribe/department,
// so every staff card's band means the same thing regardless of assignment.
const ROLE_COLORS: Record<StaffIdCardData["roleLabel"], string> = {
  TEACHER: "#1D4ED8", // same family as ACCENT_COLOR
  VOLUNTEER: "#0D9488", // teal — distinguishable from the teacher blue at a glance
};

type InfoRow = { label: string; value: string; glyph: "church" | "person" | "briefcase" | "shield" };

export async function renderStaffIdCardPng(data: StaffIdCardData, options?: RenderCardOptions): Promise<Buffer> {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  const bandColor = ROLE_COLORS[data.roleLabel];

  const [logo, qrBuffer] = await Promise.all([
    loadLogoOrNull(data.logoUrl, options?.logoCache),
    QRCode.toBuffer(data.qrToken, { width: 600, margin: 1 }),
  ]);
  const qrImage = await loadImage(qrBuffer);

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  roundRectPath(ctx, 0, 0, CARD_WIDTH, CARD_HEIGHT, CORNER_RADIUS);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  drawDotGrid(ctx, {
    x: 8, y: 424, width: 96, height: 210,
    spacing: 21, radius: 3.2, color: "#2563EB", fade: "toRight", maxAlpha: 0.5,
  });

  // ─── Role-colour band, top-right — always present, unlike the camper
  // card's tribe band which requires a tribe. This is the card's one
  // structural difference from the camper layout: the band communicates
  // role (Teacher/Volunteer), a value every staff member always has,
  // instead of tribe, a value only some have.
  ctx.fillStyle = bandColor;
  ctx.beginPath();
  ctx.moveTo(BAND_X, 0);
  ctx.lineTo(CARD_WIDTH, 0);
  ctx.lineTo(CARD_WIDTH, HEADER_HEIGHT);
  ctx.lineTo(BAND_X + BAND_CORNER, HEADER_HEIGHT);
  ctx.quadraticCurveTo(BAND_X, HEADER_HEIGHT, BAND_X, HEADER_HEIGHT - BAND_CORNER);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.rect(BAND_X, 0, CARD_WIDTH - BAND_X, HEADER_HEIGHT);
  ctx.clip();
  drawDotGrid(ctx, {
    x: CARD_WIDTH - 232, y: 8, width: 232, height: HEADER_HEIGHT,
    spacing: 17, radius: 2.8, color: "#FFFFFF", fade: "toLeft",
  });
  ctx.restore();

  ctx.fillStyle = ACCENT_COLOR;
  roundRectPath(ctx, 28, HEADER_HEIGHT - 9, BAND_X - 28, 9, 4.5);
  ctx.fill();

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

  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(BAND_X - 30, 34);
  ctx.lineTo(BAND_X - 30, 118);
  ctx.stroke();

  // ─── Role label, centred in the band, shrink-to-fit — same treatment the
  // camper card gives the tribe name.
  const bandInnerWidth = CARD_WIDTH - BAND_X - 56;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFFFFF";
  const roleSize = fitFontSize(ctx, data.roleLabel, bandInnerWidth, { start: 60, min: 24, step: 2 });
  ctx.font = `bold ${roleSize}px Inter, sans-serif`;
  ctx.fillText(data.roleLabel, BAND_X + (CARD_WIDTH - BAND_X) / 2, HEADER_HEIGHT / 2 - 4);

  // ─── Staff name — dominant element, up to two lines. Slightly tighter
  // floor than the camper card's (26 vs 30) since the body can carry up to
  // four info rows instead of two.
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = DARK_TEXT;
  const nameFit = fitTextBlock(ctx, data.staffName, BODY_MAX_WIDTH, { start: 88, min: 26, maxLines: 2 });
  const nameSize = nameFit.fontSize;
  const nameLines = nameFit.lines;
  ctx.font = `bold ${nameSize}px Inter, sans-serif`;
  const nameLineHeight = nameFit.lineHeight;
  const nameTop = nameLines.length >= 2 ? 208 : 254;
  nameLines.forEach((line, i) => {
    ctx.fillText(line, BODY_X, nameTop + i * nameLineHeight);
  });
  const nameBottom = nameTop + (nameLines.length - 1) * nameLineHeight;

  const ruleY = nameBottom + 30;
  ctx.strokeStyle = ACCENT_COLOR;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(BODY_X, ruleY);
  ctx.lineTo(BODY_X + Math.min(BODY_MAX_WIDTH, 382), ruleY);
  ctx.stroke();

  function drawInfoRow(centerY: number, row: InfoRow) {
    const discR = 22;
    const discCx = BODY_X + discR;
    ctx.fillStyle = ACCENT_COLOR;
    ctx.beginPath();
    ctx.arc(discCx, centerY, discR, 0, Math.PI * 2);
    ctx.fill();
    const glyphSize = discR * 1.55;
    if (row.glyph === "church") drawChurchGlyph(ctx, discCx, centerY, glyphSize, ACCENT_COLOR);
    else if (row.glyph === "person") drawPersonGlyph(ctx, discCx, centerY, glyphSize);
    else if (row.glyph === "briefcase") drawBriefcaseGlyph(ctx, discCx, centerY, glyphSize);
    else drawShieldGlyph(ctx, discCx, centerY, glyphSize);

    const textX = discCx + discR + 20;
    const valueMaxWidth = BODY_MAX_WIDTH - (textX - BODY_X);
    ctx.textAlign = "left";
    ctx.fillStyle = MUTED_TEXT;
    ctx.font = "bold 16px Inter, sans-serif";
    fillTextTracked(ctx, row.label.toUpperCase(), textX, centerY - 7, 1.4);
    ctx.fillStyle = DARK_TEXT;
    const valueFit = fitTextBlock(ctx, row.value, valueMaxWidth, { start: 23, min: 17, maxLines: 1 });
    ctx.font = `bold ${valueFit.fontSize}px Inter, sans-serif`;
    ctx.fillText(valueFit.lines[0], textX, centerY + 21);
  }

  // ─── Body rows — data-driven, 2 to 4 of them depending on what's
  // assigned. Campus and Gender always render; Department and Tribe are
  // omitted (not shown as "—") when the staff member has neither, which is
  // the normal case for a volunteer with no tribe.
  const rows: InfoRow[] = [
    { label: "Campus", value: data.campusName, glyph: "church" },
    { label: "Gender", value: data.gender ?? "—", glyph: "person" },
  ];
  if (data.departmentLine) rows.push({ label: "Department", value: data.departmentLine, glyph: "briefcase" });
  if (data.tribeLine) rows.push({ label: "Tribe", value: data.tribeLine, glyph: "shield" });

  const rowSpacing = 52;
  let rowY = ruleY + 46;
  rows.forEach((row, i) => {
    if (i > 0) {
      const sepY = rowY - rowSpacing / 2;
      ctx.strokeStyle = HAIRLINE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(BODY_X, sepY);
      ctx.lineTo(BODY_X + Math.min(BODY_MAX_WIDTH, 382), sepY);
      ctx.stroke();
    }
    drawInfoRow(rowY, row);
    rowY += rowSpacing;
  });

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

  ctx.restore();

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

export async function renderStaffIdCardSheetPng(data: StaffIdCardData): Promise<Buffer> {
  const singlePng = await renderStaffIdCardPng(data);
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
