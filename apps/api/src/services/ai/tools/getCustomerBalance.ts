import { z } from 'zod';
import { hasPermission } from '@cleopatra/shared';
import { prisma } from '../../../lib/prisma.js';
import { mapOrderToDto, ORDER_INCLUDE } from '../../orderService.js';
import type { AiToolDefinition } from '../toolTypes.js';

/**
 * Reuses the exact same query `controllers/orders.ts::listOrders` runs for
 * `?partnerId=`, plus `mapOrderToDto`'s own `remainingBalance` computation
 * (per-order) and the same plain `reduce` sum
 * `OrdersHistoryTab.tsx`'s `totalOutstanding` already does client-side —
 * never a re-derived formula (CLEOPATRA_AI_ARCHITECTURE.md §7).
 */
const inputSchema = z.object({
  partnerId: z.string().uuid(),
});

export const getCustomerBalanceTool: AiToolDefinition<z.infer<typeof inputSchema>> = {
  name: 'get_customer_balance',
  description: "Get a customer's total outstanding balance across all their orders (sum of each order's own remaining balance), plus a per-order breakdown.",
  requiredPermission: 'orders.view',
  inputSchema,
  inputJsonSchema: {
    type: 'object',
    properties: { partnerId: { type: 'string', format: 'uuid' } },
    required: ['partnerId'],
    additionalProperties: false,
  },
  async execute(input, ctx) {
    const orders = await prisma.order.findMany({
      where: { isDeleted: false, partnerId: input.partnerId },
      include: ORDER_INCLUDE,
      orderBy: { date: 'desc' },
    });

    const canSeeInternal = hasPermission(ctx.auth.permissions, 'orders.edit');
    const dtos = orders.map((o) => mapOrderToDto(o, canSeeInternal));
    const totalOutstanding = dtos.reduce((sum, o) => sum + o.remainingBalance, 0);

    return {
      partnerId: input.partnerId,
      totalOutstanding,
      orders: dtos.map((o) => ({
        id: o.id,
        invoiceNumber: o.invoiceNumber,
        date: o.date,
        finalTotal: o.finalTotal,
        paidTotal: o.paidTotal,
        remainingBalance: o.remainingBalance,
        status: o.status,
      })),
    };
  },
};
