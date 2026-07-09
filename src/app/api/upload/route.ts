import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/authOptions";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

// Documents/images only (birth certificates, consent forms)
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "pdf"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 413 });
  }

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
  }
  const fileName = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // If Vercel Blob is enabled, upload to Vercel Blob
  if (process.env.vercel_blob === "true") {
    const { put } = await import("@vercel/blob");
    const blobRes = await put(fileName, buffer, {
      access: 'public',
      addRandomSuffix: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return NextResponse.json({ url: blobRes.url });
  }

  // Otherwise, use local storage as before
  const filePath = path.join(UPLOAD_DIR, fileName);
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(filePath, buffer);
  const url = `/uploads/${fileName}`;
  return NextResponse.json({ url });
}
