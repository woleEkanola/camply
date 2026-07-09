-- CreateTable
CREATE TABLE "SideEffect" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SideEffect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SideEffect_status_runAfter_idx" ON "SideEffect"("status", "runAfter");

