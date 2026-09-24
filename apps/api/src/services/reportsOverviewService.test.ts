import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Regression coverage for the order-item-return-history fix's reach into
 * `getReportsOverview`: a return whose `OrderItem` was later replaced by an
 * order edit has `orderItemId: null` but keeps its `orderId`, so it only
 * shows up under the order-level `itemReturns` relation — never under
 * `items[].returns`. Customer debt and per-invoice remaining balance must
 * still subtract it, or a refunded customer silently reads as owing the
 * refunded amount again.
 */

const orderFindMany = vi.fn();
const emptyList = () => Promise.resolve([]);

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    treasuryEntry: { groupBy: () => emptyList(), findMany: () => emptyList() },
    order: { findMany: (...args: unknown[]) => orderFindMany(...args) },
    supplierPurchase: { findMany: () => emptyList() },
    stockMovement: { findMany: () => emptyList() },
    customerOpening: { findMany: () => emptyList() },
    payment: { groupBy: () => emptyList() },
  },
}));

const { getReportsOverview } = await import('./reportsOverviewService.js');

const dec = (n: number) => ({ toNumber: () => n });

describe('getReportsOverview — orphaned returns still reduce what a customer owes', () => {
  beforeEach(() => {
    orderFindMany.mockReset();
  });

  it('customer debt and invoice remaining balance both subtract a return recorded via itemReturns', async () => {
    orderFindMany.mockImplementation((args: { where: { partnerId?: unknown } }) => {
      const base = {
        finalTotal: dec(500),
        payments: [],
        // Only the order-level relation carries this return — the item it
        // was recorded against no longer exists.
        itemReturns: [{ refundAmount: dec(150) }],
      };
      // First query (customer debts) filters on partnerId; second (invoices) doesn't.
      if (args.where.partnerId !== undefined) {
        return Promise.resolve([{ ...base, partnerId: 'partner-1', partner: { nameAr: 'عميل' } }]);
      }
      return Promise.resolve([
        { ...base, id: 'order-1', invoiceNumber: 'INV-1', date: new Date('2026-09-01T00:00:00.000Z'), partner: { nameAr: 'عميل' } },
      ]);
    });

    const overview = await getReportsOverview();

    expect(overview.customerDebts).toEqual([{ partnerId: 'partner-1', nameAr: 'عميل', outstanding: 350 }]);
    expect(overview.totalCustomerDebt).toBe(350);
    expect(overview.salesInvoices[0]!.remainingBalance).toBe(350);
  });

  it('a fully refunded, unpaid order drops out of customer debt entirely', async () => {
    orderFindMany.mockImplementation((args: { where: { partnerId?: unknown } }) => {
      const base = { finalTotal: dec(200), payments: [], itemReturns: [{ refundAmount: dec(200) }] };
      if (args.where.partnerId !== undefined) {
        return Promise.resolve([{ ...base, partnerId: 'partner-1', partner: { nameAr: 'عميل' } }]);
      }
      return Promise.resolve([]);
    });

    const overview = await getReportsOverview();

    expect(overview.customerDebts).toEqual([]);
    expect(overview.totalCustomerDebt).toBe(0);
  });
});
