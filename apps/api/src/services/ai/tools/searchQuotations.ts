import { z } from 'zod';
import { hasPermission, quotationStatusSchema } from '@cleopatra/shared';
import { prisma } from '../../../lib/prisma.js';
import { mapQuotationToDto, QUOTATION_INCLUDE } from '../../quotationService.js';
import type { AiToolDefinition } from '../toolTypes.js';

/**
 * Phase 2 Task 1 (quotation read tools) — same pattern as Phase 1's
 * `search_orders`: `controllers/quotations.ts::listQuotations` has no
 * separate service-layer function of its own, so this tool reuses its
 * exact query (`QUOTATION_INCLUDE` + `mapQuotationToDto`, both already
 * exported from `quotationService.ts`) unmodified — no new business logic.
 * The controller itself supports `partnerId`/`status` filters; `query`
 * here is an additional in-memory filter over that same result set, same
 * as `search_orders`' own free-text filter.
 *
 * Gap 1 fix (Task 7 Root-Cause Discovery, 2026-09-10): `query` previously
 * matched only `quotationNumber`/item `kind`, never the customer's name —
 * so a natural question naming a customer (e.g. "عروض الأسعار الخاصة
 * بدكتور حسام مجدى") could never resolve without a separate
 * `search_customers` call first, despite the tool's own description
 * claiming a "by customer" free-text capability. Fix is additive only:
 * the query's own `include` (not the shared `QUOTATION_INCLUDE` export)
 * gains a `partner.nameAr` select, and that field joins the existing
 * in-memory `query` match — zero change to `partnerId`/`status`
 * filtering, zero change to pricing/quotation logic, zero Migration.
 */
const inputSchema = z.object({
  partnerId: z.string().uuid().optional(),
  status: quotationStatusSchema.optional(),
  query: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe('Free-text match on customer name, quotation number, or item name'),
});

export const searchQuotationsTool: AiToolDefinition<z.infer<typeof inputSchema>> = {
  name: 'search_quotations',
  description:
    'Search quotations (price offers) by customer name, status, or free text (quotation number / item name). `query` matches the customer name directly — no need to resolve partnerId via search_customers first. Returns a short summary list — call get_quotation for full detail on one.',
  requiredPermission: 'quotations.view',
  inputSchema,
  inputJsonSchema: {
    type: 'object',
    properties: {
      partnerId: { type: 'string', format: 'uuid' },
      status: { type: 'string', enum: ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED'] },
      query: { type: 'string', description: 'Free-text match on customer name, quotation number, or item name' },
    },
    additionalProperties: false,
  },
  async execute(input, ctx) {
    const quotations = await prisma.quotation.findMany({
      where: {
        isDeleted: false,
        ...(input.partnerId ? { partnerId: input.partnerId } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      include: { ...QUOTATION_INCLUDE, partner: { select: { nameAr: true } } },
      orderBy: { date: 'desc' },
    });

    let matched = quotations;
    if (input.query) {
      const q = input.query.toLowerCase();
      matched = quotations.filter(
        (quotation) =>
          quotation.partner?.nameAr?.toLowerCase().includes(q) ||
          quotation.quotationNumber.toLowerCase().includes(q) ||
          quotation.items.some((item) => item.kind?.toLowerCase().includes(q)),
      );
    }

    const canSeeInternal = hasPermission(ctx.auth.permissions, 'quotations.edit');
    const dtos = matched.map((q) => mapQuotationToDto(q, canSeeInternal));

    return dtos.slice(0, 20).map((quotation) => ({
      id: quotation.id,
      quotationNumber: quotation.quotationNumber,
      date: quotation.date,
      partnerId: quotation.partnerId,
      branchId: quotation.branchId,
      status: quotation.status,
      finalTotal: quotation.finalTotal,
      validUntil: quotation.validUntil,
      convertedOrderId: quotation.convertedOrderId,
    }));
  },
};
