import { z } from 'zod';
import { hasPermission } from '@cleopatra/shared';
import { prisma } from '../../../lib/prisma.js';
import { mapQuotationToDto, QUOTATION_INCLUDE } from '../../quotationService.js';
import type { AiToolDefinition } from '../toolTypes.js';

/**
 * Same contradiction class already documented/resolved for Phase 1's
 * `get_order`/`get_work_order`: the real function is
 * `controllers/quotations.ts::getQuotation`, a controller-level query —
 * reused here verbatim (same `QUOTATION_INCLUDE` + `mapQuotationToDto`).
 */
const inputSchema = z.object({
  id: z.string().uuid(),
});

export const getQuotationTool: AiToolDefinition<z.infer<typeof inputSchema>> = {
  name: 'get_quotation',
  description: 'Get full details for one quotation (price offer) by id — items, totals, status, and whether it was converted to an order.',
  requiredPermission: 'quotations.view',
  inputSchema,
  inputJsonSchema: {
    type: 'object',
    properties: { id: { type: 'string', format: 'uuid' } },
    required: ['id'],
    additionalProperties: false,
  },
  async execute(input, ctx) {
    const quotation = await prisma.quotation.findUnique({ where: { id: input.id }, include: QUOTATION_INCLUDE });
    if (!quotation || quotation.isDeleted) return { found: false };
    const canSeeInternal = hasPermission(ctx.auth.permissions, 'quotations.edit');
    return { found: true, quotation: mapQuotationToDto(quotation, canSeeInternal) };
  },
};
