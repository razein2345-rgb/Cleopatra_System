-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('INVOICE', 'QUOTATION', 'WORK_ORDER');

-- CreateEnum
CREATE TYPE "SheetBase" AS ENUM ('REGULAR', 'GAYER');

-- CreateEnum
CREATE TYPE "InventoryUnit" AS ENUM ('SHEET', 'ROLL', 'LINEAR_METER', 'SQUARE_METER', 'PIECE', 'KILOGRAM', 'LITER');

-- CreateEnum
CREATE TYPE "ServiceCategory" AS ENUM ('DESIGN', 'MONTAGE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'QUOTATION', 'CONFIRMED', 'IN_PRODUCTION', 'READY', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkOrderProductionStatus" AS ENUM ('WAITING', 'DESIGN', 'PREPRESS', 'PLATE_MAKING', 'PRINTING', 'FINISHING', 'QUALITY_CHECK', 'READY_FOR_DELIVERY', 'COMPLETED');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'VODAFONE_CASH', 'INSTAPAY', 'BANK_ACCOUNT');

-- CreateEnum
CREATE TYPE "TreasuryType" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER');

-- CreateEnum
CREATE TYPE "TreasurySourceType" AS ENUM ('MANUAL', 'INVOICE_PAYMENT');

-- CreateEnum
CREATE TYPE "TenderStatus" AS ENUM ('OPEN', 'SUBMITTED', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "MaterialCategory" AS ENUM ('PAPER', 'INK', 'PLATE', 'FINISHING', 'CONSUMABLE');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('IN', 'OUT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'STATUS_CHANGE');

-- CreateTable
CREATE TABLE "Branch" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSequence" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "year" INTEGER NOT NULL,
    "prefix" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" UUID NOT NULL,
    "zincPrice" DECIMAL(12,2) NOT NULL,
    "printRunPrice" DECIMAL(12,2) NOT NULL,
    "numberingRunPrice" DECIMAL(12,2) NOT NULL,
    "envelopeDesignPrice" DECIMAL(12,2) NOT NULL,
    "envelopePrintRunPrice" DECIMAL(12,2) NOT NULL,
    "envelopeZincPrice" DECIMAL(12,2) NOT NULL,
    "designPrice" DECIMAL(12,2) NOT NULL,
    "wasteSheetsDefault" INTEGER NOT NULL,
    "profitPercent" DECIMAL(6,3) NOT NULL,
    "notebookThreshold" INTEGER NOT NULL,
    "looseThreshold" INTEGER NOT NULL,
    "sellophanePricePerSheet" DECIMAL(12,2) NOT NULL,
    "logoUrl" TEXT,
    "boardsBannerNoDesign" DECIMAL(12,2) NOT NULL,
    "boardsBannerWithDesign" DECIMAL(12,2) NOT NULL,
    "boardsVinylPrintCutNoSello" DECIMAL(12,2) NOT NULL,
    "boardsVinylPrintCutWithSello" DECIMAL(12,2) NOT NULL,
    "boardsVinylNormalNoSello" DECIMAL(12,2) NOT NULL,
    "boardsVinylNormalWithSello" DECIMAL(12,2) NOT NULL,
    "boardsFlex" DECIMAL(12,2) NOT NULL,
    "boardsSeasro" DECIMAL(12,2) NOT NULL,
    "boardsGapMM" DECIMAL(6,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SizeFamily" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "base" "SheetBase" NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SizeFamily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SizeFamilyEntry" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "piecesPerSheet" DECIMAL(10,3) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SizeFamilyEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SheetType" (
    "id" UUID NOT NULL,
    "base" "SheetBase" NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "unit" "InventoryUnit" NOT NULL DEFAULT 'SHEET',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SheetType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadyProduct" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadyProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "category" "ServiceCategory" NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffProfile" (
    "id" UUID NOT NULL,
    "supabaseUserId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL DEFAULT 'STAFF',
    "branchId" UUID NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "branchId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discountPercent" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "vatOn" BOOLEAN NOT NULL DEFAULT false,
    "vatAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "finalTotal" DECIMAL(12,2) NOT NULL,
    "paymentTerms" TEXT,
    "deliveryDate" TIMESTAMP(3),
    "customerNotes" TEXT,
    "internalNotes" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "modelName" TEXT,
    "breakdown" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" UUID NOT NULL,
    "quotationNumber" TEXT NOT NULL,
    "branchId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discountPercent" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "vatOn" BOOLEAN NOT NULL DEFAULT false,
    "vatAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "finalTotal" DECIMAL(12,2) NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "convertedOrderId" UUID,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationItem" (
    "id" UUID NOT NULL,
    "quotationId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "modelName" TEXT,
    "breakdown" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" UUID NOT NULL,
    "workOrderNumber" TEXT NOT NULL,
    "orderId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "productionStatus" "WorkOrderProductionStatus" NOT NULL DEFAULT 'WAITING',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreasuryEntry" (
    "id" UUID NOT NULL,
    "type" "TreasuryType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "category" TEXT,
    "note" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "sourceType" "TreasurySourceType" NOT NULL DEFAULT 'MANUAL',
    "orderId" UUID,
    "paymentId" UUID,
    "customerId" UUID,
    "staffId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreasuryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPurchase" (
    "id" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tender" (
    "id" UUID NOT NULL,
    "customerId" UUID,
    "clientName" TEXT,
    "title" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "deadline" TIMESTAMP(3),
    "status" "TenderStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" UUID NOT NULL,
    "category" "MaterialCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "unit" "InventoryUnit" NOT NULL,
    "sheetTypeId" UUID,
    "reorderLevel" DECIMAL(12,3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLevel" (
    "id" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "quantityOnHand" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "reference" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "storagePath" TEXT,
    "sizeBytes" INTEGER,
    "uploadedById" UUID,
    "customerId" UUID,
    "quotationId" UUID,
    "orderId" UUID,
    "workOrderId" UUID,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "action" "AuditAction" NOT NULL,
    "performedById" UUID,
    "branchId" UUID,
    "previousValue" JSONB,
    "newValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Branch_code_key" ON "Branch"("code");

-- CreateIndex
CREATE INDEX "Branch_isDeleted_idx" ON "Branch"("isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSequence_branchId_documentType_year_key" ON "DocumentSequence"("branchId", "documentType", "year");

-- CreateIndex
CREATE UNIQUE INDEX "SizeFamily_key_key" ON "SizeFamily"("key");

-- CreateIndex
CREATE INDEX "SizeFamily_isDeleted_idx" ON "SizeFamily"("isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "SizeFamilyEntry_familyId_label_key" ON "SizeFamilyEntry"("familyId", "label");

-- CreateIndex
CREATE INDEX "SheetType_isDeleted_idx" ON "SheetType"("isDeleted");

-- CreateIndex
CREATE INDEX "ReadyProduct_isDeleted_idx" ON "ReadyProduct"("isDeleted");

-- CreateIndex
CREATE INDEX "Service_isDeleted_idx" ON "Service"("isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_supabaseUserId_key" ON "StaffProfile"("supabaseUserId");

-- CreateIndex
CREATE INDEX "StaffProfile_isDeleted_idx" ON "StaffProfile"("isDeleted");

-- CreateIndex
CREATE INDEX "StaffProfile_branchId_idx" ON "StaffProfile"("branchId");

-- CreateIndex
CREATE INDEX "Customer_isDeleted_idx" ON "Customer"("isDeleted");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Order_invoiceNumber_key" ON "Order"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Order_isDeleted_idx" ON "Order"("isDeleted");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "Order_branchId_idx" ON "Order"("branchId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_quotationNumber_key" ON "Quotation"("quotationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_convertedOrderId_key" ON "Quotation"("convertedOrderId");

-- CreateIndex
CREATE INDEX "Quotation_isDeleted_idx" ON "Quotation"("isDeleted");

-- CreateIndex
CREATE INDEX "Quotation_customerId_idx" ON "Quotation"("customerId");

-- CreateIndex
CREATE INDEX "Quotation_branchId_idx" ON "Quotation"("branchId");

-- CreateIndex
CREATE INDEX "Quotation_status_idx" ON "Quotation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_workOrderNumber_key" ON "WorkOrder"("workOrderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_orderId_key" ON "WorkOrder"("orderId");

-- CreateIndex
CREATE INDEX "WorkOrder_isDeleted_idx" ON "WorkOrder"("isDeleted");

-- CreateIndex
CREATE INDEX "WorkOrder_branchId_idx" ON "WorkOrder"("branchId");

-- CreateIndex
CREATE INDEX "WorkOrder_productionStatus_idx" ON "WorkOrder"("productionStatus");

-- CreateIndex
CREATE UNIQUE INDEX "TreasuryEntry_paymentId_key" ON "TreasuryEntry"("paymentId");

-- CreateIndex
CREATE INDEX "TreasuryEntry_isDeleted_idx" ON "TreasuryEntry"("isDeleted");

-- CreateIndex
CREATE INDEX "TreasuryEntry_branchId_idx" ON "TreasuryEntry"("branchId");

-- CreateIndex
CREATE INDEX "TreasuryEntry_type_idx" ON "TreasuryEntry"("type");

-- CreateIndex
CREATE INDEX "TreasuryEntry_date_idx" ON "TreasuryEntry"("date");

-- CreateIndex
CREATE INDEX "Supplier_isDeleted_idx" ON "Supplier"("isDeleted");

-- CreateIndex
CREATE INDEX "Tender_isDeleted_idx" ON "Tender"("isDeleted");

-- CreateIndex
CREATE INDEX "Tender_status_idx" ON "Tender"("status");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_sheetTypeId_key" ON "InventoryItem"("sheetTypeId");

-- CreateIndex
CREATE INDEX "InventoryItem_isDeleted_idx" ON "InventoryItem"("isDeleted");

-- CreateIndex
CREATE INDEX "InventoryItem_category_idx" ON "InventoryItem"("category");

-- CreateIndex
CREATE UNIQUE INDEX "StockLevel_inventoryItemId_branchId_key" ON "StockLevel"("inventoryItemId", "branchId");

-- CreateIndex
CREATE INDEX "Attachment_isDeleted_idx" ON "Attachment"("isDeleted");

-- CreateIndex
CREATE INDEX "Attachment_customerId_idx" ON "Attachment"("customerId");

-- CreateIndex
CREATE INDEX "Attachment_quotationId_idx" ON "Attachment"("quotationId");

-- CreateIndex
CREATE INDEX "Attachment_orderId_idx" ON "Attachment"("orderId");

-- CreateIndex
CREATE INDEX "Attachment_workOrderId_idx" ON "Attachment"("workOrderId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_performedById_idx" ON "AuditLog"("performedById");

-- AddForeignKey
ALTER TABLE "DocumentSequence" ADD CONSTRAINT "DocumentSequence_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SizeFamilyEntry" ADD CONSTRAINT "SizeFamilyEntry_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "SizeFamily"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_convertedOrderId_fkey" FOREIGN KEY ("convertedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryEntry" ADD CONSTRAINT "TreasuryEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryEntry" ADD CONSTRAINT "TreasuryEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryEntry" ADD CONSTRAINT "TreasuryEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryEntry" ADD CONSTRAINT "TreasuryEntry_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryEntry" ADD CONSTRAINT "TreasuryEntry_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPurchase" ADD CONSTRAINT "SupplierPurchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tender" ADD CONSTRAINT "Tender_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_sheetTypeId_fkey" FOREIGN KEY ("sheetTypeId") REFERENCES "SheetType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
