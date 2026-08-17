-- AlterTable
ALTER TABLE "ExportJob" ADD COLUMN     "blobKey" TEXT,
ADD COLUMN     "partRefs" JSONB,
ADD COLUMN     "resumeIndex" INTEGER;

