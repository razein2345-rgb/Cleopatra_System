import { z } from 'zod';
import { getInventoryItem } from '../../inventoryService.js';
import { stripCostPrice } from '../../../lib/costPriceGuard.js';
import type { AiToolDefinition } from '../toolTypes.js';

/**
 * Contradiction found during Phase 1 verification (owner-approved
 * resolution): the real function is `getInventoryItem`, not
 * `getInventoryItemById` as CLEOPATRA_AI_TOOLS.md named it.
 */
const inputSchema = z.object({
  id: z.string().uuid(),
});

export const getInventoryItemTool: AiToolDefinition<z.infer<typeof inputSchema>> = {
  name: 'get_inventory_item',
  description: 'Get full details for one inventory item by id, including current stock quantity. Cost price is only included if the caller has the cost-price permission.',
  requiredPermission: 'inventory.view',
  inputSchema,
  inputJsonSchema: {
    type: 'object',
    properties: { id: { type: 'string', format: 'uuid' } },
    required: ['id'],
    additionalProperties: false,
  },
  async execute(input, ctx) {
    const item = await getInventoryItem(input.id);
    if (!item) return { found: false };
    return { found: true, item: stripCostPrice(item, ctx.auth) };
  },
};
