import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import type { ItemSupplierTask, UpdateItemSupplierTaskInput } from '@cleopatra/shared';

export class ItemSupplierTaskNotFoundError extends Error {
  constructor() {
    super('Item supplier task not found');
    this.name = 'ItemSupplierTaskNotFoundError';
  }
}

const LIST_INCLUDE = {
  supplier: { select: { nameAr: true } },
  orderItem: {
    select: {
      modelName: true,
      kind: true,
      workOrder: { select: { workOrderNumber: true } },
      order: { select: { partner: { select: { nameAr: true } } } },
    },
  },
} satisfies Prisma.ItemSupplierTaskInclude;

type Row = Prisma.ItemSupplierTaskGetPayload<{ include: typeof LIST_INCLUDE }>;

function toDto(row: Row): ItemSupplierTask {
  return {
    id: row.id,
    orderItemId: row.orderItemId,
    label: row.label,
    supplierId: row.supplierId,
    supplierName: row.supplier?.nameAr ?? null,
    status: row.status,
    sentDate: row.sentDate?.toISOString() ?? null,
    expectedReturnDate: row.expectedReturnDate?.toISOString() ?? null,
    actualReturnDate: row.actualReturnDate?.toISOString() ?? null,
    sortOrder: row.sortOrder,
    itemName: row.orderItem.modelName || row.orderItem.kind || null,
    workOrderNumber: row.orderItem.workOrder?.workOrderNumber ?? null,
    customerName: row.orderItem.order.partner?.nameAr ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Owner (2026-09-08, "احياناً هحتاج اكستم انا وورك فلو عن طريق بند يدوي")
 * — every open (not yet RECEIVED) task across every order, for the
 * Production Board's own cross-order list — same "one combined query,
 * never one request per order" shape `getAllQueue` already uses for the
 * unified "الكل" view.
 */
export async function listOpenItemSupplierTasks(): Promise<ItemSupplierTask[]> {
  const rows = await prisma.itemSupplierTask.findMany({
    where: { isDeleted: false, status: { in: ['WAITING', 'SENT'] } },
    include: LIST_INCLUDE,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(toDto);
}

export async function updateItemSupplierTask(id: string, input: UpdateItemSupplierTaskInput): Promise<ItemSupplierTask> {
  const existing = await prisma.itemSupplierTask.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw new ItemSupplierTaskNotFoundError();
  const updated = await prisma.itemSupplierTask.update({
    where: { id },
    data: {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.sentDate !== undefined ? { sentDate: input.sentDate ? new Date(input.sentDate) : null } : {}),
      ...(input.expectedReturnDate !== undefined
        ? { expectedReturnDate: input.expectedReturnDate ? new Date(input.expectedReturnDate) : null }
        : {}),
      ...(input.actualReturnDate !== undefined
        ? { actualReturnDate: input.actualReturnDate ? new Date(input.actualReturnDate) : null }
        : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
    include: LIST_INCLUDE,
  });
  return toDto(updated);
}

export async function deleteItemSupplierTask(id: string, deletedBy: string): Promise<void> {
  const existing = await prisma.itemSupplierTask.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw new ItemSupplierTaskNotFoundError();
  await prisma.itemSupplierTask.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy },
  });
}
