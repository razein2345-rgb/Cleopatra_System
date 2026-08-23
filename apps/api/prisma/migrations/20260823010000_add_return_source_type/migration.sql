-- Owner (2026-08-23, "مرتجعات: عند الخطأ في بيع صنف من المخزون: إرجاع
-- الصنف الخطأ للمخزون") — a cash refund for a returned INVENTORY_RETAIL
-- item, paired with the new OrderItemReturn table below.
ALTER TYPE "TreasurySourceType" ADD VALUE 'RETURN';
