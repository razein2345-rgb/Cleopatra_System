import { z } from 'zod';
import { listSuppliers } from '../../supplierLedgerService.js';
import type { AiToolDefinition } from '../toolTypes.js';

/**
 * Phase 2 Task 4 (owner-approved, 2026-09-10, Option B). Wraps
 * `supplierLedgerService.ts::listSuppliers()` unmodified — it already
 * computes each supplier's real balance (sum of purchases minus sum of
 * payments); this tool only adds an in-memory name filter, same pattern
 * as `search_customers`/`search_orders`/`search_quotations`. No branch
 * filter exists in the real `listSuppliers()` (same as
 * `listBusinessPartners`/`listQuotations`) — this tool matches that
 * exactly rather than inventing a stricter scope.
 */
const inputSchema = z.object({
  query: z.string().trim().min(1).max(200).optional().describe('Free-text match on supplier name'),
});

export const searchSuppliersTool: AiToolDefinition<z.infer<typeof inputSchema>> = {
  name: 'search_suppliers',
  description: 'Search suppliers by name. Returns each supplier\'s current balance (what we owe them) — call get_supplier_statement for one supplier\'s full purchase/payment history.',
  requiredPermission: 'suppliers.view',
  inputSchema,
  inputJsonSchema: {
    type: 'object',
    properties: { query: { type: 'string', description: 'Free-text match on supplier name' } },
    additionalProperties: false,
  },
  async execute(input) {
    const suppliers = await listSuppliers();
    const q = input.query?.toLowerCase().trim();
    const filtered = q ? suppliers.filter((s) => s.nameAr.toLowerCase().includes(q)) : suppliers;
    return filtered.slice(0, 20);
  },
};
