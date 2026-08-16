import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/authOptions";

const f = createUploadthing();

export const ourFileRouter = {
  documentUploader: f({
    image: { maxFileSize: "2MB", maxFileCount: 1 },
  })
    .middleware(async () => {
      const session = await getServerSession(authOptions);
      if (!session?.user) throw new UploadThingError("Unauthorized");
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return { url: file.ufsUrl, uploadedBy: metadata.userId };
    }),

  consentFormUploader: f({
    pdf: { maxFileSize: "8MB", maxFileCount: 1 },
  })
    .middleware(async () => {
      const session = await getServerSession(authOptions);
      if (!session?.user) throw new UploadThingError("Unauthorized");
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return { url: file.ufsUrl, uploadedBy: metadata.userId };
    }),

  campaignAttachmentUploader: f({
    pdf: { maxFileSize: "8MB", maxFileCount: 5 },
    image: { maxFileSize: "4MB", maxFileCount: 5 },
    blob: { maxFileSize: "8MB", maxFileCount: 5 },
  })
    .middleware(async () => {
      const session = await getServerSession(authOptions);
      if (!session?.user || !["SUPER_ADMIN", "OWNER", "ADMIN"].includes(session.user.role)) {
        throw new UploadThingError("Unauthorized");
      }
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return {
        url: file.ufsUrl,
        uploadedBy: metadata.userId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      };
    }),

  campResourceUploader: f({
    pdf: { maxFileSize: "16MB", maxFileCount: 5 },
    image: { maxFileSize: "8MB", maxFileCount: 5 },
    blob: { maxFileSize: "16MB", maxFileCount: 5 },
  })
    .middleware(async () => {
      const session = await getServerSession(authOptions);
      if (!session?.user || !["SUPER_ADMIN", "OWNER", "ADMIN"].includes(session.user.role)) {
        throw new UploadThingError("Unauthorized");
      }
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return {
        url: file.ufsUrl,
        uploadedBy: metadata.userId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
