import { prisma } from "../db";

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
 * Bytes live on the ExportJob row itself (Postgres bytea) rather than an
 * object store. Exports here are single-digit MB, well within bytea comfort,
 * and this needs no new env var and behaves identically local vs prod —
 * unlike @vercel/blob, which isn't actually wired up anywhere in this repo
 * and would need BLOB_READ_WRITE_TOKEN provisioned both places, plus a proxy
 * to avoid its public-by-URL default (wrong for medical exports).
 *
 * Swap this module for a Blob/S3-backed implementation later without
 * touching engine.ts — every caller only depends on the ArtifactStore shape.
 */
export const dbArtifactStore: ArtifactStore = {
  async put(jobId, artifact) {
    const fileSize = artifact.data.byteLength;
    await prisma.exportJob.update({
      where: { id: jobId },
      data: {
        fileData: artifact.data,
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
      select: { fileData: true, fileName: true, mimeType: true },
    });
    if (!job?.fileData || !job.fileName || !job.mimeType) return null;
    return { data: Buffer.from(job.fileData), fileName: job.fileName, mimeType: job.mimeType };
  },

  async delete(jobId) {
    await prisma.exportJob.update({
      where: { id: jobId },
      data: { fileData: null, fileSize: null },
    });
  },
};

export const artifactStore = dbArtifactStore;
