import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Gap 2a fix (Task 7 Root-Cause Discovery, 2026-09-10): `query` must still
 * find a supplier when a natural question prepends a generic role word
 * ("المورد كمال سعد" must find "كمال سعد") — without turning into broad
 * fuzzy/similarity matching that could return unrelated suppliers. Only a
 * fixed, LEADING-prefix strip of "المورد"/"مورد" is added; every other
 * filtering behavior (substring, case-insensitivity, no-query passthrough)
 * must stay byte-for-byte unchanged (Regression guard).
 */
const listSuppliers = vi.fn();

vi.mock('../../supplierLedgerService.js', () => ({
  listSuppliers: (...args: unknown[]) => listSuppliers(...args),
}));

const { searchSuppliersTool } = await import('./searchSuppliers.js');

function supplier(overrides: Record<string, unknown> = {}) {
  return {
    partnerId: 'supplier-1',
    nameAr: 'كمال سعد',
    phone: '01000000000',
    branchId: 'branch-1',
    paymentTermsDays: null,
    totalPurchases: 1000,
    totalPayments: 400,
    balance: 600,
    ...overrides,
  };
}

beforeEach(() => {
  listSuppliers.mockReset();
});

describe('search_suppliers tool — leading role-word matching (Gap 2a fix)', () => {
  it('finds the supplier by the exact real name', async () => {
    listSuppliers.mockResolvedValueOnce([supplier()]);
    const result = (await searchSuppliersTool.execute({ query: 'كمال سعد' }, { auth: {} as never })) as Array<{
      nameAr: string;
    }>;
    expect(result).toHaveLength(1);
    expect(result[0].nameAr).toBe('كمال سعد');
  });

  it('finds the same supplier when the query prepends "المورد"', async () => {
    listSuppliers.mockResolvedValueOnce([supplier()]);
    const result = (await searchSuppliersTool.execute({ query: 'المورد كمال سعد' }, { auth: {} as never })) as Array<
      unknown
    >;
    expect(result).toHaveLength(1);
  });

  it('finds the same supplier when the query prepends "مورد" (no "ال")', async () => {
    listSuppliers.mockResolvedValueOnce([supplier()]);
    const result = (await searchSuppliersTool.execute({ query: 'مورد كمال سعد' }, { auth: {} as never })) as Array<
      unknown
    >;
    expect(result).toHaveLength(1);
  });

  it('still matches a partial substring of the real name', async () => {
    listSuppliers.mockResolvedValueOnce([supplier()]);
    const result = (await searchSuppliersTool.execute({ query: 'كمال' }, { auth: {} as never })) as Array<unknown>;
    expect(result).toHaveLength(1);
  });

  it('still matches case-insensitively', async () => {
    listSuppliers.mockResolvedValueOnce([supplier({ nameAr: 'Kamal Saad Trading' })]);
    const result = (await searchSuppliersTool.execute({ query: 'KAMAL SAAD' }, { auth: {} as never })) as Array<
      unknown
    >;
    expect(result).toHaveLength(1);
  });

  it('does NOT let "المورد" alone match every supplier', async () => {
    listSuppliers.mockResolvedValueOnce([supplier(), supplier({ partnerId: 'supplier-2', nameAr: 'شركة الأمل للورق' })]);
    const result = (await searchSuppliersTool.execute({ query: 'المورد' }, { auth: {} as never })) as Array<unknown>;
    expect(result).toHaveLength(0);
  });

  it('does NOT let "مورد" alone match every supplier', async () => {
    listSuppliers.mockResolvedValueOnce([supplier(), supplier({ partnerId: 'supplier-2', nameAr: 'شركة الأمل للورق' })]);
    const result = (await searchSuppliersTool.execute({ query: 'مورد' }, { auth: {} as never })) as Array<unknown>;
    expect(result).toHaveLength(0);
  });

  it('returns no results for a name that genuinely does not exist, even with the role-word prefix', async () => {
    listSuppliers.mockResolvedValueOnce([supplier()]);
    const result = (await searchSuppliersTool.execute(
      { query: 'المورد شركة غير موجودة إطلاقًا' },
      { auth: {} as never },
    )) as Array<unknown>;
    expect(result).toHaveLength(0);
  });

  it('does not falsely match an unrelated supplier via the stripped remainder', async () => {
    listSuppliers.mockResolvedValueOnce([
      supplier({ nameAr: 'كمال سعد' }),
      supplier({ partnerId: 'supplier-2', nameAr: 'شركة الأمل للورق' }),
    ]);
    const result = (await searchSuppliersTool.execute({ query: 'المورد كمال سعد' }, { auth: {} as never })) as Array<{
      nameAr: string;
    }>;
    expect(result).toHaveLength(1);
    expect(result[0].nameAr).toBe('كمال سعد');
  });
});

describe('search_suppliers tool — existing behavior unchanged (Regression)', () => {
  it('returns all suppliers unfiltered when query is omitted', async () => {
    listSuppliers.mockResolvedValueOnce([supplier(), supplier({ partnerId: 'supplier-2', nameAr: 'شركة الأمل للورق' })]);
    const result = (await searchSuppliersTool.execute({}, { auth: {} as never })) as Array<unknown>;
    expect(result).toHaveLength(2);
  });

  it('caps results at 20', async () => {
    const many = Array.from({ length: 25 }, (_, i) => supplier({ partnerId: `supplier-${i}`, nameAr: `مورد رقم ${i}` }));
    listSuppliers.mockResolvedValueOnce(many);
    const result = (await searchSuppliersTool.execute({}, { auth: {} as never })) as Array<unknown>;
    expect(result).toHaveLength(20);
  });

  it('returns the supplier objects unmodified (balance/phone/branchId untouched)', async () => {
    listSuppliers.mockResolvedValueOnce([supplier()]);
    const result = (await searchSuppliersTool.execute({ query: 'كمال سعد' }, { auth: {} as never })) as Array<
      Record<string, unknown>
    >;
    expect(result[0]).toEqual(supplier());
  });

  it('requires no permission other than the declared suppliers.view (schema/permission untouched)', () => {
    expect(searchSuppliersTool.requiredPermission).toBe('suppliers.view');
    expect(searchSuppliersTool.requiresSuperAdmin).toBeUndefined();
  });
});
