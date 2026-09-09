import { describe, expect, it, vi } from 'vitest';

/**
 * Mirrors `get_order`'s own internal-notes visibility rule (Phase 1):
 * `quotationService.ts::mapQuotationToDto` only includes `internalNotes`
 * when the caller holds `quotations.edit` — this test locks that the
 * tool passes the caller's real permission through, not a hardcoded
 * `true`/`false`.
 */
const findUnique = vi.fn();

vi.mock('../../../lib/prisma.js', () => ({
  prisma: { quotation: { findUnique: (...args: unknown[]) => findUnique(...args) } },
}));

const { getQuotationTool } = await import('./getQuotation.js');

function quotationRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'quotation-1',
    quotationNumber: 'Q-2026-000001',
    branchId: 'branch-1',
    partnerId: 'partner-1',
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
    internalNotes: 'ملاحظة داخلية حساسة',
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

describe('get_quotation tool', () => {
  it('returns found:false for a missing or soft-deleted quotation', async () => {
    findUnique.mockResolvedValueOnce(null);
    const result = await getQuotationTool.execute(
      { id: '11111111-1111-1111-1111-111111111111' },
      { auth: { permissions: [] } as never },
    );
    expect(result).toEqual({ found: false });
  });

  it('hides internalNotes from a caller without quotations.edit', async () => {
    findUnique.mockResolvedValueOnce(quotationRecord());
    const result = (await getQuotationTool.execute(
      { id: '11111111-1111-1111-1111-111111111111' },
      { auth: { permissions: ['quotations.view'] } as never },
    )) as { found: boolean; quotation: { internalNotes: string | null } };
    expect(result.found).toBe(true);
    expect(result.quotation.internalNotes).toBeNull();
  });

  it('includes internalNotes for a caller with quotations.edit', async () => {
    findUnique.mockResolvedValueOnce(quotationRecord());
    const result = (await getQuotationTool.execute(
      { id: '11111111-1111-1111-1111-111111111111' },
      { auth: { permissions: ['quotations.edit'] } as never },
    )) as { found: boolean; quotation: { internalNotes: string | null } };
    expect(result.quotation.internalNotes).toBe('ملاحظة داخلية حساسة');
  });
});
