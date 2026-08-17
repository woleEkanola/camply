import crypto from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { put, del } from "@vercel/blob";

/**
 * Thin wrapper over @vercel/blob for large export artifacts and resumable
 * chunks — bytea in Postgres (artifactStore.ts's original design) doesn't
 * scale to a 5,000-card ID-card PDF or to staging chunks across the many
 * function invocations a large export needs to complete on Vercel.
 *
 * ⚠️ Privacy tradeoff, stated plainly: this SDK's `put()` only supports
 * `access: 'public'` — there is no private-blob mode available here. A blob
 * URL is not access-controlled by Vercel; anyone who obtains the exact URL
 * can fetch it directly. Two mitigations, both real but neither absolute:
 *   1. The pathname includes 192 bits of random hex, so the URL cannot be
 *      guessed or enumerated — only obtained by reading it out of this
 *      server's own process or the database.
 *   2. The URL itself is never sent to the client. `/api/exports/[id]/download`
 *      is the only consumer; it fetches server-to-server and streams the
 *      bytes through its own auth check, exactly like the existing bytea path.
 *      Blobs are deleted as soon as they're no longer needed (job completion
 *      for staged parts, job expiry/deletion for final artifacts) to shrink
 *      the exposure window.
 * This is a materially different guarantee than the bytea path, which has no
 * URL at all. Anyone changing this module should not assume the two are
 * equivalent.
 *
 * Local dev / CI fallback: without a real BLOB_READ_WRITE_TOKEN, every call
 * here transparently uses a local-disk store instead — this is what keeps
 * bulk ID-card exports (which always stage at least one chunk, even for a
 * handful of cards; see chunkedIdCardRender.ts) working with `npm run dev`,
 * `npm run start`, and Playwright, none of which have a real Vercel Blob
 * store attached. This mirrors the original artifactStore.ts design's own
 * stated goal — "needs no new env var and behaves identically local vs prod"
 * — for the one piece (blob storage) that couldn't keep that property
 * outright once bulk exports needed somewhere to stage chunks.
 */

function hasRealBlobToken(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

const LOCAL_BLOB_SCHEME = "local-blob://";
const localBlobDir = path.join(os.tmpdir(), "camply-export-blobs");

async function localPut(pathname: string, data: Buffer): Promise<{ url: string; size: number }> {
  const filePath = path.join(localBlobDir, pathname.replace(/\//g, "_"));
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data);
  return { url: `${LOCAL_BLOB_SCHEME}${encodeURIComponent(filePath)}`, size: data.byteLength };
}

function localFilePathFromUrl(url: string): string {
  return decodeURIComponent(url.slice(LOCAL_BLOB_SCHEME.length));
}

async function localFetch(url: string): Promise<Buffer> {
  return fs.readFile(localFilePathFromUrl(url));
}

async function localDelete(url: string): Promise<void> {
  await fs.rm(localFilePathFromUrl(url), { force: true });
}

function randomPathname(jobId: string, extension: string): string {
  const token = crypto.randomBytes(24).toString("hex");
  return `exports/${jobId}/${token}.${extension}`;
}

function extensionFor(mimeType: string): string {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "xlsx";
  if (mimeType === "text/csv") return "csv";
  if (mimeType === "application/json") return "json";
  return "bin";
}

export interface UploadedBlob {
  /** The full blob URL (or, locally, a `local-blob://` pseudo-URL — see this module's fallback note). Stored as-is in ExportJob.blobKey / ExportPart.blobKey. */
  url: string;
  size: number;
}

export async function uploadBlob(jobId: string, data: Buffer, mimeType: string): Promise<UploadedBlob> {
  const pathname = randomPathname(jobId, extensionFor(mimeType));
  if (!hasRealBlobToken()) return localPut(pathname, data);
  const result = await put(pathname, data, {
    access: "public",
    contentType: mimeType,
    addRandomSuffix: false, // our own 192-bit random token already makes collisions and guessing infeasible
  });
  return { url: result.url, size: data.byteLength };
}

export async function fetchBlob(url: string): Promise<Buffer> {
  if (url.startsWith(LOCAL_BLOB_SCHEME)) return localFetch(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch blob (${res.status}): ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Returns a Web ReadableStream so the download route can stream without buffering the whole artifact. */
export async function streamBlob(url: string): Promise<{ body: ReadableStream<Uint8Array>; contentLength: number | null }> {
  if (url.startsWith(LOCAL_BLOB_SCHEME)) {
    const data = await localFetch(url);
    return {
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(data));
          controller.close();
        },
      }),
      contentLength: data.byteLength,
    };
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch blob (${res.status}): ${url}`);
  if (!res.body) throw new Error(`Blob fetch returned no body: ${url}`);
  const contentLength = res.headers.get("content-length");
  return { body: res.body, contentLength: contentLength ? Number(contentLength) : null };
}

export async function deleteBlob(url: string): Promise<void> {
  try {
    if (url.startsWith(LOCAL_BLOB_SCHEME)) {
      await localDelete(url);
      return;
    }
    await del(url);
  } catch (error) {
    // Deletion failures leak storage, not data — never let cleanup errors
    // block the job-status transition that triggered them.
    console.error(`[export/blobStore] failed to delete blob ${url}:`, error);
  }
}

export async function deleteBlobs(urls: string[]): Promise<void> {
  await Promise.all(urls.map((url) => deleteBlob(url)));
}
