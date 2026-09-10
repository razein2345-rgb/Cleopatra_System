import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Gap 1 fix (Task 7 Root-Cause Discovery, 2026-09-10): `query` must match
 * the customer's name (`partner.nameAr`) in addition to the quotation
 * number and item kind it already matched — a natural question naming a
 * customer must resolve without a separate `search_customers` call first.
 * `partnerId`/`status` filtering must stay byte-for-byte unchanged
 * (Regression guard).
 */
const findMany = vi.fn();

vi.mock('../../../lib/prisma.js', () => ({
  prisma: { quotation: { findMany: (...args: unknown[]) => findMany(...args) } },
}));

const { searchQuotationsTool } = await import('./searchQuotations.js');

function quotationItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    quotationId: 'quotation-1',
    itemType: 'MANUAL',
    notes: null,
    description: null,
    readyProductId: null,
    serviceId: null,
    boardsCatalogItemId: null,
    kind: null,
    modelName: null,
    breakdown: null,
    itemTotal: { toNumber: () => 0 },
    sizeFamilyKey: null,
    realSizeLabel: null,
    productionTrack: null,
    groupId: null,
    requiredQuantity: null,
    discountAmount: { toNumber: () => 0 },
    createdAt: new Date('2026-09-01'),
    ...overrides,
  };
}

function quotationRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'quotation-1',
    quotationNumber: 'CLP-QUO-2026-000015',
    branchId: 'branch-1',
    partnerId: 'partner-1',
    partner: { nameAr: 'دكتور حسام مجدى' },
    staffId: 'staff-1',
    date: new Date('2026-09-01'),
    validUntil: null,
    subtotal: { toNumber: () => 100 },
    discountPercent: { toNumber: () => 0 },
    vatOn: false,
    vatAmount: { toNumber: () => 0 },
    finalTotal: { toNumber: () => 100 },
    status: 'DRAFT',
    customerNotes: null,
    internalNotes: null,
    approvalState: 'PENDING',
    version: 1,
    previousVersionId: null,
    nextVersion: null,
    convertedOrderId: null,
    printCount: 0,
    items: [],
    createdAt: new Date('2026-09-01'),
    updatedAt: new Date('2026-09-01'),
    isDeleted: false,
    ...overrides,
  };
}

beforeEach(() => {
  findMany.mockReset();
});

describe('search_quotations tool — customer name matching (Gap 1 fix)', () => {
  it('matches a quotation by the customer name in `query`', async () => {
    findMany.mockResolvedValueOnce([quotationRecord()]);
    const result = (await searchQuotationsTool.execute(
      { query: 'دكتور حسام مجدى' },
      { auth: { permissions: [] } as never },
    )) as Array<{ quotationNumber: string }>;
    expect(result).toHaveLength(1);
    expect(result[0].quotationNumber).toBe('CLP-QUO-2026-000015');
  });

  it('matches a partial substring of the customer name', async () => {
    findMany.mockResolvedValueOnce([quotationRecord()]);
    const result = (await searchQuotationsTool.execute(
      { query: 'حسام مجدى' },
      { auth: { permissions: [] } as never },
    )) as Array<unknown>;
    expect(result).toHaveLength(1);
  });

  it('matches the customer name case-insensitively', async () => {
    findMany.mockResolvedValueOnce([quotationRecord({ partner: { nameAr: 'Dr. Hossam Magdy' } })]);
    const result = (await searchQuotationsTool.execute(
      { query: 'DR. HOSSAM' },
      { auth: { permissions: [] } as never },
    )) as Array<unknown>;
    expect(result).toHaveLength(1);
  });

  it('excludes quotations whose customer name does not match the query', async () => {
    findMany.mockResolvedValueOnce([quotationRecord({ partner: { nameAr: 'شركة أخرى' } })]);
    const result = (await searchQuotationsTool.execute(
      { query: 'حسام مجدى' },
      { auth: { permissions: [] } as never },
    )) as Array<unknown>;
    expect(result).toHaveLength(0);
  });

  it('does not throw for a walk-in quotation with no partner at all', async () => {
    findMany.mockResolvedValueOnce([quotationRecord({ partnerId: null, partner: null })]);
    const result = (await searchQuotationsTool.execute(
      { query: 'حسام' },
      { auth: { permissions: [] } as never },
    )) as Array<unknown>;
    expect(result).toHaveLength(0);
  });
});

describe('search_quotations tool — existing free-text matching (Regression)', () => {
  it('still matches by quotation number', async () => {
    findMany.mockResolvedValueOnce([quotationRecord({ partner: { nameAr: 'شركة أخرى' } })]);
    const result = (await searchQuotationsTool.execute(
      { query: 'CLP-QUO-2026-000015' },
      { auth: { permissions: [] } as never },
    )) as Array<{ quotationNumber: string }>;
    expect(result).toHaveLength(1);
    expect(result[0].quotationNumber).toBe('CLP-QUO-2026-000015');
  });

  it('still matches by item kind', async () => {
    findMany.mockResolvedValueOnce([
      quotationRecord({ partner: { nameAr: 'شركة أخرى' }, items: [quotationItem({ kind: 'كارت شخصي' })] }),
    ]);
    const result = (await searchQuotationsTool.execute(
      { query: 'كارت شخصي' },
      { auth: { permissions: [] } as never },
    )) as Array<unknown>;
    expect(result).toHaveLength(1);
  });

  it('returns an empty array when nothing matches any of the three fields', async () => {
    findMany.mockResolvedValueOnce([quotationRecord({ partner: { nameAr: 'شركة أخرى' }, items: [] })]);
    const result = (await searchQuotationsTool.execute(
      { query: 'غير موجود إطلاقًا' },
      { auth: { permissions: [] } as never },
    )) as Array<unknown>;
    expect(result).toHaveLength(0);
  });
});

describe('search_quotations tool — partnerId/status filtering unchanged (Regression)', () => {
  it('forwards partnerId into the where clause unmodified', async () => {
    findMany.mockResolvedValueOnce([quotationRecord()]);
    await searchQuotationsTool.execute({ partnerId: 'partner-1' }, { auth: { permissions: [] } as never });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isDeleted: false, partnerId: 'partner-1' }),
      }),
    );
  });

  it('forwards status into the where clause unmodified', async () => {
    findMany.mockResolvedValueOnce([quotationRecord()]);
    await searchQuotationsTool.execute({ status: 'SENT' }, { auth: { permissions: [] } as never });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isDeleted: false, status: 'SENT' }),
      }),
    );
  });

  it('queries with no partnerId/status filter when both are omitted', async () => {
    findMany.mockResolvedValueOnce([quotationRecord()]);
    await searchQuotationsTool.execute({}, { auth: { permissions: [] } as never });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isDeleted: false } }),
    );
  });

  it('still includes partner.nameAr in the query so name matching has data to work with', async () => {
    findMany.mockResolvedValueOnce([quotationRecord()]);
    await searchQuotationsTool.execute({}, { auth: { permissions: [] } as never });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({ partner: { select: { nameAr: true } } }),
      }),
    );
  });

  it('returns all matching quotations unfiltered when query is omitted', async () => {
    findMany.mockResolvedValueOnce([quotationRecord(), quotationRecord({ id: 'quotation-2', quotationNumber: 'CLP-QUO-2026-000016' })]);
    const result = (await searchQuotationsTool.execute({}, { auth: { permissions: [] } as never })) as Array<unknown>;
    expect(result).toHaveLength(2);
  });
});
