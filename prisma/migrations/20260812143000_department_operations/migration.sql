-- CreateEnum
CREATE TYPE "DepartmentRoleKind" AS ENUM ('HEAD', 'ASSISTANT_HEAD', 'LEAD', 'MEMBER');

-- CreateEnum
CREATE TYPE "ChecklistRoutine" AS ENUM ('BEFORE_CAMP', 'DAILY', 'SPECIFIC_DAY', 'BEFORE_PROGRAMME', 'DURING_PROGRAMME', 'AFTER_PROGRAMME', 'BEFORE_MEAL', 'DURING_MEAL', 'AFTER_MEAL', 'END_OF_DAY', 'ARRIVAL', 'AFTER_CHECKOUT', 'AFTER_CAMP', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "ChecklistAssignmentType" AS ENUM ('EVERYONE', 'ROLE', 'PERSON');

-- CreateEnum
CREATE TYPE "ChecklistExecutionStatus" AS ENUM ('PENDING', 'COMPLETED', 'SKIPPED', 'OVERDUE');

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "allowMembersAddChecklistItems" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "allowMembersDeactivateChecklistItems" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "allowMembersEditChecklistItems" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "authority" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "displayOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "enableDeadlineReminders" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "enableProgrammeTriggeredTasks" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "enableRoutineChecklists" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "parentDepartmentId" TEXT,
ADD COLUMN     "purpose" TEXT,
ADD COLUMN     "successMeasures" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "workingRelationships" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Position" ADD COLUMN     "authority" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "purpose" TEXT,
ADD COLUMN     "responsibilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "roleKind" "DepartmentRoleKind" NOT NULL DEFAULT 'MEMBER',
ADD COLUMN     "successMeasures" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "PositionAssignment" ADD COLUMN     "reason" TEXT;

-- CreateTable
CREATE TABLE "DepartmentChecklistItem" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "routine" "ChecklistRoutine" NOT NULL DEFAULT 'ONE_TIME',
    "sourceGroup" TEXT,
    "contextLabel" TEXT,
    "assignmentType" "ChecklistAssignmentType" NOT NULL DEFAULT 'EVERYONE',
    "positionId" TEXT,
    "assignedStaffId" TEXT,
    "dueTime" TEXT,
    "specificDate" DATE,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentChecklistExecution" (
    "id" TEXT NOT NULL,
    "executionKey" TEXT NOT NULL,
    "checklistItemId" TEXT,
    "departmentId" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "contextType" TEXT,
    "contextId" TEXT,
    "contextName" TEXT,
    "contextStartsAt" TIMESTAMP(3),
    "taskTitle" TEXT NOT NULL,
    "taskDescription" TEXT,
    "routine" "ChecklistRoutine" NOT NULL,
    "sourceGroup" TEXT,
    "assignmentType" "ChecklistAssignmentType" NOT NULL,
    "positionId" TEXT,
    "roleNameSnapshot" TEXT,
    "assignedStaffId" TEXT,
    "assignedNameSnapshot" TEXT,
    "dueAt" TIMESTAMP(3),
    "required" BOOLEAN NOT NULL DEFAULT true,
    "definitionVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "ChecklistExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "skippedById" TEXT,
    "skippedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentChecklistExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepartmentReport" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "completedWork" TEXT NOT NULL,
    "outstandingWork" TEXT,
    "issues" TEXT,
    "escalations" TEXT,
    "notes" TEXT,
    "submittedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DepartmentChecklistItem_departmentId_active_routine_idx" ON "DepartmentChecklistItem"("departmentId", "active", "routine");

-- CreateIndex
CREATE INDEX "DepartmentChecklistItem_positionId_idx" ON "DepartmentChecklistItem"("positionId");

-- CreateIndex
CREATE INDEX "DepartmentChecklistItem_assignedStaffId_idx" ON "DepartmentChecklistItem"("assignedStaffId");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentChecklistExecution_executionKey_key" ON "DepartmentChecklistExecution"("executionKey");

-- CreateIndex
CREATE INDEX "DepartmentChecklistExecution_departmentId_date_status_idx" ON "DepartmentChecklistExecution"("departmentId", "date", "status");

-- CreateIndex
CREATE INDEX "DepartmentChecklistExecution_campId_date_status_idx" ON "DepartmentChecklistExecution"("campId", "date", "status");

-- CreateIndex
CREATE INDEX "DepartmentChecklistExecution_assignedStaffId_date_status_idx" ON "DepartmentChecklistExecution"("assignedStaffId", "date", "status");

-- CreateIndex
CREATE INDEX "DepartmentChecklistExecution_positionId_date_status_idx" ON "DepartmentChecklistExecution"("positionId", "date", "status");

-- CreateIndex
CREATE INDEX "DepartmentChecklistExecution_contextId_idx" ON "DepartmentChecklistExecution"("contextId");

-- CreateIndex
CREATE INDEX "DepartmentReport_campId_date_idx" ON "DepartmentReport"("campId", "date");

-- CreateIndex
CREATE INDEX "DepartmentReport_departmentId_date_idx" ON "DepartmentReport"("departmentId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentReport_departmentId_date_submittedById_key" ON "DepartmentReport"("departmentId", "date", "submittedById");

-- CreateIndex
CREATE INDEX "Department_parentDepartmentId_displayOrder_idx" ON "Department"("parentDepartmentId", "displayOrder");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_parentDepartmentId_fkey" FOREIGN KEY ("parentDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentChecklistItem" ADD CONSTRAINT "DepartmentChecklistItem_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentChecklistItem" ADD CONSTRAINT "DepartmentChecklistItem_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentChecklistItem" ADD CONSTRAINT "DepartmentChecklistItem_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentChecklistExecution" ADD CONSTRAINT "DepartmentChecklistExecution_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "DepartmentChecklistItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentChecklistExecution" ADD CONSTRAINT "DepartmentChecklistExecution_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentChecklistExecution" ADD CONSTRAINT "DepartmentChecklistExecution_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentChecklistExecution" ADD CONSTRAINT "DepartmentChecklistExecution_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentChecklistExecution" ADD CONSTRAINT "DepartmentChecklistExecution_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentReport" ADD CONSTRAINT "DepartmentReport_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentReport" ADD CONSTRAINT "DepartmentReport_campId_fkey" FOREIGN KEY ("campId") REFERENCES "Camp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
