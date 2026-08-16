-- CreateEnum
CREATE TYPE "MachineStatus" AS ENUM ('RUNNING', 'STOPPED', 'MAINTENANCE');

-- CreateTable
CREATE TABLE "Machine" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "branchId" UUID NOT NULL,
    "departmentId" UUID,
    "status" "MachineStatus" NOT NULL DEFAULT 'RUNNING',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Machine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Machine_isDeleted_idx" ON "Machine"("isDeleted");

-- CreateIndex
CREATE INDEX "Machine_branchId_idx" ON "Machine"("branchId");

-- CreateIndex
CREATE INDEX "Machine_departmentId_idx" ON "Machine"("departmentId");

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
