import { z } from 'zod';
import { purchaseRequestStatusSchema } from '@cleopatra/shared';
import { listPurchaseRequests } from '../../purchaseRequestService.js';
import type { AiToolDefinition } from '../toolTypes.js';

/**
 * Phase 2 Task 5 (owner-approved, 2026-09-10). Wraps
 * `purchaseRequestService.ts::listPurchaseRequests(status?)` unmodified —
 * no filter, no default, no re-derivation: whatever the caller passes (or
 * omits) reaches the real service exactly as `controllers/purchaseRequests.ts`
 * already passes it through. Two real row kinds exist, per
 * `PurchaseRequestKind` (schema.prisma) — described here so the model
 * never confuses them: `STOCK_SHORTFALL` (a real inventory item went
 * negative, tied to `inventoryItemName`) vs. `BOARDS_PURCHASE`/
 * `BOARDS_ASSEMBLY` (a BoardsCatalogItem supplier obligation — purchase or
 * assembly/mounting — tied to `boardsCatalogItemName`, no stock concept at
 * all).
 */
const inputSchema = z.object({
  status: purchaseRequestStatusSchema.optional(),
});

export const getPurchaseRequestsDueTool: AiToolDefinition<z.infer<typeof inputSchema>> = {
  name: 'get_purchase_requests_due',
  description:
    'List purchase requests ("قائمة شراء عاجل") — real supplier purchases needed right now. Two kinds: STOCK_SHORTFALL (an inventory item ran negative, see inventoryItemName) and BOARDS_PURCHASE/BOARDS_ASSEMBLY (a boards/signage catalog item\'s supplier purchase or assembly obligation, see boardsCatalogItemName). Optionally filter by status (PENDING = still needs buying, PURCHASED = already bought); omit to get both.',
  requiredPermission: 'inventory.view',
  inputSchema,
  inputJsonSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['PENDING', 'PURCHASED'], description: 'Omit to return both PENDING and PURCHASED requests' },
    },
    additionalProperties: false,
  },
  async execute(input) {
    return listPurchaseRequests(input.status);
  },
};
