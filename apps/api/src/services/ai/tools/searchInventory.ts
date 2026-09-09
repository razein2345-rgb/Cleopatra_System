import { z } from 'zod';
import { listInventoryItems } from '../../inventoryService.js';
import { stripCostPriceList } from '../../../lib/costPriceGuard.js';
import type { AiToolDefinition } from '../toolTypes.js';

const inputSchema = z.object({
  query: z.string().trim().min(1).max(200).optional().describe('Match on item name or barcode'),
});

export const searchInventoryTool: AiToolDefinition<z.infer<typeof inputSchema>> = {
  name: 'search_inventory',
  description: 'Search inventory/stock items by name or barcode. Cost price is only included if the caller has the cost-price permission.',
  requiredPermission: 'inventory.view',
  inputSchema,
  inputJsonSchema: {
    type: 'object',
    properties: { query: { type: 'string', description: 'Match on item name or barcode' } },
    additionalProperties: false,
  },
  async execute(input, ctx) {
    const items = await listInventoryItems();
    const q = input.query?.toLowerCase().trim();
    const filtered = q
      ? items.filter((i) => i.name.toLowerCase().includes(q) || (i.barcode?.toLowerCase().includes(q) ?? false))
      : items;
    return stripCostPriceList(filtered.slice(0, 20), ctx.auth);
  },
};
