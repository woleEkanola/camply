-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'OWNER', 'ADMIN', 'LOCATION_ADMIN');

-- CreateEnum
CREATE TYPE "PermissionType" AS ENUM ('CREATE_LOCATION', 'READ_LOCATION', 'UPDATE_LOCATION', 'DELETE_LOCATION', 'MANAGE_ADMINS', 'MANAGE_LOCATION_ADMINS', 'VIEW_ANALYTICS');

-- CreateEnum
CREATE TYPE "ProfileFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT', 'MULTI_SELECT', 'FILE');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WAITLISTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "activeYearId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "zipCode" TEXT,
    "country" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "type" "PermissionType" NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileField" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "ProfileFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CamperProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "locationId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CamperProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileFieldValue" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "camperProfileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Year" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Year_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignupLink" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignupLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Registration" (
    "id" TEXT NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "camperProfileId" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_LocationAdmins" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_LocationAdmins_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_name_key" ON "Organization"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Location_organizationId_name_key" ON "Location"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_userId_type_key" ON "Permission"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileField_organizationId_name_key" ON "ProfileField"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileFieldValue_fieldId_camperProfileId_key" ON "ProfileFieldValue"("fieldId", "camperProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "Year_organizationId_name_key" ON "Year"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "SignupLink_token_key" ON "SignupLink"("token");

-- CreateIndex
CREATE UNIQUE INDEX "SignupLink_locationId_yearId_key" ON "SignupLink"("locationId", "yearId");

-- CreateIndex
CREATE INDEX "_LocationAdmins_B_index" ON "_LocationAdmins"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_activeYearId_fkey" FOREIGN KEY ("activeYearId") REFERENCES "Year"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileField" ADD CONSTRAINT "ProfileField_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CamperProfile" ADD CONSTRAINT "CamperProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CamperProfile" ADD CONSTRAINT "CamperProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CamperProfile" ADD CONSTRAINT "CamperProfile_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileFieldValue" ADD CONSTRAINT "ProfileFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "ProfileField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileFieldValue" ADD CONSTRAINT "ProfileFieldValue_camperProfileId_fkey" FOREIGN KEY ("camperProfileId") REFERENCES "CamperProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Year" ADD CONSTRAINT "Year_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignupLink" ADD CONSTRAINT "SignupLink_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignupLink" ADD CONSTRAINT "SignupLink_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "Year"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_camperProfileId_fkey" FOREIGN KEY ("camperProfileId") REFERENCES "CamperProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "Year"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LocationAdmins" ADD CONSTRAINT "_LocationAdmins_A_fkey" FOREIGN KEY ("A") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LocationAdmins" ADD CONSTRAINT "_LocationAdmins_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
