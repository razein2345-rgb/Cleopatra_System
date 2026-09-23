-- AddForeignKey
ALTER TABLE "OrderItemReturn" ADD CONSTRAINT "OrderItemReturn_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "OrderItemReturn_orderId_idx" ON "OrderItemReturn"("orderId");
