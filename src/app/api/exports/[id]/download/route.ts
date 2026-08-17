import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/authOptions";
import { prisma } from "@/server/db";
import { streamBlob } from "@/server/export/blobStore";
import { getPartRefs } from "@/server/export/partStore";

export const maxDuration = 300;

const ORG_ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN"];

/**
 * Streams a completed export's bytes. Requires the caller to be the job's
 * owner or an org admin in the same org — export artifacts (including
 * medical summaries) never acquire a public URL, unlike the UploadThing CDN
 * links used for photos/documents elsewhere in the app. Blob-backed
 * artifacts (large exports — see artifactStore.ts's size threshold) are the
 * one exception to "never a public URL": see blobStore.ts's privacy note.
 * This route is the only place that URL is ever read; it is never sent to
 * the client.
 *
 * `?part=N` (1-based) selects one part of a job whose export outgrew a
 * single file (see engine.ts's finalizeResumableJob — a job with exactly one
 * staged part is promoted to a plain single-file artifact, so `?part=` is
 * only relevant for a genuinely large export). Omitted, this serves the
 * job's main artifact, exactly as before this route supported multi-part
 * jobs at all.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const job = await prisma.exportJob.findUnique({ where: { id } });
  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isOwner = job.userId === user.id;
  const isOrgAdmin = ORG_ADMIN_ROLES.includes(user.role) && job.organizationId === user.organizationId;
  if (!isOwner && !isOrgAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (job.expiresAt < new Date()) {
    return NextResponse.json({ error: "This export has expired" }, { status: 410 });
  }

  if (job.status !== "DONE") {
    return NextResponse.json({ error: "Export is not ready" }, { status: 409 });
  }

  const partParam = req.nextUrl.searchParams.get("part");
  if (partParam !== null) {
    const parts = getPartRefs(job);
    const partNumber = Number(partParam);
    const part = parts.find((p) => p.partNumber === partNumber);
    if (!part) {
      return NextResponse.json({ error: "Part not found" }, { status: 404 });
    }
    const { body, contentLength } = await streamBlob(part.blobKey);
    const dotIndex = part.fileName.lastIndexOf(".");
    const base = dotIndex === -1 ? part.fileName : part.fileName.slice(0, dotIndex);
    const ext = dotIndex === -1 ? "" : part.fileName.slice(dotIndex);
    const downloadName = `${base}-part-${part.partNumber}-of-${parts.length}${ext}`;
    return new NextResponse(body, {
      headers: {
        "Content-Type": part.mimeType,
        "Content-Disposition": `attachment; filename="${downloadName.replace(/"/g, "")}"`,
        ...(contentLength !== null ? { "Content-Length": String(contentLength) } : {}),
      },
    });
  }

  const parts = getPartRefs(job);
  if (parts.length > 1) {
    return NextResponse.json(
      { error: "This export has multiple parts", parts: parts.map((p) => ({ partNumber: p.partNumber, cardCount: p.cardCount, size: p.size })) },
      { status: 409 }
    );
  }

  if (!job.fileName || !job.mimeType) {
    return NextResponse.json({ error: "Export is not ready" }, { status: 409 });
  }

  if (job.blobKey) {
    const { body, contentLength } = await streamBlob(job.blobKey);
    return new NextResponse(body, {
      headers: {
        "Content-Type": job.mimeType,
        "Content-Disposition": `attachment; filename="${job.fileName.replace(/"/g, "")}"`,
        ...(contentLength !== null ? { "Content-Length": String(contentLength) } : {}),
      },
    });
  }

  if (!job.fileData) {
    return NextResponse.json({ error: "Export is not ready" }, { status: 409 });
  }

  return new NextResponse(new Uint8Array(job.fileData), {
    headers: {
      "Content-Type": job.mimeType,
      "Content-Disposition": `attachment; filename="${job.fileName.replace(/"/g, "")}"`,
      "Content-Length": String(job.fileData.length),
    },
  });
}
