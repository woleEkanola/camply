import { prisma } from "../db";
import { uploadBlob, deleteBlob } from "./blobStore";

export interface StoredArtifact {
  fileName: string;
  mimeType: string;
  data: Buffer;
}

export interface ArtifactStore {
  put(jobId: string, artifact: StoredArtifact): Promise<{ fileSize: number }>;
  get(jobId: string): Promise<StoredArtifact | null>;
  delete(jobId: string): Promise<void>;
}

/**
 * Above this size, route to blob storage instead of the ExportJob row's
 * bytea column. Chosen well under Postgres's practical row-size comfort zone
 * and Vercel's serverless response-buffering limits — everything under this
 * (the CSV/XLSX/JSON exports, and any ID-card PDF small enough to be a
 * single part) keeps the original zero-config bytea path with identical
 * local/prod behavior. Above it, only a Blob-backed store can hold and
 * stream the result without loading the whole thing into one process's
 * memory twice (once to build it, once to serve it).
 */
const BLOB_THRESHOLD_BYTES = 8 * 1024 * 1024;

/**
 * Bytes live on the ExportJob row itself (Postgres bytea) for small exports,
 * and in Vercel Blob (see blobStore.ts, including its privacy tradeoff note)
 * for large ones — chosen by `artifact.data.byteLength` at `put()` time.
 * `get()`/`delete()` follow whichever the row actually used, read from
 * `blobKey` being set or not.
 */
export const dbArtifactStore: ArtifactStore = {
  async put(jobId, artifact) {
    const fileSize = artifact.data.byteLength;
    if (fileSize >= BLOB_THRESHOLD_BYTES) {
      const uploaded = await uploadBlob(jobId, artifact.data, artifact.mimeType);
      await prisma.exportJob.update({
        where: { id: jobId },
        data: {
          fileData: null,
          blobKey: uploaded.url,
          fileName: artifact.fileName,
          mimeType: artifact.mimeType,
          fileSize,
        },
      });
      return { fileSize };
    }
    await prisma.exportJob.update({
      where: { id: jobId },
      data: {
        fileData: artifact.data,
        blobKey: null,
        fileName: artifact.fileName,
        mimeType: artifact.mimeType,
        fileSize,
      },
    });
    return { fileSize };
  },

  async get(jobId) {
    const job = await prisma.exportJob.findUnique({
      where: { id: jobId },
      select: { fileData: true, blobKey: true, fileName: true, mimeType: true },
    });
    if (!job?.fileName || !job.mimeType) return null;
    if (job.blobKey) {
      const { fetchBlob } = await import("./blobStore");
      return { data: await fetchBlob(job.blobKey), fileName: job.fileName, mimeType: job.mimeType };
    }
    if (!job.fileData) return null;
    return { data: Buffer.from(job.fileData), fileName: job.fileName, mimeType: job.mimeType };
  },

  async delete(jobId) {
    const job = await prisma.exportJob.findUnique({ where: { id: jobId }, select: { blobKey: true } });
    if (job?.blobKey) await deleteBlob(job.blobKey);
    await prisma.exportJob.update({
      where: { id: jobId },
      data: { fileData: null, blobKey: null, fileSize: null },
    });
  },
};

export const artifactStore = dbArtifactStore;
