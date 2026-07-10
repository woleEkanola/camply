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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FormField_organizationId_audience_name_key" ON "FormField"("organizationId", "audience", "name");

-- CreateIndex
CREATE INDEX "FormField_organizationId_audience_sortOrder_idx" ON "FormField"("organizationId", "audience", "sortOrder");

-- AddForeignKey
ALTER TABLE "FormField" ADD CONSTRAINT "FormField_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DataMigration: move existing ProfileField rows (camper custom fields), preserving IDs so
-- dependent ProfileFieldValue rows need no data rewrite, only their FK retargeted below.
-- sortOrder is recomputed from createdAt order since the old column was never meaningfully set.
INSERT INTO "FormField" (
    "id", "organizationId", "audience", "source", "systemKey", "name", "label", "type",
    "required", "visible", "options", "helpText", "placeholder", "defaultValue", "groupLabel",
    "sortOrder", "validation", "createdAt", "updatedAt"
)
SELECT
    "id",
    "organizationId",
    'CAMPER'::"FormFieldAudience",
    'CUSTOM'::"FormFieldSource",
    NULL,
    "name",
    "label",
    "type",
    "required",
    true,
    "options",
    "helpText",
    "placeholder",
    "defaultValue",
    NULL,
    (ROW_NUMBER() OVER (PARTITION BY "organizationId" ORDER BY "createdAt" ASC)) * 10,
    "validation",
    "createdAt",
    "updatedAt"
FROM "ProfileField";

-- DataMigration: move existing StaffField rows (teacher/volunteer custom fields), same
-- ID-preserving approach. StaffType's TEACHER/VOLUNTEER values match FormFieldAudience's,
-- cast via text since the enum types themselves differ.
INSERT INTO "FormField" (
    "id", "organizationId", "audience", "source", "systemKey", "name", "label", "type",
    "required", "visible", "options", "helpText", "placeholder", "defaultValue", "groupLabel",
    "sortOrder", "validation", "createdAt", "updatedAt"
)
SELECT
    "id",
    "organizationId",
    ("audience"::text)::"FormFieldAudience",
    'CUSTOM'::"FormFieldSource",
    NULL,
    "name",
    "label",
    "type",
    "required",
    true,
    "options",
    NULL,
    NULL,
    NULL,
    NULL,
    (ROW_NUMBER() OVER (PARTITION BY "organizationId", "audience" ORDER BY "createdAt" ASC)) * 10,
    NULL,
    "createdAt",
    "updatedAt"
FROM "StaffField";

-- Retarget ProfileFieldValue.fieldId from ProfileField to FormField (IDs preserved above, no
-- data rewrite needed on ProfileFieldValue itself, only the constraint's target table).
ALTER TABLE "ProfileFieldValue" DROP CONSTRAINT "ProfileFieldValue_fieldId_fkey";
ALTER TABLE "ProfileFieldValue" ADD CONSTRAINT "ProfileFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "FormField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Retarget StaffFieldValue.fieldId from StaffField to FormField, same reasoning.
ALTER TABLE "StaffFieldValue" DROP CONSTRAINT "StaffFieldValue_fieldId_fkey";
ALTER TABLE "StaffFieldValue" ADD CONSTRAINT "StaffFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "FormField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropTable
DROP TABLE "ProfileField";

-- DropTable
DROP TABLE "StaffField";
