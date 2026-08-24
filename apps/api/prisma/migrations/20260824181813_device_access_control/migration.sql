-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('PENDING', 'ACTIVE', 'BLOCKED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'DEVICE_REGISTERED';
ALTER TYPE "AuditAction" ADD VALUE 'DEVICE_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE 'DEVICE_BLOCKED';
ALTER TYPE "AuditAction" ADD VALUE 'DEVICE_UNBLOCKED';
ALTER TYPE "AuditAction" ADD VALUE 'DEVICE_RENAMED';
ALTER TYPE "AuditAction" ADD VALUE 'DEVICE_REMOVED';
ALTER TYPE "AuditAction" ADD VALUE 'UNAUTHORIZED_DEVICE_ATTEMPT';

-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "deviceAccessMode" TEXT NOT NULL DEFAULT 'ALLOW_ALL_REGISTERED';

-- CreateTable
CREATE TABLE "TrustedDevice" (
    "id" UUID NOT NULL,
    "deviceToken" TEXT NOT NULL,
    "label" TEXT,
    "staffId" UUID,
    "status" "DeviceStatus" NOT NULL DEFAULT 'PENDING',
    "deviceType" TEXT,
    "os" TEXT,
    "browser" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3),
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "blockedById" UUID,
    "blockedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrustedDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrustedDevice_deviceToken_key" ON "TrustedDevice"("deviceToken");

-- CreateIndex
CREATE INDEX "TrustedDevice_staffId_idx" ON "TrustedDevice"("staffId");

-- CreateIndex
CREATE INDEX "TrustedDevice_status_idx" ON "TrustedDevice"("status");

-- CreateIndex
CREATE INDEX "TrustedDevice_isDeleted_idx" ON "TrustedDevice"("isDeleted");

-- AddForeignKey
ALTER TABLE "TrustedDevice" ADD CONSTRAINT "TrustedDevice_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustedDevice" ADD CONSTRAINT "TrustedDevice_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustedDevice" ADD CONSTRAINT "TrustedDevice_blockedById_fkey" FOREIGN KEY ("blockedById") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
