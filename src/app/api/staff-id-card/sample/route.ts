import { NextResponse } from "next/server";
import { renderStaffIdCardPng, type StaffIdCardData } from "@/server/idcard/renderStaffCard";

/**
 * Fixed sample staff ID card image — no DB lookup, mirrors
 * /api/id-card/sample's role for the camper card. A literal sibling path
 * takes precedence over the [token] dynamic route.
 */
const SAMPLE_DATA: StaffIdCardData = {
  staffName: "Adaeze Okonkwo",
  roleLabel: "TEACHER",
  campusName: "Ikeja Campus",
  gender: "Female",
  departmentLine: "Medical · Head",
  tribeLine: "Judah · Camp Monitor",
  campName: "TCN Teens Camp",
  campYear: String(new Date().getFullYear()),
  logoUrl: null,
  qrToken: "SAMPLE-PREVIEW-QR",
};

export async function GET() {
  const png = await renderStaffIdCardPng(SAMPLE_DATA);

  return new NextResponse(png, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
