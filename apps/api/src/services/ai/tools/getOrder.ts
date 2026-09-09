import { z } from 'zod';
import { hasPermission } from '@cleopatra/shared';
import { prisma } from '../../../lib/prisma.js';
import { mapOrderToDto, ORDER_INCLUDE } from '../../orderService.js';
import type { AiToolDefinition } from '../toolTypes.js';

const inputSchema = z.object({
  id: z.string().uuid(),
});

export const getOrderTool: AiToolDefinition<z.infer<typeof inputSchema>> = {
  name: 'get_order',
  description: 'Get full details for one order/invoice by id — items, payments, returns, and computed balance.',
  requiredPermission: 'orders.view',
  inputSchema,
  inputJsonSchema: {
    type: 'object',
    properties: { id: { type: 'string', format: 'uuid' } },
    required: ['id'],
    additionalProperties: false,
  },
  async execute(input, ctx) {
    const order = await prisma.order.findUnique({ where: { id: input.id }, include: ORDER_INCLUDE });
    if (!order || order.isDeleted) return { found: false };
    const canSeeInternal = hasPermission(ctx.auth.permissions, 'orders.edit');
    return { found: true, order: mapOrderToDto(order, canSeeInternal) };
  },
};
