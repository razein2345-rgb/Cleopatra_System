-- Walk-in / cash customer invoices (owner, 2026-08-20): INVENTORY_RETAIL and
-- MANUAL line items don't need a BusinessPartner record. Foreign key
-- constraints already permit NULL; only the NOT NULL constraint needs to go.
ALTER TABLE "Order" ALTER COLUMN "partnerId" DROP NOT NULL;
ALTER TABLE "Quotation" ALTER COLUMN "partnerId" DROP NOT NULL;
