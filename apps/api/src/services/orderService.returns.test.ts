import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { mapOrderToDto } from './orderService.js';

/**
 * Accounting audit fix (2026-09-17) — regression coverage for a bug found
 * in `updateOrder`'s full item-replace design: `OrderItemReturn` history
 * used to cascade-hard-delete when its `OrderItem` was replaced by an order
 * edit, silently making `netTotal`/`returnedTotal` revert upward as if the
 * refund never happened (fixed: `orderItemId` is now nullable/`SetNull`,
 * `orderId` is a new direct link, and `mapOrderToDto` sums
 * `order.itemReturns` instead of `item.returns`).
 *
 * Pure/synchronous — `mapOrderToDto` takes a plain (fully-typed) object,
 * same convention as `orderService.discount.test.ts`'s existing
 * pure-helper tests.
 */

const dec = (n: number) => new Prisma.Decimal(n);
const ORDER_ID = '11111111-1111-1111-1111-111111111111';
const ITEM_ID = '22222222-2222-2222-2222-222222222222';

function baseItem(overrides: Partial<Parameters<typeof mapOrderToDto>[0]['items'][number]> = {}) {
  return {
    id: ITEM_ID,
    orderId: ORDER_ID,
    kind: 'INVENTORY_RETAIL',
    modelName: null,
    breakdown: { kind: 'INVENTORY_RETAIL', unitPrice: 50 },
    itemTotal: dec(500),
    sizeFamilyKey: null,
    realSizeLabel: null,
    inventoryItemId: 'inv-1',
    sheetsConsumed: dec(10),
    productionTrack: null,
    workOrderId: null,
    materials: [],
    supplierTasks: [],
    returns: [],
    discountAmount: dec(0),
    preferredSupplierId: null,
    readyProductId: null,
    serviceId: null,
    boardsCatalogItemId: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  } as Parameters<typeof mapOrderToDto>[0]['items'][number];
}

function baseOrder(overrides: Partial<Parameters<typeof mapOrderToDto>[0]> = {}) {
  return {
    id: ORDER_ID,
    invoiceNumber: 'CLP-INV-2026-000001',
    branchId: 'branch-1',
    partnerId: null,
    staffId: 'staff-1',
    date: new Date('2026-09-01T00:00:00.000Z'),
    subtotal: dec(500),
    discountPercent: dec(0),
    vatOn: false,
    vatAmount: dec(0),
    finalTotal: dec(500),
    paymentTerms: null,
    deliveryDate: null,
    customerNotes: null,
    internalNotes: null,
    status: 'CONFIRMED',
    documentTemplateId: null,
    documentOverrides: null,
    documentSnapshot: null,
    quotationOrigin: null,
    workOrders: [],
    payments: [],
    itemReturns: [],
    items: [baseItem()],
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  } as Parameters<typeof mapOrderToDto>[0];
}

describe('mapOrderToDto — returnedTotal survives an order edit (2026-09-17 fix)', () => {
  it('sums returns still attached to a live item, same as before', () => {
    const order = baseOrder({
      items: [baseItem({ returns: [] })],
      itemReturns: [
        {
          id: 'ret-1',
          orderId: ORDER_ID,
          orderItemId: ITEM_ID,
          quantity: dec(3),
          refundAmount: dec(150),
          reason: null,
          recordedById: 'staff-1',
          branchId: 'branch-1',
          createdAt: new Date('2026-09-02T00:00:00.000Z'),
        },
      ],
    });

    const dto = mapOrderToDto(order, true);
    expect(dto.returnedTotal).toBe(150);
    expect(dto.netTotal).toBe(350);
  });

  it('still counts a return whose OrderItem was replaced by a later edit (orderItemId now null)', () => {
    // Simulates the exact bug: the order was edited after the return was
    // recorded, so the OrderItem the return originally pointed at is gone
    // (replaced by a fresh row with no returns of its own) — but the return
    // itself survived (orderItemId: null, orderId still set) and must still
    // reduce netTotal.
    const freshItemAfterEdit = baseItem({ id: 'new-item-id', returns: [] });
    const order = baseOrder({
      items: [freshItemAfterEdit],
      itemReturns: [
        {
          id: 'ret-1',
          orderId: ORDER_ID,
          orderItemId: null,
          quantity: dec(3),
          refundAmount: dec(150),
          reason: null,
          recordedById: 'staff-1',
          branchId: 'branch-1',
          createdAt: new Date('2026-09-02T00:00:00.000Z'),
        },
      ],
    });

    const dto = mapOrderToDto(order, true);
    // Before the fix this would be 0/500 — the orphaned return would be
    // silently dropped because it no longer appears under any item.returns.
    expect(dto.returnedTotal).toBe(150);
    expect(dto.netTotal).toBe(350);
  });

  it('sums multiple returns — one still attached, one orphaned by an edit', () => {
    const order = baseOrder({
      items: [baseItem({ returns: [] })],
      itemReturns: [
        {
          id: 'ret-live',
          orderId: ORDER_ID,
          orderItemId: ITEM_ID,
          quantity: dec(1),
          refundAmount: dec(50),
          reason: null,
          recordedById: 'staff-1',
          branchId: 'branch-1',
          createdAt: new Date('2026-09-02T00:00:00.000Z'),
        },
        {
          id: 'ret-orphaned',
          orderId: ORDER_ID,
          orderItemId: null,
          quantity: dec(2),
          refundAmount: dec(100),
          reason: null,
          recordedById: 'staff-1',
          branchId: 'branch-1',
          createdAt: new Date('2026-09-03T00:00:00.000Z'),
        },
      ],
    });

    const dto = mapOrderToDto(order, true);
    expect(dto.returnedTotal).toBe(150);
    expect(dto.netTotal).toBe(350);
  });
});
