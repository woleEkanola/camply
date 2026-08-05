import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/authOptions";
import { prisma } from "@/server/db";

const ORG_ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN"];

/**
 * Streams a completed export's bytes. Requires the caller to be the job's
 * owner or an org admin in the same org — export artifacts (including
 * medical summaries) never acquire a public URL, unlike the UploadThing CDN
 * links used for photos/documents elsewhere in the app.
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

  if (job.status !== "DONE" || !job.fileData || !job.fileName || !job.mimeType) {
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
