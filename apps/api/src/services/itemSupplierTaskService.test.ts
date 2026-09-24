import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Accounting audit fix (2026-09-17, Decision 3) — regression coverage for
 * `ItemSupplierTask.cost` becoming a real `SupplierPurchase` payable only
 * once the task reaches RECEIVED with a confirmed cost — never for
 * WAITING/SENT or a merely-estimated cost — and never more than once per
 * task (idempotency keyed on `itemSupplierTaskId`, independent of the
 * BOARDS auto-booking's own `workOrderId` key).
 */

const itemSupplierTaskUpdate = vi.fn();
const supplierPurchaseFindFirst = vi.fn();
const supplierPurchaseCreate = vi.fn();

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    itemSupplierTask: {
      findFirst: (...args: unknown[]) => itemSupplierTaskFindFirst(...args),
      update: (...args: unknown[]) => itemSupplierTaskUpdate(...args),
    },
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        itemSupplierTask: {
          update: (...args: unknown[]) => itemSupplierTaskUpdate(...args),
        },
        supplierPurchase: {
          findFirst: (...args: unknown[]) => supplierPurchaseFindFirst(...args),
          create: (...args: unknown[]) => supplierPurchaseCreate(...args),
        },
      }),
  },
}));

const itemSupplierTaskFindFirst = vi.fn();

const { updateItemSupplierTask } = await import('./itemSupplierTaskService.js');

const TASK_ID = 'task-1';
const STAFF_ID = 'staff-1';
const SUPPLIER_ID = 'supplier-1';
const BRANCH_ID = 'branch-1';

function existingTask(overrides: Partial<{ supplierId: string | null; cost: { toNumber(): number } | null; status: string }> = {}) {
  return {
    id: TASK_ID,
    orderItemId: 'item-1',
    label: 'السيرل',
    supplierId: null,
    cost: null,
    status: 'WAITING',
    sentDate: null,
    expectedReturnDate: null,
    actualReturnDate: null,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    orderItem: { order: { id: 'order-1', branchId: BRANCH_ID, invoiceNumber: 'CLP-INV-2026-000001' } },
    ...overrides,
  };
}

function updatedRow(overrides: Partial<{ status: string; supplierId: string | null; cost: { toNumber(): number } | null }> = {}) {
  return {
    id: TASK_ID,
    orderItemId: 'item-1',
    label: 'السيرل',
    supplierId: SUPPLIER_ID,
    cost: { toNumber: () => 300 },
    status: 'RECEIVED',
    sentDate: null,
    expectedReturnDate: null,
    actualReturnDate: null,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    supplier: { nameAr: 'مورد السيرل' },
    orderItem: {
      modelName: null,
      kind: 'MANUAL',
      workOrder: null,
      order: { partner: null },
    },
    ...overrides,
  };
}

