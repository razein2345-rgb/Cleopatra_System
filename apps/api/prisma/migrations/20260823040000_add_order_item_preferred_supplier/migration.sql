-- Owner (2026-08-23, "اكتب اسم المورد منين وانا بطلب؟") — staff picks the
-- supplier at composition time; auto-copied into the "الإحضار من المورد"
-- stage instance once the job's Workflow reaches it.
ALTER TABLE "OrderItem" ADD COLUMN "preferredSupplierId" UUID;

CREATE INDEX "OrderItem_preferredSupplierId_idx" ON "OrderItem"("preferredSupplierId");

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_preferredSupplierId_fkey" FOREIGN KEY ("preferredSupplierId") REFERENCES "BusinessPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
