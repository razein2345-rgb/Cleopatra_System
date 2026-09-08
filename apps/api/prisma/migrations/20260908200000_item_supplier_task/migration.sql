-- CreateEnum
CREATE TYPE "ItemSupplierTaskStatus" AS ENUM ('WAITING', 'SENT', 'RECEIVED');

-- CreateTable
CREATE TABLE "ItemSupplierTask" (
    "id" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "supplierId" UUID,
    "status" "ItemSupplierTaskStatus" NOT NULL DEFAULT 'WAITING',
    "sentDate" TIMESTAMP(3),
    "expectedReturnDate" TIMESTAMP(3),
    "actualReturnDate" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemSupplierTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ItemSupplierTask_orderItemId_idx" ON "ItemSupplierTask"("orderItemId");

-- CreateIndex
CREATE INDEX "ItemSupplierTask_supplierId_idx" ON "ItemSupplierTask"("supplierId");

-- CreateIndex
CREATE INDEX "ItemSupplierTask_isDeleted_idx" ON "ItemSupplierTask"("isDeleted");

-- AddForeignKey
ALTER TABLE "ItemSupplierTask" ADD CONSTRAINT "ItemSupplierTask_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemSupplierTask" ADD CONSTRAINT "ItemSupplierTask_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "BusinessPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
