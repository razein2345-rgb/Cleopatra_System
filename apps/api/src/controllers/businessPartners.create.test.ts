import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Duplicate detection when a CUSTOMER is created (owner decision, 2026-09-25): a number that already
 * belongs to a customer or an open lead is refused with a 409 unless the user saw the warning and chose
 * to go on. Suppliers are a different list and are not checked. Prisma, the phone lookup and audit are
 * mocked; the real `canAccessBranch` runs.
 */

const partnerCreate = vi.fn();
const assertNoDuplicatePhone = vi.fn();
const recordAudit = vi.fn().mockResolvedValue(undefined);

vi.mock('../lib/prisma.js', () => ({ prisma: { businessPartner: { create: (...a: unknown[]) => partnerCreate(...a) } } }));
vi.mock('../services/auditService.js', () => ({ recordAudit }));
vi.mock('../services/businessPartnerService.js', () => ({
  getBusinessPartnerDto: vi.fn(),
  hasValidContactMethod: () => true,
  mapPartnerToDto: (p: unknown) => p,
}));
vi.mock('../services/leadService.js', () => ({
  assertNoDuplicatePhone,
  DuplicatePhoneError: class DuplicatePhoneError extends Error {
    constructor(public readonly matches: unknown[] = []) {
      super('duplicate');
    }
  },
}));

const { createBusinessPartner } = await import('./businessPartners.js');

const BRANCH_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BRANCH_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const auth = { staffId: 'staff-a', branchId: BRANCH_A, roleNames: ['SALES'], accessibleBranchIds: [BRANCH_A] };

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

const createReq = (body: Record<string, unknown>) => ({ body: { nameAr: 'شركة جديدة', branchId: BRANCH_A, ...body }, auth }) as never;

async function duplicateError(matches: unknown[]) {
  const { DuplicatePhoneError } = await import('../services/leadService.js');
  return new (DuplicatePhoneError as new (m: unknown[]) => Error)(matches);
}

beforeEach(() => {
  vi.clearAllMocks();
  partnerCreate.mockResolvedValue({ id: 'new-partner', branchId: BRANCH_A });
});

describe('createBusinessPartner - duplicate phone', () => {
  it('a customer whose phone already exists is a 409 DUPLICATE_PHONE - nothing is created or audited', async () => {
    assertNoDuplicatePhone.mockRejectedValue(await duplicateError([{ kind: 'lead', id: 'l1', name: 'ليد النور', branchId: BRANCH_A, detail: 'NEW' }]));
    const res = makeRes();
    await createBusinessPartner(createReq({ phone: '01011112222' }), res as never);
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'DUPLICATE_PHONE', matches: [{ id: 'l1' }] } });
    expect(assertNoDuplicatePhone).toHaveBeenCalledWith('01011112222', { includeLeads: true });
    expect(partnerCreate).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('a match in a branch the caller cannot access is only counted, never described', async () => {
    assertNoDuplicatePhone.mockRejectedValue(await duplicateError([{ kind: 'partner', id: 'p-b', name: 'عميل سري', branchId: BRANCH_B, detail: null }]));
    const res = makeRes();
    await createBusinessPartner(createReq({ phone: '01011112222' }), res as never);
    expect(JSON.stringify(res.body)).not.toContain('عميل سري');
    expect(res.body).toMatchObject({ error: { matches: [], hiddenCount: 1 } });
  });

  it('allowDuplicate skips the check, creates the customer, and the flag is never stored', async () => {
    const res = makeRes();
    await createBusinessPartner(createReq({ phone: '01011112222', allowDuplicate: true }), res as never);
    expect(assertNoDuplicatePhone).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(201);
    const stored = (partnerCreate.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(stored).not.toHaveProperty('allowDuplicate');
    expect(stored.phone).toBe('01011112222');
    const audited = (recordAudit.mock.calls[0]![0] as { newValue: Record<string, unknown> }).newValue;
    expect(audited).not.toHaveProperty('allowDuplicate');
  });

  it('a customer with no phone is never checked', async () => {
    const res = makeRes();
    await createBusinessPartner(createReq({}), res as never);
    expect(assertNoDuplicatePhone).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(201);
  });

  it('a supplier (only the SUPPLIER role) is not checked against customers', async () => {
    await createBusinessPartner(createReq({ phone: '01011112222', roles: ['SUPPLIER'] }), makeRes() as never);
    expect(assertNoDuplicatePhone).not.toHaveBeenCalled();
    expect(partnerCreate).toHaveBeenCalledTimes(1);
  });

  it('a partner that is a customer AND a supplier is checked', async () => {
    assertNoDuplicatePhone.mockResolvedValue(undefined);
    await createBusinessPartner(createReq({ phone: '01011112222', roles: ['CUSTOMER', 'SUPPLIER'] }), makeRes() as never);
    expect(assertNoDuplicatePhone).toHaveBeenCalledTimes(1);
  });

  it('a new number is created normally and audited under its branch', async () => {
    assertNoDuplicatePhone.mockResolvedValue(undefined);
    const res = makeRes();
    await createBusinessPartner(createReq({ phone: '01088889999', roles: ['CUSTOMER'] }), res as never);
    expect(res.statusCode).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', branchId: BRANCH_A }));
  });

  it('creating under a branch the caller cannot access is still 403 and never reaches the phone check', async () => {
    const res = makeRes();
    await createBusinessPartner(createReq({ phone: '01011112222', branchId: BRANCH_B }), res as never);
    expect(res.statusCode).toBe(403);
    expect(assertNoDuplicatePhone).not.toHaveBeenCalled();
    expect(partnerCreate).not.toHaveBeenCalled();
  });
});
