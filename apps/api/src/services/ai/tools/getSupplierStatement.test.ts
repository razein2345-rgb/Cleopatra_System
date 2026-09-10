import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * `get_supplier_statement` is a pure pass-through to
 * `supplierLedgerService.ts::getSupplierStatement` — these tests lock in
 * that it forwards the real from/to dates unmodified and reports
 * found:false rather than inventing a statement for an unknown supplier.
 */
const getSupplierStatement = vi.fn();

vi.mock('../../supplierLedgerService.js', () => ({
  getSupplierStatement: (...args: unknown[]) => getSupplierStatement(...args),
}));

const { getSupplierStatementTool } = await import('./getSupplierStatement.js');

beforeEach(() => {
  getSupplierStatement.mockReset();
});

describe('get_supplier_statement tool', () => {
  it('returns found:false when the underlying service returns null', async () => {
    getSupplierStatement.mockResolvedValueOnce(null);
    const result = await getSupplierStatementTool.execute(
      { partnerId: '11111111-1111-1111-1111-111111111111' },
      { auth: {} as never },
    );
    expect(result).toEqual({ found: false });
  });

  it('forwards partnerId with no dates when from/to are omitted', async () => {
    getSupplierStatement.mockResolvedValueOnce({
      partnerId: '11111111-1111-1111-1111-111111111111',
      nameAr: 'مورد تجريبي',
      openingBalance: 0,
      entries: [],
      closingBalance: 0,
    });
    await getSupplierStatementTool.execute({ partnerId: '11111111-1111-1111-1111-111111111111' }, { auth: {} as never });
    expect(getSupplierStatement).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111', undefined, undefined);
  });

  it('converts from/to strings into real Date objects unmodified', async () => {
    getSupplierStatement.mockResolvedValueOnce(null);
    await getSupplierStatementTool.execute(
      { partnerId: '11111111-1111-1111-1111-111111111111', from: '2026-08-01', to: '2026-08-31' },
      { auth: {} as never },
    );
    const [, from, to] = getSupplierStatement.mock.calls[0]!;
    expect((from as Date).toISOString().slice(0, 10)).toBe('2026-08-01');
    expect((to as Date).toISOString().slice(0, 10)).toBe('2026-08-31');
  });

  it('returns found:true with the real statement when the supplier exists', async () => {
    const statement = {
      partnerId: '11111111-1111-1111-1111-111111111111',
      nameAr: 'مورد تجريبي',
      openingBalance: 100,
      entries: [{ kind: 'PURCHASE', id: 'p1', date: '2026-08-05T00:00:00.000Z', description: null, amount: 50, runningBalance: 150 }],
      closingBalance: 150,
    };
    getSupplierStatement.mockResolvedValueOnce(statement);
    const result = await getSupplierStatementTool.execute(
      { partnerId: '11111111-1111-1111-1111-111111111111' },
      { auth: {} as never },
    );
    expect(result).toEqual({ found: true, statement });
  });
});
