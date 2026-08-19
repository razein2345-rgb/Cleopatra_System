import type { Prisma } from '../generated/prisma/client.js';
import type { CreateOrderItemInput, OrderTemplate } from '@cleopatra/shared';

type OrderTemplateRecord = Prisma.OrderTemplateGetPayload<object>;

export function mapOrderTemplateToDto(template: OrderTemplateRecord): OrderTemplate {
  return {
    id: template.id,
    name: template.name,
    branchId: template.branchId,
    createdById: template.createdById,
    partnerId: template.partnerId,
    itemsSnapshot: template.itemsSnapshot as unknown as CreateOrderItemInput[],
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}
