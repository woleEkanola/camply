-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'OWNER', 'ADMIN', 'CAMPUS_REPRESENTATIVE', 'PARENT', 'TEACHER', 'VOLUNTEER');

-- CreateEnum
CREATE TYPE "PermissionType" AS ENUM ('CREATE_CAMPUS', 'READ_CAMPUS', 'UPDATE_CAMPUS', 'DELETE_CAMPUS', 'MANAGE_ADMINS', 'MANAGE_CAMPUS_REPS', 'VIEW_ANALYTICS');

-- CreateEnum
CREATE TYPE "ProfileFieldType" AS ENUM ('TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'CHECKBOX', 'SELECT', 'MULTI_SELECT', 'RADIO', 'FILE');

-- CreateEnum
CREATE TYPE "FormFieldAudience" AS ENUM ('CAMPER', 'TEACHER', 'VOLUNTEER');

-- CreateEnum
CREATE TYPE "FormFieldSource" AS ENUM ('SYSTEM', 'CUSTOM');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PENDING', 'REQUIRES_ACTION', 'APPROVED', 'REJECTED', 'WAITLISTED', 'CANCELLED', 'CHECKED_IN', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BedStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "StaffType" AS ENUM ('TEACHER', 'VOLUNTEER');

-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DEACTIVATED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "passwordSet" BOOLEAN NOT NULL DEFAULT false,
    "emailVerified" TIMESTAMP(3),
    "emailVerifyToken" TEXT,
    "photoUrl" TEXT,
    "role" "UserRole" NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "organizationId" TEXT,
    "homeCampusId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "activeCampId" TEXT,
    "settings" JSONB,
    "approvalWorkflow" TEXT NOT NULL DEFAULT 'SINGLE_STEP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campus" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "zipCode" TEXT,
    "country" TEXT NOT NULL,
    "pastor" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "signupOpen" BOOLEAN NOT NULL DEFAULT true,
    "campusCode" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "organizationId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "capacity" INTEGER,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "gpsLat" DOUBLE PRECISION,
    "gpsLng" DOUBLE PRECISION,
    "mapsUrl" TEXT,
    "notes" TEXT,
    "campId" TEXT NOT NULL,
    "code" TEXT,
    "quota" INTEGER NOT NULL DEFAULT 0,
    "signupOpen" BOOLEAN NOT NULL DEFAULT true,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "fullBehavior" TEXT NOT NULL DEFAULT 'CLOSE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "FormField" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "audience" "FormFieldAudience" NOT NULL,
    "source" "FormFieldSource" NOT NULL DEFAULT 'CUSTOM',
    "systemKey" TEXT,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "ProfileFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "options" TEXT,
    "helpText" TEXT,
    "placeholder" TEXT,
    "defaultValue" TEXT,
    "groupLabel" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "validation" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Camper" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "firstName" TEXT,
    "middleName" TEXT,
    "lastName" TEXT,
    "preferredName" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT,
    "photoUrl" TEXT,
    "allergies" TEXT,
    "medicalConditions" TEXT,
    "medications" TEXT,
    "dietaryRestrictions" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "relationship" TEXT,
    "parentPhone" TEXT,
    "teenPhone" TEXT,
    "homeAddressStreet" TEXT,
    "homeAddressCity" TEXT,
    "homeAddressState" TEXT,
    "homeAddressZip" TEXT,
    "school" TEXT,
    "currentClass" TEXT,
    "church" TEXT,
    "pastor" TEXT,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "homeCampusId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "dobApproved" BOOLEAN NOT NULL DEFAULT false,
    "birthCert" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Camper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileFieldValue" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "camperId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Camp" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" TEXT NOT NULL,
    "tribeAllocationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "tribeAllocationMode" TEXT NOT NULL DEFAULT 'MANUAL',
    "tribeAllocationRules" JSONB,
    "bedAllocationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "bedAllocationRules" JSONB,
    "theme" TEXT,
    "description" TEXT,
    "bannerUrl" TEXT,
    "logoUrl" TEXT,
    "registrationOpensAt" TIMESTAMP(3),
    "registrationClosesAt" TIMESTAMP(3),
    "arrivalDate" TIMESTAMP(3),
    "departureDate" TIMESTAMP(3),
    "minAge" INTEGER,
    "maxAge" INTEGER,
    "ageCutoffDate" TIMESTAMP(3),
    "maxRegistrations" INTEGER,
    "capacityBehavior" TEXT NOT NULL DEFAULT 'CLOSE',
    "approvalMode" TEXT NOT NULL DEFAULT 'MANUAL',
    "allowResubmission" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "orgCode" TEXT,
    "remindersHtml" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Camp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignupLink" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignupLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OTP" (
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OTP_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "Registration" (
    "id" TEXT NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "camperId" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "venueId" TEXT,
    "venueAssignedAt" TIMESTAMP(3),
    "parentConsent" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "registrationNumber" TEXT,
    "qrToken" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "correctionRequest" TEXT,
    "reviewerId" TEXT,
    "checkedInAt" TIMESTAMP(3),
    "checkedInById" TEXT,
    "checkedOutAt" TIMESTAMP(3),
    "internalNotes" JSONB,
    "communicationLog" JSONB,
    "fieldChangeLog" JSONB,
    "waitlistPosition" INTEGER,
    "tribeId" TEXT,
    "tribeAssignedAt" TIMESTAMP(3),
    "tribeAssignmentMethod" TEXT,
    "roomId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationReview" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "assignedToId" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "verifiedById" TEXT,
    "recommendation" TEXT,
    "reviewNotes" TEXT,
    "adminDecision" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentRequirement" (
    "id" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "acceptedFormats" TEXT NOT NULL DEFAULT 'jpg,png',
    "maxSizeMb" INTEGER NOT NULL DEFAULT 2,
    "scope" TEXT NOT NULL DEFAULT 'CAMPER',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT,
    "camperId" TEXT,
    "registrationId" TEXT,
    "url" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "rejectionReason" TEXT,
    "uploadedById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
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
CREATE TABLE "Tribe" (
    "id" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "color" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "logoUrl" TEXT,
    "bannerUrl" TEXT,
    "description" TEXT,
    "meaning" TEXT,
    "motto" TEXT,
    "scripture" TEXT,
    "gender" TEXT,
    "ageRange" TEXT,
    "allocationStrategy" TEXT NOT NULL DEFAULT 'MANUAL',
    "maxCapacity" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "points" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tribe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SideEffect" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT,
    "broadcastRecipientId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SideEffect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationCounter" (
    "id" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RegistrationCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffSignupLink" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "type" "StaffType" NOT NULL,
    "campId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffSignupLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffFieldValue" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "staffProfileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "type" "StaffType" NOT NULL,
    "status" "StaffStatus" NOT NULL DEFAULT 'PENDING',
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "preferredName" TEXT,
    "gender" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "photoUrl" TEXT,
    "church" TEXT,
    "churchDepartment" TEXT,
    "yearsServing" TEXT,
    "workerStatus" TEXT,
    "previousCampExperience" TEXT,
    "areasOfStrength" TEXT,
    "preferredAgeGroup" TEXT,
    "preferredCampusId" TEXT,
    "preferredTribeId" TEXT,
    "volunteerCategory" TEXT,
    "teams" TEXT[],
    "skills" TEXT[],
    "availability" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "emergencyContactRelationship" TEXT,
    "medicalConditions" TEXT,
    "allergies" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "reviewerId" TEXT,
    "deactivatedAt" TIMESTAMP(3),
    "assignedVenueId" TEXT,
    "assignedTribeId" TEXT,
    "departmentId" TEXT,
    "isDepartmentHead" BOOLEAN NOT NULL DEFAULT false,
    "isAssistantHead" BOOLEAN NOT NULL DEFAULT false,
    "isCampMonitor" BOOLEAN NOT NULL DEFAULT false,
    "isAssistantMonitor" BOOLEAN NOT NULL DEFAULT false,
    "reportsToId" TEXT,
    "reportsToUserId" TEXT,
    "assignedHostelId" TEXT,
    "assignedRoomId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherCamperAssignment" (
    "id" TEXT NOT NULL,
    "staffProfileId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherCamperAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceSession" (
    "id" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "venueId" TEXT,
    "tribeId" TEXT,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentReport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "registrationId" TEXT,
    "reportedById" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,

    CONSTRAINT "IncidentReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalVisit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "complaint" TEXT NOT NULL,
    "treatment" TEXT,
    "notes" TEXT,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicalVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealDistribution" (
    "id" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "meal" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "servedById" TEXT NOT NULL,
    "servedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealDistribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "responsibilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "maxCapacity" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hostel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hostel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "hostelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bed" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "BedStatus" NOT NULL DEFAULT 'AVAILABLE',
    "registrationId" TEXT,
    "staffProfileId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TribePointsLog" (
    "id" TEXT NOT NULL,
    "tribeId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TribePointsLog_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "departmentId" TEXT,
    "parentPositionId" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionAssignment" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PositionAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentAnnouncement" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentDocument" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentActivityLog" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DepartmentActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailEventConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "templateId" TEXT,
    "channels" JSONB NOT NULL DEFAULT '["EMAIL", "IN_APP"]',
    "recipients" JSONB NOT NULL DEFAULT '["PARENT"]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailEventConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "subject" TEXT NOT NULL,
    "previewText" TEXT,
    "content" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationBranding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#E67E22',
    "accentColor" TEXT NOT NULL DEFAULT '#E67E22',
    "buttonColor" TEXT NOT NULL DEFAULT '#E67E22',
    "headerImageUrl" TEXT,
    "senderName" TEXT,
    "footerText" TEXT,
    "supportEmail" TEXT,
    "supportPhone" TEXT,
    "websiteUrl" TEXT,
    "facebookUrl" TEXT,
    "instagramUrl" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationBranding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "audience" TEXT NOT NULL,
    "campId" TEXT,
    "campusId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastRecipient" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "sideEffectId" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BroadcastRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CampusReps" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CampusReps_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_name_key" ON "Organization"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Campus_slug_key" ON "Campus"("slug");

-- CreateIndex
CREATE INDEX "Campus_organizationId_name_idx" ON "Campus"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Campus_deletedAt_idx" ON "Campus"("deletedAt");

-- CreateIndex
CREATE INDEX "Venue_campId_name_idx" ON "Venue"("campId", "name");

-- CreateIndex
CREATE INDEX "Venue_deletedAt_idx" ON "Venue"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_userId_type_key" ON "Permission"("userId", "type");

-- CreateIndex
CREATE INDEX "FormField_organizationId_audience_name_idx" ON "FormField"("organizationId", "audience", "name");

-- CreateIndex
CREATE INDEX "FormField_organizationId_audience_sortOrder_idx" ON "FormField"("organizationId", "audience", "sortOrder");

-- CreateIndex
CREATE INDEX "FormField_deletedAt_idx" ON "FormField"("deletedAt");

-- CreateIndex
CREATE INDEX "Camper_deletedAt_idx" ON "Camper"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileFieldValue_fieldId_camperId_key" ON "ProfileFieldValue"("fieldId", "camperId");

-- CreateIndex
CREATE INDEX "Camp_organizationId_name_idx" ON "Camp"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Camp_organizationId_slug_idx" ON "Camp"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "Camp_deletedAt_idx" ON "Camp"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SignupLink_token_key" ON "SignupLink"("token");

-- CreateIndex
CREATE UNIQUE INDEX "SignupLink_campusId_campId_key" ON "SignupLink"("campusId", "campId");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_registrationNumber_key" ON "Registration"("registrationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_qrToken_key" ON "Registration"("qrToken");

-- CreateIndex
CREATE INDEX "Registration_camperId_campId_idx" ON "Registration"("camperId", "campId");

-- CreateIndex
CREATE INDEX "Registration_campusId_status_idx" ON "Registration"("campusId", "status");

-- CreateIndex
CREATE INDEX "Registration_venueId_status_idx" ON "Registration"("venueId", "status");

-- CreateIndex
CREATE INDEX "Registration_campId_status_idx" ON "Registration"("campId", "status");

-- CreateIndex
CREATE INDEX "Registration_deletedAt_idx" ON "Registration"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationReview_registrationId_key" ON "RegistrationReview"("registrationId");

-- CreateIndex
CREATE INDEX "DocumentRequirement_deletedAt_idx" ON "DocumentRequirement"("deletedAt");

-- CreateIndex
CREATE INDEX "Document_deletedAt_idx" ON "Document"("deletedAt");

-- CreateIndex
CREATE INDEX "AuditLog_registrationId_idx" ON "AuditLog"("registrationId");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Tribe_campId_name_idx" ON "Tribe"("campId", "name");

-- CreateIndex
CREATE INDEX "Tribe_campId_code_idx" ON "Tribe"("campId", "code");

-- CreateIndex
CREATE INDEX "Tribe_deletedAt_idx" ON "Tribe"("deletedAt");

-- CreateIndex
CREATE INDEX "SideEffect_status_runAfter_idx" ON "SideEffect"("status", "runAfter");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationCounter_campId_campusId_key" ON "RegistrationCounter"("campId", "campusId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffSignupLink_token_key" ON "StaffSignupLink"("token");

-- CreateIndex
CREATE UNIQUE INDEX "StaffSignupLink_campId_type_key" ON "StaffSignupLink"("campId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "StaffFieldValue_fieldId_staffProfileId_key" ON "StaffFieldValue"("fieldId", "staffProfileId");

-- CreateIndex
CREATE INDEX "StaffProfile_userId_campId_idx" ON "StaffProfile"("userId", "campId");

-- CreateIndex
CREATE INDEX "StaffProfile_organizationId_type_status_idx" ON "StaffProfile"("organizationId", "type", "status");

-- CreateIndex
CREATE INDEX "StaffProfile_deletedAt_idx" ON "StaffProfile"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherCamperAssignment_staffProfileId_registrationId_key" ON "TeacherCamperAssignment"("staffProfileId", "registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_sessionId_registrationId_key" ON "AttendanceRecord"("sessionId", "registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "MealDistribution_registrationId_meal_date_key" ON "MealDistribution"("registrationId", "meal", "date");

-- CreateIndex
CREATE INDEX "Department_organizationId_campId_name_idx" ON "Department"("organizationId", "campId", "name");

-- CreateIndex
CREATE INDEX "Department_deletedAt_idx" ON "Department"("deletedAt");

-- CreateIndex
CREATE INDEX "Hostel_venueId_name_idx" ON "Hostel"("venueId", "name");

-- CreateIndex
CREATE INDEX "Hostel_deletedAt_idx" ON "Hostel"("deletedAt");

-- CreateIndex
CREATE INDEX "Room_hostelId_name_idx" ON "Room"("hostelId", "name");

-- CreateIndex
CREATE INDEX "Room_deletedAt_idx" ON "Room"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Bed_registrationId_key" ON "Bed"("registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "Bed_staffProfileId_key" ON "Bed"("staffProfileId");

-- CreateIndex
CREATE INDEX "Bed_roomId_label_idx" ON "Bed"("roomId", "label");

-- CreateIndex
CREATE INDEX "Bed_deletedAt_idx" ON "Bed"("deletedAt");

-- CreateIndex
CREATE INDEX "RegistrationDeclaration_organizationId_sortOrder_idx" ON "RegistrationDeclaration"("organizationId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationConfig_organizationId_key" ON "RegistrationConfig"("organizationId");

-- CreateIndex
CREATE INDEX "Position_campId_idx" ON "Position"("campId");

-- CreateIndex
CREATE INDEX "Position_departmentId_idx" ON "Position"("departmentId");

-- CreateIndex
CREATE INDEX "Position_parentPositionId_idx" ON "Position"("parentPositionId");

-- CreateIndex
CREATE INDEX "Position_deletedAt_idx" ON "Position"("deletedAt");

-- CreateIndex
CREATE INDEX "PositionAssignment_positionId_idx" ON "PositionAssignment"("positionId");

-- CreateIndex
CREATE INDEX "PositionAssignment_staffId_idx" ON "PositionAssignment"("staffId");

-- CreateIndex
CREATE INDEX "PositionAssignment_isCurrent_idx" ON "PositionAssignment"("isCurrent");

-- CreateIndex
CREATE INDEX "DepartmentAnnouncement_departmentId_idx" ON "DepartmentAnnouncement"("departmentId");

-- CreateIndex
CREATE INDEX "DepartmentDocument_departmentId_idx" ON "DepartmentDocument"("departmentId");

-- CreateIndex
CREATE INDEX "DepartmentActivityLog_departmentId_idx" ON "DepartmentActivityLog"("departmentId");

-- CreateIndex
CREATE INDEX "EmailEventConfig_organizationId_idx" ON "EmailEventConfig"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailEventConfig_organizationId_event_key" ON "EmailEventConfig"("organizationId", "event");

-- CreateIndex
CREATE INDEX "EmailTemplate_deletedAt_idx" ON "EmailTemplate"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_organizationId_name_key" ON "EmailTemplate"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationBranding_organizationId_key" ON "OrganizationBranding"("organizationId");

-- CreateIndex
CREATE INDEX "Broadcast_organizationId_status_idx" ON "Broadcast"("organizationId", "status");

-- CreateIndex
CREATE INDEX "BroadcastRecipient_broadcastId_status_idx" ON "BroadcastRecipient"("broadcastId", "status");

-- CreateIndex
CREATE INDEX "_CampusReps_B_index" ON "_CampusReps"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_homeCampusId_fkey" FOREIGN KEY ("homeCampusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_activeCampId_fkey" FOREIGN KEY ("activeCampId") REFERENCES "Camp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campus" ADD CONSTRAINT "Campus_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormField" ADD CONSTRAINT "FormField_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Camper" ADD CONSTRAINT "Camper_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Camper" ADD CONSTRAINT "Camper_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Camper" ADD CONSTRAINT "Camper_homeCampusId_fkey" FOREIGN KEY ("homeCampusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileFieldValue" ADD CONSTRAINT "ProfileFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "FormField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileFieldValue" ADD CONSTRAINT "ProfileFieldValue_camperId_fkey" FOREIGN KEY ("camperId") REFERENCES "Camper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Camp" ADD CONSTRAINT "Camp_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignupLink" ADD CONSTRAINT "SignupLink_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignupLink" ADD CONSTRAINT "SignupLink_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_camperId_fkey" FOREIGN KEY ("camperId") REFERENCES "Camper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_tribeId_fkey" FOREIGN KEY ("tribeId") REFERENCES "Tribe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationReview" ADD CONSTRAINT "RegistrationReview_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRequirement" ADD CONSTRAINT "DocumentRequirement_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "DocumentRequirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_camperId_fkey" FOREIGN KEY ("camperId") REFERENCES "Camper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tribe" ADD CONSTRAINT "Tribe_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationCounter" ADD CONSTRAINT "RegistrationCounter_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationCounter" ADD CONSTRAINT "RegistrationCounter_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffSignupLink" ADD CONSTRAINT "StaffSignupLink_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffFieldValue" ADD CONSTRAINT "StaffFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "FormField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffFieldValue" ADD CONSTRAINT "StaffFieldValue_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_preferredCampusId_fkey" FOREIGN KEY ("preferredCampusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_preferredTribeId_fkey" FOREIGN KEY ("preferredTribeId") REFERENCES "Tribe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_assignedVenueId_fkey" FOREIGN KEY ("assignedVenueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_assignedTribeId_fkey" FOREIGN KEY ("assignedTribeId") REFERENCES "Tribe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_reportsToId_fkey" FOREIGN KEY ("reportsToId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_reportsToUserId_fkey" FOREIGN KEY ("reportsToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_assignedHostelId_fkey" FOREIGN KEY ("assignedHostelId") REFERENCES "Hostel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_assignedRoomId_fkey" FOREIGN KEY ("assignedRoomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherCamperAssignment" ADD CONSTRAINT "TeacherCamperAssignment_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherCamperAssignment" ADD CONSTRAINT "TeacherCamperAssignment_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_tribeId_fkey" FOREIGN KEY ("tribeId") REFERENCES "Tribe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AttendanceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentReport" ADD CONSTRAINT "IncidentReport_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentReport" ADD CONSTRAINT "IncidentReport_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalVisit" ADD CONSTRAINT "MedicalVisit_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalVisit" ADD CONSTRAINT "MedicalVisit_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealDistribution" ADD CONSTRAINT "MealDistribution_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealDistribution" ADD CONSTRAINT "MealDistribution_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hostel" ADD CONSTRAINT "Hostel_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_hostelId_fkey" FOREIGN KEY ("hostelId") REFERENCES "Hostel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TribePointsLog" ADD CONSTRAINT "TribePointsLog_tribeId_fkey" FOREIGN KEY ("tribeId") REFERENCES "Tribe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationDeclaration" ADD CONSTRAINT "RegistrationDeclaration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrationConfig" ADD CONSTRAINT "RegistrationConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_parentPositionId_fkey" FOREIGN KEY ("parentPositionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionAssignment" ADD CONSTRAINT "PositionAssignment_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionAssignment" ADD CONSTRAINT "PositionAssignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentAnnouncement" ADD CONSTRAINT "DepartmentAnnouncement_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentDocument" ADD CONSTRAINT "DepartmentDocument_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentActivityLog" ADD CONSTRAINT "DepartmentActivityLog_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailEventConfig" ADD CONSTRAINT "EmailEventConfig_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmailTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationBranding" ADD CONSTRAINT "OrganizationBranding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastRecipient" ADD CONSTRAINT "BroadcastRecipient_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CampusReps" ADD CONSTRAINT "_CampusReps_A_fkey" FOREIGN KEY ("A") REFERENCES "Campus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CampusReps" ADD CONSTRAINT "_CampusReps_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
