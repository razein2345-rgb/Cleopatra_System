-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "categoryId" UUID;

-- CreateTable
CREATE TABLE "InventoryCategory" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCategory_name_key" ON "InventoryCategory"("name");

-- CreateIndex
CREATE INDEX "InventoryCategory_isDeleted_idx" ON "InventoryCategory"("isDeleted");

-- CreateIndex
CREATE INDEX "InventoryCategory_isActive_idx" ON "InventoryCategory"("isActive");

-- CreateIndex
CREATE INDEX "InventoryItem_categoryId_idx" ON "InventoryItem"("categoryId");

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "InventoryCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
