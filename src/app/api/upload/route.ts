import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";

// Import Vercel Blob only if needed
let put: undefined | ((name: string, data: Blob | Buffer, opts?: any) => Promise<{ url: string }>);
if (process.env.vercel_blob === "true") {
  // Dynamic import for edge compatibility
  // @ts-ignore
  import("@vercel/blob").then(mod => { put = mod.put; });
}

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  const ext = file.name.split(".").pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${ext}`;

  // If Vercel Blob is enabled, upload to Vercel Blob
  if (process.env.vercel_blob === "true") {
    // Import the put function
    const { put } = await import("@vercel/blob");
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
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
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await fs.writeFile(filePath, buffer);
  const url = `/uploads/${fileName}`;
  return NextResponse.json({ url });
}
