import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface AcceptanceLetterParams {
  campName: string;
  campusName: string;
  camperName: string;
  registrationNumber: string;
  reportingDate?: string;
  qrDataUrl: string; // data:image/png;base64,...
  instructionsHtml?: string | null;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Renders a simple one-page acceptance letter PDF with an embedded QR code (PRD Part 6 §9). */
export async function generateAcceptanceLetterPdf(params: AcceptanceLetterParams): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = 780;
  const drawLine = (text: string, opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {}) => {
    page.drawText(text, {
      x: 50,
      y,
      size: opts.size ?? 12,
      font: opts.bold ? boldFont : font,
      color: opts.color ? rgb(...opts.color) : rgb(0, 0, 0),
    });
    y -= (opts.size ?? 12) + 10;
  };

  drawLine(params.campName, { size: 22, bold: true, color: [0.9, 0.49, 0.13] });
  drawLine("Official Acceptance Letter", { size: 14 });
  y -= 10;
  drawLine(`Camper: ${params.camperName}`, { bold: true });
  drawLine(`Registration Number: ${params.registrationNumber}`);
  drawLine(`Campus: ${params.campusName}`);
  if (params.reportingDate) drawLine(`Reporting Date: ${params.reportingDate}`);
  y -= 10;

  if (params.instructionsHtml) {
    drawLine("Important Instructions:", { bold: true });
    const text = stripHtml(params.instructionsHtml);
    const words = text.split(" ");
    let line = "";
    for (const word of words) {
      if ((line + " " + word).length > 90) {
        drawLine(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    if (line) drawLine(line);
  }

  // Embed QR code image
  const base64 = params.qrDataUrl.split(",")[1];
  const qrBytes = Buffer.from(base64, "base64");
  const qrImage = await pdfDoc.embedPng(qrBytes);
  const qrSize = 150;
  page.drawImage(qrImage, { x: 50, y: y - qrSize, width: qrSize, height: qrSize });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
