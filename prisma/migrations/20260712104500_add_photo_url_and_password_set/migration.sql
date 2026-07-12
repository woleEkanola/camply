-- AlterTable
ALTER TABLE "User" ADD COLUMN "passwordSet" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "photoUrl" TEXT;
