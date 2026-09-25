import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Owner decision (2026-09-25) - a customer with non-deleted invoices or
 * quotations cannot be deleted (hard block). Deleting one used to orphan its
 * invoices. Prisma and audit are mocked; the real `canAccessBranch` runs.
 */

const partnerFindUnique = vi.fn();
const partnerUpdate = vi.fn();
const orderCount = vi.fn();
const quotationCount = vi.fn();
const recordAudit = vi.fn().mockResolvedValue(undefined);

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    businessPartner: {
      findUnique: (...args: unknown[]) => partnerFindUnique(...args),
      update: (...args: unknown[]) => partnerUpdate(...args),
    },
    order: { count: (...args: unknown[]) => orderCount(...args) },
    quotation: { count: (...args: unknown[]) => quotationCount(...args) },
  },
}));
vi.mock('../services/auditService.js', () => ({ recordAudit }));
vi.mock('../services/businessPartnerService.js', () => ({
  getBusinessPartnerDto: vi.fn(),
  hasValidContactMethod: vi.fn(),
  mapPartnerToDto: vi.fn(),
}));

const { deleteBusinessPartner } = await import('./businessPartners.js');

const PARTNER_ID = '11111111-1111-1111-1111-111111111111';
const BRANCH_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const auth = { staffId: 'staff-a', branchId: BRANCH_A, roleNames: ['ADMIN'], accessibleBranchIds: [BRANCH_A] };

function makeRes() {
  return {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
}

const req = () => ({ params: { id: PARTNER_ID }, auth }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  partnerFindUnique.mockResolvedValue({ isDeleted: false, branchId: BRANCH_A });
  partnerUpdate.mockResolvedValue({ id: PARTNER_ID, branchId: BRANCH_A });
  orderCount.mockResolvedValue(0);
  quotationCount.mockResolvedValue(0);
});

function expectBlocked(res: ReturnType<typeof makeRes>) {
  expect(res.statusCode).toBe(409);
  expect(partnerUpdate).not.toHaveBeenCalled();
  expect(recordAudit).not.toHaveBeenCalled();
}

describe('deleteBusinessPartner - blocked while the customer has documents', () => {
  it('invoices only: 409 with the count in Arabic, nothing deleted or audited', async () => {
    orderCount.mockResolvedValue(3);
    const res = makeRes();
    await deleteBusinessPartner(req(), res as never);

    expectBlocked(res);
    expect(res.body).toMatchObject({ error: { code: 'PARTNER_HAS_DOCUMENTS', invoiceCount: 3, quotationCount: 0 } });
    expect((res.body as { error: { message: string } }).error.message).toContain('3 فاتورة');
    expect((res.body as { error: { message: string } }).error.message).not.toContain('عرض سعر');
  });

  it('quotations only: blocked too', async () => {
    quotationCount.mockResolvedValue(2);
    const res = makeRes();
    await deleteBusinessPartner(req(), res as never);

    expectBlocked(res);
    expect((res.body as { error: { message: string } }).error.message).toContain('2 عرض سعر');
  });

  it('both: the message lists both', async () => {
    orderCount.mockResolvedValue(1);
    quotationCount.mockResolvedValue(4);
    const res = makeRes();
    await deleteBusinessPartner(req(), res as never);

    expectBlocked(res);
    const message = (res.body as { error: { message: string } }).error.message;
    expect(message).toContain('1 فاتورة');
    expect(message).toContain('4 عرض سعر');
  });

  it('only NON-deleted documents count: the queries filter isDeleted:false for this customer', async () => {
    await deleteBusinessPartner(req(), makeRes() as never);

    expect(orderCount).toHaveBeenCalledWith({ where: { partnerId: PARTNER_ID, isDeleted: false } });
    expect(quotationCount).toHaveBeenCalledWith({ where: { partnerId: PARTNER_ID, isDeleted: false } });
  });
});

describe('deleteBusinessPartner - unchanged behavior', () => {
  it('a customer with no live documents is soft-deleted and audited as before', async () => {
    const res = makeRes();
    await deleteBusinessPartner(req(), res as never);

    expect(partnerUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isDeleted: true, deletedBy: auth.staffId }) }));
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'BusinessPartner', action: 'DELETE' }));
    expect(res.body).toMatchObject({ success: true });
  });

  it('a customer of a branch the caller cannot access is still 403 and the document counts are never even queried', async () => {
    partnerFindUnique.mockResolvedValue({ isDeleted: false, branchId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' });
    const res = makeRes();
    await deleteBusinessPartner(req(), res as never);

    expect(res.statusCode).toBe(403);
    expect(orderCount).not.toHaveBeenCalled();
    expect(partnerUpdate).not.toHaveBeenCalled();
  });

  it('an unknown or already-deleted customer is 404', async () => {
    partnerFindUnique.mockResolvedValue({ isDeleted: true, branchId: BRANCH_A });
    const res = makeRes();
    await deleteBusinessPartner(req(), res as never);

    expect(res.statusCode).toBe(404);
    expect(partnerUpdate).not.toHaveBeenCalled();
  });
});
