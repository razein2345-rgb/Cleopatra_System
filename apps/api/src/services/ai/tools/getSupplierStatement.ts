import { z } from 'zod';
import { getSupplierStatement } from '../../supplierLedgerService.js';
import type { AiToolDefinition } from '../toolTypes.js';

/**
 * Phase 2 Task 4 (owner-approved, 2026-09-10, Option B). Wraps
 * `supplierLedgerService.ts::getSupplierStatement(partnerId, from?, to?)`
 * unmodified — it already merges purchases/payments into the real
 * running-balance feed; this tool is a pure pass-through, no new
 * calculation.
 */
const inputSchema = z.object({
  partnerId: z.string().uuid(),
  from: z.string().optional().describe('ISO date, inclusive lower bound on listed entries'),
  to: z.string().optional().describe('ISO date, inclusive upper bound on listed entries'),
});

export const getSupplierStatementTool: AiToolDefinition<z.infer<typeof inputSchema>> = {
  name: 'get_supplier_statement',
  description: "Get one supplier's full ledger statement — purchases, payments, and running balance, optionally scoped to a date range.",
  requiredPermission: 'suppliers.view',
  inputSchema,
  inputJsonSchema: {
    type: 'object',
    properties: {
      partnerId: { type: 'string', format: 'uuid' },
      from: { type: 'string', description: 'ISO date, inclusive lower bound' },
      to: { type: 'string', description: 'ISO date, inclusive upper bound' },
    },
    required: ['partnerId'],
    additionalProperties: false,
  },
  async execute(input) {
    const statement = await getSupplierStatement(
      input.partnerId,
      input.from ? new Date(input.from) : undefined,
      input.to ? new Date(input.to) : undefined,
    );
    if (!statement) return { found: false };
    return { found: true, statement };
  },
};
