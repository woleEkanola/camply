-- CreateTable
CREATE TABLE "RegistrationDeclaration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "consentFormTitle" TEXT,
    "consentFormDescription" TEXT,
    "consentFormSampleUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegistrationDeclaration_organizationId_sortOrder_idx" ON "RegistrationDeclaration"("organizationId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationConfig_organizationId_key" ON "RegistrationConfig"("organizationId");

-- AddForeignKey
ALTER TABLE "RegistrationDeclaration" ADD CONSTRAINT "RegistrationDeclaration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationConfig" ADD CONSTRAINT "RegistrationConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
