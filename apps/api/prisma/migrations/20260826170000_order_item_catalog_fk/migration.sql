-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "readyProductId" UUID,
ADD COLUMN     "serviceId" UUID;

-- CreateIndex
CREATE INDEX "OrderItem_readyProductId_idx" ON "OrderItem"("readyProductId");

-- CreateIndex
CREATE INDEX "OrderItem_serviceId_idx" ON "OrderItem"("serviceId");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_readyProductId_fkey" FOREIGN KEY ("readyProductId") REFERENCES "ReadyProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
