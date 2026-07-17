-- CreateTable
CREATE TABLE "DocumentAction" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUIRES_ACTION',
    "reason" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionType" TEXT,
    "replacementForId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentAction_documentId_idx" ON "DocumentAction"("documentId");

-- CreateIndex
CREATE INDEX "DocumentAction_status_idx" ON "DocumentAction"("status");

-- CreateIndex
CREATE INDEX "DocumentAction_createdAt_idx" ON "DocumentAction"("createdAt");

-- AddForeignKey
ALTER TABLE "DocumentAction" ADD CONSTRAINT "DocumentAction_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
