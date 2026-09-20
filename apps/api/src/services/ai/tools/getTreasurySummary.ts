import { z } from 'zod';
import { getCashPosition } from '../../treasuryService.js';
import type { AiToolDefinition } from '../toolTypes.js';

const inputSchema = z.object({});

export const getTreasurySummaryTool: AiToolDefinition<z.infer<typeof inputSchema>> = {
  name: 'get_treasury_summary',
  description: 'Get the treasury balance (income, expense, transfers, and balance by payment method), scoped to the branches the caller can access.',
  requiredPermission: 'treasury.view',
  inputSchema,
  inputJsonSchema: { type: 'object', properties: {}, additionalProperties: false },
  async execute(_input, ctx) {
    // Opening State / Cutover (3C.2 correction) — this reports the same
    // "current balance" concept as the Treasury page's top-line card
    // (getTreasuryBalanceHandler), so it gets the same Cash-Position-aware
    // function: a branch with an ACTIVE cutover correctly includes its
    // TreasuryOpening seed, a branch with none is unaffected.
    const branchIds = ctx.auth.roleNames.includes('SUPER_ADMIN') ? undefined : ctx.auth.accessibleBranchIds;
    return getCashPosition(branchIds);
  },
};
