import { z } from 'zod';
import { getTreasuryBalance } from '../../treasuryService.js';
import type { AiToolDefinition } from '../toolTypes.js';

const inputSchema = z.object({});

export const getTreasurySummaryTool: AiToolDefinition<z.infer<typeof inputSchema>> = {
  name: 'get_treasury_summary',
  description: 'Get the treasury balance (income, expense, transfers, and balance by payment method), scoped to the branches the caller can access.',
  requiredPermission: 'treasury.view',
  inputSchema,
  inputJsonSchema: { type: 'object', properties: {}, additionalProperties: false },
  async execute(_input, ctx) {
    const branchIds = ctx.auth.roleNames.includes('SUPER_ADMIN') ? undefined : ctx.auth.accessibleBranchIds;
    return getTreasuryBalance(branchIds);
  },
};
