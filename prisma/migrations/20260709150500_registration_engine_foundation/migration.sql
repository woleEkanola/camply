-- AlterTable
ALTER TABLE "CamperProfile" ADD COLUMN     "allergies" TEXT,
ADD COLUMN     "church" TEXT,
ADD COLUMN     "currentClass" TEXT,
ADD COLUMN     "dietaryRestrictions" TEXT,
ADD COLUMN     "emergencyContactName" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "medicalConditions" TEXT,
ADD COLUMN     "medications" TEXT,
ADD COLUMN     "middleName" TEXT,
ADD COLUMN     "pastor" TEXT,
ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "preferredName" TEXT,
ADD COLUMN     "relationship" TEXT,
ADD COLUMN     "school" TEXT;

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "code" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "fullBehavior" TEXT NOT NULL DEFAULT 'CLOSE',
ADD COLUMN     "mapsUrl" TEXT,
ADD COLUMN     "visible" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ProfileField" ADD COLUMN     "defaultValue" TEXT,
ADD COLUMN     "helpText" TEXT,
ADD COLUMN     "placeholder" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "validation" JSONB;

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "checkedInAt" TIMESTAMP(3),
ADD COLUMN     "checkedInById" TEXT,
ADD COLUMN     "checkedOutAt" TIMESTAMP(3),
ADD COLUMN     "correctionRequest" TEXT,
ADD COLUMN     "internalNotes" JSONB,
ADD COLUMN     "qrToken" TEXT,
ADD COLUMN     "registrationNumber" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "reviewerId" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "waitlistPosition" INTEGER,
ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "Year" ADD COLUMN     "ageCutoffDate" TIMESTAMP(3),
ADD COLUMN     "allowResubmission" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "approvalMode" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "arrivalDate" TIMESTAMP(3),
ADD COLUMN     "bannerUrl" TEXT,
ADD COLUMN     "capacityBehavior" TEXT NOT NULL DEFAULT 'CLOSE',
ADD COLUMN     "departureDate" TIMESTAMP(3),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "maxAge" INTEGER,
ADD COLUMN     "maxRegistrations" INTEGER,
ADD COLUMN     "minAge" INTEGER,
ADD COLUMN     "orgCode" TEXT,
ADD COLUMN     "registrationClosesAt" TIMESTAMP(3),
ADD COLUMN     "registrationOpensAt" TIMESTAMP(3),
ADD COLUMN     "remindersHtml" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "theme" TEXT;

-- CreateTable
CREATE TABLE "DocumentRequirement" (
    "id" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "acceptedFormats" TEXT NOT NULL DEFAULT 'pdf,jpg,png,webp',
    "maxSizeMb" INTEGER NOT NULL DEFAULT 10,
    "scope" TEXT NOT NULL DEFAULT 'CAMPER',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT,
    "camperProfileId" TEXT,
    "registrationId" TEXT,
    "url" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "rejectionReason" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "registrationId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "registrationId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'IN_APP',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationCounter" (
    "id" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RegistrationCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_registrationId_idx" ON "AuditLog"("registrationId");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationCounter_yearId_locationId_key" ON "RegistrationCounter"("yearId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_registrationNumber_key" ON "Registration"("registrationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_qrToken_key" ON "Registration"("qrToken");

-- CreateIndex
CREATE INDEX "Registration_locationId_status_idx" ON "Registration"("locationId", "status");

-- CreateIndex
CREATE INDEX "Registration_yearId_status_idx" ON "Registration"("yearId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_camperProfileId_yearId_key" ON "Registration"("camperProfileId", "yearId");

-- AddForeignKey
ALTER TABLE "DocumentRequirement" ADD CONSTRAINT "DocumentRequirement_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "Year"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "DocumentRequirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_camperProfileId_fkey" FOREIGN KEY ("camperProfileId") REFERENCES "CamperProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationCounter" ADD CONSTRAINT "RegistrationCounter_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "Year"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationCounter" ADD CONSTRAINT "RegistrationCounter_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

