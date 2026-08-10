-- CreateEnum
CREATE TYPE "WorkflowStageType" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "WorkflowInstanceStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StageInstanceStatus" AS ENUM ('WAITING', 'IN_PROGRESS', 'DONE', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "WorkflowVariableDataType" AS ENUM ('TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'SELECT');

-- CreateEnum
CREATE TYPE "WorkflowPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "WorkflowEventType" AS ENUM ('INSTANCE_STARTED', 'STAGE_STARTED', 'STAGE_COMPLETED', 'STAGE_SKIPPED', 'STAGE_FAILED', 'INSTANCE_COMPLETED', 'INSTANCE_CANCELLED');

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "stageInstanceId" UUID;

-- AlterTable
ALTER TABLE "StaffProfile" ADD COLUMN     "departmentId" UUID;

-- CreateTable
CREATE TABLE "Department" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDepartmentAccess" (
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDepartmentAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowTemplate" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "previousVersionId" UUID,
    "publishedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStage" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "stageType" "WorkflowStageType" NOT NULL DEFAULT 'INTERNAL',
    "departmentId" UUID,
    "defaultAssignedEmployeeId" UUID,
    "estimatedDurationMinutes" INTEGER,
    "requiresFiles" BOOLEAN NOT NULL DEFAULT false,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "requiresCostEntry" BOOLEAN NOT NULL DEFAULT false,
    "requiresTimeTracking" BOOLEAN NOT NULL DEFAULT false,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "canSkip" BOOLEAN NOT NULL DEFAULT false,
    "nextStageId" UUID,
    "failureStageId" UUID,
    "internalVisible" BOOLEAN NOT NULL DEFAULT true,
    "customerVisible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStageVariable" (
    "id" UUID NOT NULL,
    "stageId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dataType" "WorkflowVariableDataType" NOT NULL DEFAULT 'TEXT',
    "selectOptions" JSONB,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowStageVariable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowInstance" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "workOrderId" UUID,
    "status" "WorkflowInstanceStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "currentStageId" UUID,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageInstance" (
    "id" UUID NOT NULL,
    "workflowInstanceId" UUID NOT NULL,
    "stageId" UUID NOT NULL,
    "departmentId" UUID,
    "status" "StageInstanceStatus" NOT NULL DEFAULT 'WAITING',
    "assignedEmployeeId" UUID,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "estimatedDurationMinutes" INTEGER,
    "actualDurationMinutes" INTEGER,
    "waitingReason" TEXT,
    "blockingReason" TEXT,
    "notes" TEXT,
    "priority" "WorkflowPriority" NOT NULL DEFAULT 'NORMAL',
    "dueDate" TIMESTAMP(3),
    "variableValues" JSONB,
    "assignedSupplierId" UUID,
    "sentDate" TIMESTAMP(3),
    "expectedReturnDate" TIMESTAMP(3),
    "actualReturnDate" TIMESTAMP(3),
    "externalCost" DECIMAL(12,2),
    "supplierStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StageInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowEvent" (
    "id" UUID NOT NULL,
    "workflowInstanceId" UUID NOT NULL,
    "stageInstanceId" UUID,
    "eventType" "WorkflowEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "performedById" UUID,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE INDEX "Department_isDeleted_idx" ON "Department"("isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "UserDepartmentAccess_staffId_departmentId_key" ON "UserDepartmentAccess"("staffId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTemplate_previousVersionId_key" ON "WorkflowTemplate"("previousVersionId");

-- CreateIndex
CREATE INDEX "WorkflowTemplate_isDeleted_idx" ON "WorkflowTemplate"("isDeleted");

-- CreateIndex
CREATE INDEX "WorkflowTemplate_code_publishedAt_idx" ON "WorkflowTemplate"("code", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTemplate_code_version_key" ON "WorkflowTemplate"("code", "version");

-- CreateIndex
CREATE INDEX "WorkflowStage_templateId_idx" ON "WorkflowStage"("templateId");

-- CreateIndex
CREATE INDEX "WorkflowStage_departmentId_idx" ON "WorkflowStage"("departmentId");

-- CreateIndex
CREATE INDEX "WorkflowStageVariable_stageId_idx" ON "WorkflowStageVariable"("stageId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStageVariable_stageId_key_key" ON "WorkflowStageVariable"("stageId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowInstance_workOrderId_key" ON "WorkflowInstance"("workOrderId");

-- CreateIndex
CREATE INDEX "WorkflowInstance_templateId_idx" ON "WorkflowInstance"("templateId");

-- CreateIndex
CREATE INDEX "WorkflowInstance_status_idx" ON "WorkflowInstance"("status");

-- CreateIndex
CREATE INDEX "WorkflowInstance_isDeleted_idx" ON "WorkflowInstance"("isDeleted");

-- CreateIndex
CREATE INDEX "StageInstance_workflowInstanceId_idx" ON "StageInstance"("workflowInstanceId");

-- CreateIndex
CREATE INDEX "StageInstance_stageId_idx" ON "StageInstance"("stageId");

-- CreateIndex
CREATE INDEX "StageInstance_departmentId_status_idx" ON "StageInstance"("departmentId", "status");

-- CreateIndex
CREATE INDEX "StageInstance_assignedEmployeeId_idx" ON "StageInstance"("assignedEmployeeId");

-- CreateIndex
CREATE INDEX "StageInstance_assignedSupplierId_idx" ON "StageInstance"("assignedSupplierId");

-- CreateIndex
CREATE INDEX "WorkflowEvent_workflowInstanceId_occurredAt_idx" ON "WorkflowEvent"("workflowInstanceId", "occurredAt");

-- CreateIndex
CREATE INDEX "WorkflowEvent_stageInstanceId_idx" ON "WorkflowEvent"("stageInstanceId");

-- CreateIndex
CREATE INDEX "StaffProfile_departmentId_idx" ON "StaffProfile"("departmentId");

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDepartmentAccess" ADD CONSTRAINT "UserDepartmentAccess_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDepartmentAccess" ADD CONSTRAINT "UserDepartmentAccess_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTemplate" ADD CONSTRAINT "WorkflowTemplate_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "WorkflowTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStage" ADD CONSTRAINT "WorkflowStage_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkflowTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStage" ADD CONSTRAINT "WorkflowStage_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStage" ADD CONSTRAINT "WorkflowStage_nextStageId_fkey" FOREIGN KEY ("nextStageId") REFERENCES "WorkflowStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStage" ADD CONSTRAINT "WorkflowStage_failureStageId_fkey" FOREIGN KEY ("failureStageId") REFERENCES "WorkflowStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStageVariable" ADD CONSTRAINT "WorkflowStageVariable_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "WorkflowStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkflowTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_currentStageId_fkey" FOREIGN KEY ("currentStageId") REFERENCES "WorkflowStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageInstance" ADD CONSTRAINT "StageInstance_workflowInstanceId_fkey" FOREIGN KEY ("workflowInstanceId") REFERENCES "WorkflowInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageInstance" ADD CONSTRAINT "StageInstance_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "WorkflowStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageInstance" ADD CONSTRAINT "StageInstance_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageInstance" ADD CONSTRAINT "StageInstance_assignedEmployeeId_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageInstance" ADD CONSTRAINT "StageInstance_assignedSupplierId_fkey" FOREIGN KEY ("assignedSupplierId") REFERENCES "BusinessPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowEvent" ADD CONSTRAINT "WorkflowEvent_workflowInstanceId_fkey" FOREIGN KEY ("workflowInstanceId") REFERENCES "WorkflowInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowEvent" ADD CONSTRAINT "WorkflowEvent_stageInstanceId_fkey" FOREIGN KEY ("stageInstanceId") REFERENCES "StageInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowEvent" ADD CONSTRAINT "WorkflowEvent_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_stageInstanceId_fkey" FOREIGN KEY ("stageInstanceId") REFERENCES "StageInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row Level Security (ADR 0029/0030, VISION.md's Database Security "MUST
-- enable RLS" rule, MASTER_PROMPT.md's Database Checklist) -- every new
-- table this milestone adds is backend-only; same explicit deny policy as
-- every other application table, applied in the same migration that
-- creates them, not a follow-up.

ALTER TABLE "Department" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "Department" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "UserDepartmentAccess" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "UserDepartmentAccess" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "WorkflowTemplate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "WorkflowTemplate" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "WorkflowStage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "WorkflowStage" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "WorkflowStageVariable" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "WorkflowStageVariable" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "WorkflowInstance" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "WorkflowInstance" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "StageInstance" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "StageInstance" FOR ALL TO anon, authenticated USING (false);

ALTER TABLE "WorkflowEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backend_only_deny_direct_access" ON "WorkflowEvent" FOR ALL TO anon, authenticated USING (false);
