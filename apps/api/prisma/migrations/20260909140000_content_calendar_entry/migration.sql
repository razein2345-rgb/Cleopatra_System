-- CreateEnum
CREATE TYPE "ContentPlatform" AS ENUM ('INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'WHATSAPP_STATUS', 'OTHER');

-- CreateEnum
CREATE TYPE "ContentCalendarStatus" AS ENUM ('IDEA', 'IN_PROGRESS', 'READY', 'PUBLISHED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ContentCalendarEntry" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "platform" "ContentPlatform" NOT NULL,
    "contentType" TEXT,
    "notes" TEXT,
    "publishedUrl" TEXT,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "status" "ContentCalendarStatus" NOT NULL DEFAULT 'IDEA',
    "branchId" UUID,
    "assignedToId" UUID,
    "recordedById" UUID NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentCalendarEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentCalendarEntry_isDeleted_idx" ON "ContentCalendarEntry"("isDeleted");

-- CreateIndex
CREATE INDEX "ContentCalendarEntry_branchId_idx" ON "ContentCalendarEntry"("branchId");

-- CreateIndex
CREATE INDEX "ContentCalendarEntry_assignedToId_idx" ON "ContentCalendarEntry"("assignedToId");

-- CreateIndex
CREATE INDEX "ContentCalendarEntry_scheduledDate_idx" ON "ContentCalendarEntry"("scheduledDate");

-- CreateIndex
CREATE INDEX "ContentCalendarEntry_status_idx" ON "ContentCalendarEntry"("status");

-- AddForeignKey
ALTER TABLE "ContentCalendarEntry" ADD CONSTRAINT "ContentCalendarEntry_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCalendarEntry" ADD CONSTRAINT "ContentCalendarEntry_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCalendarEntry" ADD CONSTRAINT "ContentCalendarEntry_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
