-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('SELF_SERVICE', 'KIOSK', 'GPS', 'MANUAL');

-- CreateEnum
CREATE TYPE "FieldAssignmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

-- AlterTable
ALTER TABLE "AttendanceEntry" ADD COLUMN     "checkInLatitude" DOUBLE PRECISION,
ADD COLUMN     "checkInLongitude" DOUBLE PRECISION,
ADD COLUMN     "source" "AttendanceSource" NOT NULL DEFAULT 'SELF_SERVICE';

-- AlterTable
ALTER TABLE "StaffProfile" ADD COLUMN     "attendancePinHash" TEXT;

-- CreateTable
CREATE TABLE "FieldAssignment" (
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "locationLabel" TEXT NOT NULL,
    "targetLatitude" DOUBLE PRECISION NOT NULL,
    "targetLongitude" DOUBLE PRECISION NOT NULL,
    "radiusMeters" INTEGER NOT NULL DEFAULT 150,
    "status" "FieldAssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "confirmedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FieldAssignment_staffId_idx" ON "FieldAssignment"("staffId");

-- CreateIndex
CREATE INDEX "FieldAssignment_branchId_idx" ON "FieldAssignment"("branchId");

-- CreateIndex
CREATE INDEX "FieldAssignment_date_idx" ON "FieldAssignment"("date");

-- AddForeignKey
ALTER TABLE "FieldAssignment" ADD CONSTRAINT "FieldAssignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldAssignment" ADD CONSTRAINT "FieldAssignment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldAssignment" ADD CONSTRAINT "FieldAssignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
