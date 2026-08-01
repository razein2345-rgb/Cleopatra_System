-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'LOGIN';
ALTER TYPE "AuditAction" ADD VALUE 'LOGOUT';
ALTER TYPE "AuditAction" ADD VALUE 'PASSWORD_RESET';

-- AlterTable
ALTER TABLE "StaffProfile" DROP COLUMN "role",
ADD COLUMN     "email" TEXT NOT NULL,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "phone" TEXT;

-- DropEnum
DROP TYPE "StaffRole";

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBranchAccess" (
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBranchAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE INDEX "Role_isDeleted_idx" ON "Role"("isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE INDEX "Permission_module_idx" ON "Permission"("module");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_staffId_roleId_key" ON "UserRole"("staffId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBranchAccess_staffId_branchId_key" ON "UserBranchAccess"("staffId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_email_key" ON "StaffProfile"("email");

-- CreateIndex
CREATE INDEX "StaffProfile_isActive_idx" ON "StaffProfile"("isActive");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranchAccess" ADD CONSTRAINT "UserBranchAccess_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranchAccess" ADD CONSTRAINT "UserBranchAccess_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
