import { z } from 'zod';
import { hasPermission } from '@cleopatra/shared';
import { prisma } from '../../../lib/prisma.js';
import { mapOrderToDto, ORDER_INCLUDE } from '../../orderService.js';
import type { AiToolDefinition } from '../toolTypes.js';

/**
 * Contradiction found during Phase 1 verification (owner-approved
 * resolution): `orderService.ts` has no `listOrders` export — that query
 * lives inline in `controllers/orders.ts::listOrders` (same `ORDER_INCLUDE`
 * + `mapOrderToDto` this tool reuses unmodified). The controller itself
 * only supports a `partnerId` filter; `status`/date-range/`branchId` here
 * are additional in-memory filters over that same unfiltered result set —
 * not a new query shape, no new business logic.
 */
const inputSchema = z.object({
  partnerId: z.string().uuid().optional(),
  status: z.enum(['IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  branchId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  query: z.string().trim().min(1).max(200).optional().describe('Free-text match on invoice number or item name'),
});

export const searchOrdersTool: AiToolDefinition<z.infer<typeof inputSchema>> = {
  name: 'search_orders',
  description: 'Search orders/invoices by customer, status, branch, date range, or free text (invoice number / item name). Returns a short summary list — call get_order for full detail on one.',
  requiredPermission: 'orders.view',
  inputSchema,
  inputJsonSchema: {
    type: 'object',
    properties: {
      partnerId: { type: 'string', format: 'uuid' },
      status: { type: 'string', enum: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'] },
      branchId: { type: 'string', format: 'uuid' },
      dateFrom: { type: 'string', description: 'ISO date, inclusive lower bound' },
      dateTo: { type: 'string', description: 'ISO date, inclusive upper bound' },
      query: { type: 'string', description: 'Free-text match on invoice number or item name' },
    },
    additionalProperties: false,
  },
  async execute(input, ctx) {
    const orders = await prisma.order.findMany({
      where: {
        isDeleted: false,
        ...(input.partnerId ? { partnerId: input.partnerId } : {}),
      },
      include: ORDER_INCLUDE,
      orderBy: { date: 'desc' },
    });

    const canSeeInternal = hasPermission(ctx.auth.permissions, 'orders.edit');
    let dtos = orders.map((o) => mapOrderToDto(o, canSeeInternal));

    if (input.status) dtos = dtos.filter((o) => o.status === input.status);
    if (input.branchId) dtos = dtos.filter((o) => o.branchId === input.branchId);
    if (input.dateFrom) dtos = dtos.filter((o) => o.date >= input.dateFrom!);
    if (input.dateTo) dtos = dtos.filter((o) => o.date <= input.dateTo!);
    if (input.query) {
      const q = input.query.toLowerCase();
      dtos = dtos.filter(
        (o) => o.invoiceNumber.toLowerCase().includes(q) || o.items.some((item) => item.kind?.toLowerCase().includes(q)),
      );
    }

    return dtos.slice(0, 20).map((o) => ({
      id: o.id,
      invoiceNumber: o.invoiceNumber,
      date: o.date,
      partnerId: o.partnerId,
      branchId: o.branchId,
      status: o.status,
      finalTotal: o.finalTotal,
      remainingBalance: o.remainingBalance,
    }));
  },
};
