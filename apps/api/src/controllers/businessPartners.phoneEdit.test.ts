import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Editing a CUSTOMER's phone number to one that already exists (owner decision, 2026-09-25): refused with a
 * 409 unless the user saw the warning and chose to go on - but only when the number actually CHANGES, so an
 * unrelated edit of a customer that already shares a number is never blocked, and the customer never
 * collides with itself. Prisma, the phone lookup and audit are mocked; the real `canAccessBranch` and
 * `normalizePhoneKey` run.
 */

const partnerFind = vi.fn();
const partnerUpdate = vi.fn();
const assertNoDuplicatePhone = vi.fn();
const recordAudit = vi.fn().mockResolvedValue(undefined);

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    businessPartner: {
      findUnique: (...a: unknown[]) => partnerFind(...a),
      update: (...a: unknown[]) => partnerUpdate(...a),
    },
  },
}));
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

const { updateBusinessPartner } = await import('./businessPartners.js');

const PARTNER_ID = '11111111-1111-1111-1111-111111111111';
const BRANCH_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const auth = { staffId: 'staff-a', branchId: BRANCH_A, roleNames: ['SALES'], accessibleBranchIds: [BRANCH_A] };
const existing = { id: PARTNER_ID, nameAr: 'عميل', branchId: BRANCH_A, phone: '01011112222', roles: ['CUSTOMER'], isDeleted: false, status: 'ACTIVE' };

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

const editReq = (body: Record<string, unknown>) => ({ params: { id: PARTNER_ID }, body, auth }) as never;

async function duplicateError() {
  const { DuplicatePhoneError } = await import('../services/leadService.js');
  return new (DuplicatePhoneError as new (m: unknown[]) => Error)([{ kind: 'partner', id: 'p2', name: 'شركة النور', branchId: BRANCH_A, detail: 'ACTIVE' }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  partnerFind.mockResolvedValue(existing);
  partnerUpdate.mockResolvedValue({ ...existing, tags: [] });
});

describe('updateBusinessPartner - phone number', () => {
  it('a new number that belongs to someone else is a 409 - the customer is not changed and nothing is audited', async () => {
    assertNoDuplicatePhone.mockRejectedValue(await duplicateError());
    const res = makeRes();
    await updateBusinessPartner(editReq({ phone: '01099998888' }), res as never);
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'DUPLICATE_PHONE' } });
    expect(assertNoDuplicatePhone).toHaveBeenCalledWith('01099998888', { includeLeads: true, excludePartnerId: PARTNER_ID });
    expect(partnerUpdate).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('re-typing the SAME number in another format is not a change: no check, the edit goes through', async () => {
    await updateBusinessPartner(editReq({ phone: '+20 101 111 2222' }), makeRes() as never);
    expect(assertNoDuplicatePhone).not.toHaveBeenCalled();
    expect(partnerUpdate).toHaveBeenCalledTimes(1);
  });

  it('an edit that does not touch the phone never runs the check', async () => {
    await updateBusinessPartner(editReq({ nameAr: 'اسم جديد' }), makeRes() as never);
    expect(assertNoDuplicatePhone).not.toHaveBeenCalled();
    expect(partnerUpdate).toHaveBeenCalledTimes(1);
  });

  it('clearing the phone is never checked', async () => {
    await updateBusinessPartner(editReq({ phone: null }), makeRes() as never);
    expect(assertNoDuplicatePhone).not.toHaveBeenCalled();
    expect(partnerUpdate).toHaveBeenCalledTimes(1);
  });

  it('allowDuplicate skips the check, and the flag itself is never stored or audited', async () => {
    await updateBusinessPartner(editReq({ phone: '01099998888', allowDuplicate: true }), makeRes() as never);
    expect(assertNoDuplicatePhone).not.toHaveBeenCalled();
    const stored = (partnerUpdate.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(stored).not.toHaveProperty('allowDuplicate');
    expect(stored.phone).toBe('01099998888');
    const audited = (recordAudit.mock.calls[0]![0] as { newValue: Record<string, unknown> }).newValue;
    expect(audited).not.toHaveProperty('allowDuplicate');
  });

  it('a genuinely new number is saved and audited', async () => {
    assertNoDuplicatePhone.mockResolvedValue(undefined);
    const res = makeRes();
    await updateBusinessPartner(editReq({ phone: '01077778888' }), res as never);
    expect(partnerUpdate).toHaveBeenCalledTimes(1);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE', branchId: BRANCH_A }));
    expect(res.body).toMatchObject({ success: true });
  });

  it('a supplier-only partner is not checked against customers', async () => {
    partnerFind.mockResolvedValue({ ...existing, roles: ['SUPPLIER'] });
    await updateBusinessPartner(editReq({ phone: '01099998888' }), makeRes() as never);
    expect(assertNoDuplicatePhone).not.toHaveBeenCalled();
    expect(partnerUpdate).toHaveBeenCalledTimes(1);
  });

  it('a supplier who is made a customer in the same edit IS checked', async () => {
    partnerFind.mockResolvedValue({ ...existing, roles: ['SUPPLIER'] });
    assertNoDuplicatePhone.mockResolvedValue(undefined);
    await updateBusinessPartner(editReq({ phone: '01099998888', roles: ['CUSTOMER', 'SUPPLIER'] }), makeRes() as never);
    expect(assertNoDuplicatePhone).toHaveBeenCalledTimes(1);
  });

  it('a customer in a branch the caller cannot access is still 403 and never reaches the phone check', async () => {
    partnerFind.mockResolvedValue({ ...existing, branchId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' });
    const res = makeRes();
    await updateBusinessPartner(editReq({ phone: '01099998888' }), res as never);
    expect(res.statusCode).toBe(403);
    expect(assertNoDuplicatePhone).not.toHaveBeenCalled();
    expect(partnerUpdate).not.toHaveBeenCalled();
  });
});