describe('updateItemSupplierTask — cost becomes a real payable only on RECEIVED (Decision 3)', () => {
  beforeEach(() => {
    itemSupplierTaskFindFirst.mockReset();
    itemSupplierTaskUpdate.mockReset();
    supplierPurchaseFindFirst.mockReset().mockResolvedValue(null);
    supplierPurchaseCreate.mockReset();
  });

  it('WAITING with a cost set does NOT create a payable', async () => {
    itemSupplierTaskFindFirst.mockResolvedValue(existingTask({ status: 'WAITING' }));
    itemSupplierTaskUpdate.mockResolvedValue(updatedRow({ status: 'WAITING' }));

    await updateItemSupplierTask(TASK_ID, { supplierId: SUPPLIER_ID, cost: 300 }, STAFF_ID);

    expect(supplierPurchaseCreate).not.toHaveBeenCalled();
  });

  it('SENT with a cost set does NOT create a payable', async () => {
    itemSupplierTaskFindFirst.mockResolvedValue(existingTask({ status: 'SENT', supplierId: SUPPLIER_ID, cost: { toNumber: () => 300 } }));
    itemSupplierTaskUpdate.mockResolvedValue(updatedRow({ status: 'SENT' }));

    await updateItemSupplierTask(TASK_ID, { status: 'SENT' }, STAFF_ID);

    expect(supplierPurchaseCreate).not.toHaveBeenCalled();
  });

  it('RECEIVED with a valid confirmed cost creates exactly one SupplierPurchase, linked to the task', async () => {
    itemSupplierTaskFindFirst.mockResolvedValue(existingTask({ status: 'SENT', supplierId: SUPPLIER_ID, cost: { toNumber: () => 300 } }));
    itemSupplierTaskUpdate.mockResolvedValue(updatedRow({ status: 'RECEIVED' }));

    await updateItemSupplierTask(TASK_ID, { status: 'RECEIVED' }, STAFF_ID);

    expect(supplierPurchaseCreate).toHaveBeenCalledTimes(1);
    const data = supplierPurchaseCreate.mock.calls[0]![0].data;
    expect(data.itemSupplierTaskId).toBe(TASK_ID);
    expect(data.partnerId).toBe(SUPPLIER_ID);
    expect(data.amount).toBe(300);
    expect(data.branchId).toBe(BRANCH_ID);
  });

  it('processing the same task as RECEIVED again does not create a second SupplierPurchase (idempotent)', async () => {
    itemSupplierTaskFindFirst.mockResolvedValue(existingTask({ status: 'RECEIVED', supplierId: SUPPLIER_ID, cost: { toNumber: () => 300 } }));
    itemSupplierTaskUpdate.mockResolvedValue(updatedRow({ status: 'RECEIVED' }));
    // Simulates a purchase already existing from the first RECEIVED pass.
    supplierPurchaseFindFirst.mockResolvedValue({ id: 'purchase-existing' });

    await updateItemSupplierTask(TASK_ID, { sortOrder: 1 }, STAFF_ID);

    expect(supplierPurchaseCreate).not.toHaveBeenCalled();
  });

  it('RECEIVED without a supplier does NOT create a payable (no one to owe)', async () => {
    itemSupplierTaskFindFirst.mockResolvedValue(existingTask({ status: 'SENT', supplierId: null, cost: { toNumber: () => 300 } }));
    itemSupplierTaskUpdate.mockResolvedValue(updatedRow({ status: 'RECEIVED', supplierId: null }));

    await updateItemSupplierTask(TASK_ID, { status: 'RECEIVED' }, STAFF_ID);

    expect(supplierPurchaseCreate).not.toHaveBeenCalled();
  });

  it('RECEIVED with no cost recorded does NOT create a payable', async () => {
    itemSupplierTaskFindFirst.mockResolvedValue(existingTask({ status: 'SENT', supplierId: SUPPLIER_ID, cost: null }));
    itemSupplierTaskUpdate.mockResolvedValue(updatedRow({ status: 'RECEIVED', cost: null }));

    await updateItemSupplierTask(TASK_ID, { status: 'RECEIVED' }, STAFF_ID);

    expect(supplierPurchaseCreate).not.toHaveBeenCalled();
  });

  it('two different tasks each independently create their own payable — one task never blocks another', async () => {
    itemSupplierTaskFindFirst.mockResolvedValueOnce(existingTask({ status: 'SENT', supplierId: SUPPLIER_ID, cost: { toNumber: () => 300 } }));
    itemSupplierTaskUpdate.mockResolvedValueOnce(updatedRow({ status: 'RECEIVED' }));
    await updateItemSupplierTask('task-1', { status: 'RECEIVED' }, STAFF_ID);

    itemSupplierTaskFindFirst.mockResolvedValueOnce(
      existingTask({ status: 'SENT', supplierId: SUPPLIER_ID, cost: { toNumber: () => 150 } }),
    );
    itemSupplierTaskUpdate.mockResolvedValueOnce(updatedRow({ status: 'RECEIVED', cost: { toNumber: () => 150 } }));
    await updateItemSupplierTask('task-2', { status: 'RECEIVED' }, STAFF_ID);

    expect(supplierPurchaseCreate).toHaveBeenCalledTimes(2);
  });
});
