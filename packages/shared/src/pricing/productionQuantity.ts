import type { OrderItemPricingInput } from '../schemas/orderItemPricing.js';

/**
 * "تصميم واحد بمتغيرات إنتاج متعددة" (2026-08-19) — reads the customer-
 * facing piece count straight off an already-validated pricing input, for
 * `OrderItem.requiredQuantity`'s frozen snapshot. This is NOT a pricing
 * calculation — it performs no arithmetic on cost/price, just reads a field
 * that's already part of the validated input (or, for DIGITAL, sums a few
 * already-validated fields). Deliberately kept in its own file, separate
 * from `costCalculation.ts`/`digitalCostCalculation.ts`/
 * `boardsCostCalculation.ts`/`productCostCalculation.ts` — those compute
 * money, this only reads a quantity for production-progress tracking, and
 * the two concerns must never be allowed to blur into one file.
 */
export function resolveRequiredQuantity(pricing: OrderItemPricingInput): number | null {
  switch (pricing.kind) {
    case 'LOOSE_PAPER':
    case 'FOLDER':
    case 'ENVELOPE':
    case 'BOARDS':
    case 'PRODUCT':
    case 'SERVICE':
    case 'INVENTORY_RETAIL':
      return pricing.quantity;
    case 'NOTEBOOK':
      return pricing.notebookQuantity;
    case 'DIGITAL':
      // Multiple components (e.g. cover + interior) describe one physical
      // piece, not independent variants — summing their quantities is a
      // best-effort total, not a precise "pieces to produce" count for
      // every possible DIGITAL shape. Good enough for progress tracking;
      // never used anywhere pricing is computed.
      return pricing.components.reduce((sum, c) => sum + c.quantity, 0);
    default:
      return null;
  }
}
