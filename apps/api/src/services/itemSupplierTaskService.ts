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
    cost: row.cost?.toNumber() ?? null,
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

/**
 * Accounting audit fix (2026-09-17, Decision 3) — `ItemSupplierTask.cost`
 * used to be profit-report-only, invisible to the actual supplier ledger
 * (a confirmed gap: a supplier genuinely owed money for an ad-hoc task had
 * no record anywhere a bookkeeper would look). Now, the moment a task
 * reaches `RECEIVED` with a real `supplierId` and a positive `cost`, this
 * atomically books a `SupplierPurchase` linked directly to the task
 * (`itemSupplierTaskId`, `@unique` — the idempotency key for this
 * mechanism specifically, deliberately independent of the BOARDS
 * auto-booking's own `workOrderId` key, so the two can never collide).
 * Never fires for WAITING/SENT, and never for a merely-estimated cost —
 * only a confirmed RECEIVED task is treated as a real payable.
 */
export async function updateItemSupplierTask(
  id: string,
  input: UpdateItemSupplierTaskInput,
  performedById: string,
): Promise<ItemSupplierTask> {
  const existing = await prisma.itemSupplierTask.findFirst({
    where: { id, isDeleted: false },
    include: { orderItem: { select: { order: { select: { id: true, branchId: true, invoiceNumber: true } } } } },
  });
  if (!existing) throw new ItemSupplierTaskNotFoundError();

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.itemSupplierTask.update({
      where: { id },
      data: {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}),
        ...(input.cost !== undefined ? { cost: input.cost } : {}),
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

    const newSupplierId = input.supplierId !== undefined ? input.supplierId : existing.supplierId;
    const newCost = input.cost !== undefined ? input.cost : existing.cost?.toNumber();
    const newStatus = input.status !== undefined ? input.status : existing.status;

    if (newStatus === 'RECEIVED' && newSupplierId && typeof newCost === 'number' && newCost > 0) {
      const alreadyBooked = await tx.supplierPurchase.findFirst({
        where: { itemSupplierTaskId: id, isDeleted: false },
        select: { id: true },
      });
      if (!alreadyBooked) {
        await tx.supplierPurchase.create({
          data: {
            partnerId: newSupplierId,
            amount: newCost,
            description: `${row.label} — فاتورة ${existing.orderItem.order.invoiceNumber}`,
            date: new Date(),
            recordedById: performedById,
            branchId: existing.orderItem.order.branchId,
            itemSupplierTaskId: id,
          },
        });
      }
    }

    return row;
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
