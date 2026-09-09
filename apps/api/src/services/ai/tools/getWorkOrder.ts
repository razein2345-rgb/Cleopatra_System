import { z } from 'zod';
import { hasPermission } from '@cleopatra/shared';
import { prisma } from '../../../lib/prisma.js';
import { mapWorkOrderToDto, WORK_ORDER_INCLUDE } from '../../workOrderService.js';
import type { AiToolDefinition } from '../toolTypes.js';

/**
 * Contradiction found during Phase 1 verification (owner-approved
 * resolution): `workOrderService.ts` has no `getWorkOrderById` export —
 * the real function is `controllers/workOrders.ts::getWorkOrder`, a
 * controller-level query. Reused here verbatim (same `WORK_ORDER_INCLUDE`
 * + `mapWorkOrderToDto`).
 */
const inputSchema = z.object({
  id: z.string().uuid(),
});

export const getWorkOrderTool: AiToolDefinition<z.infer<typeof inputSchema>> = {
  name: 'get_work_order',
  description: 'Get full details for one work order (production job) by id — current stage, items, and progress.',
  requiredPermission: 'work-orders.view',
  inputSchema,
  inputJsonSchema: {
    type: 'object',
    properties: { id: { type: 'string', format: 'uuid' } },
    required: ['id'],
    additionalProperties: false,
  },
  async execute(input, ctx) {
    const workOrder = await prisma.workOrder.findUnique({ where: { id: input.id }, include: WORK_ORDER_INCLUDE });
    if (!workOrder || workOrder.isDeleted) return { found: false };
    const canSeeInternal = hasPermission(ctx.auth.permissions, 'work-orders.edit');
    return { found: true, workOrder: mapWorkOrderToDto(workOrder, canSeeInternal) };
  },
};
