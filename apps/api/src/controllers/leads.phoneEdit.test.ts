import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Editing a lead's phone number to one that already exists (owner decision, 2026-09-25): refused with a
 * 409 unless the user saw the warning and chose to go on - but only when the number actually CHANGES, so
 * an unrelated edit of a lead that already shares a number is never blocked. Services and audit are
 * mocked; the real `canAccessBranch` and `normalizePhoneKey` run.
 */

const getLead = vi.fn();
const getLeadBranchId = vi.fn();
const updateLead = vi.fn();
const assertNoDuplicatePhone = vi.fn();
const recordAudit = vi.fn().mockResolvedValue(undefined);

vi.mock('../services/leadService.js', () => ({
  getLead,
  getLeadBranchId,
  updateLead,
  assertNoDuplicatePhone,
  DuplicatePhoneError: class DuplicatePhoneError extends Error {
    constructor(public readonly matches: unknown[] = []) {
      super('duplicate');
    }
  },
  LeadNotFoundError: class LeadNotFoundError extends Error {},
  LeadAlreadyResolvedError: class LeadAlreadyResolvedError extends Error {},
  listLeads: vi.fn(),
  createLead: vi.fn(),
  advanceLeadStage: vi.fn(),
  rejectLead: vi.fn(),
  convertLeadToPartner: vi.fn(),
  deleteLead: vi.fn(),
  bulkCreateLeads: vi.fn(),
}));
vi.mock('../services/leadImportParser.js', () => ({ LeadImportParseError: class LeadImportParseError extends Error {}, parseLeadImportFile: vi.fn() }));
vi.mock('../services/auditService.js', () => ({ recordAudit }));

const { updateLeadHandler } = await import('./leads.js');

const LEAD_ID = '11111111-1111-1111-1111-111111111111';
const BRANCH_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const salesA = { staffId: 'staff-a', branchId: BRANCH_A, roleNames: ['SALES'], accessibleBranchIds: [BRANCH_A] };
const current = { id: LEAD_ID, branchId: BRANCH_A, phone: '01011112222' };

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

const editReq = (body: Record<string, unknown>) => ({ params: { id: LEAD_ID }, body, auth: salesA }) as never;

async function duplicateError() {
  const { DuplicatePhoneError } = await import('../services/leadService.js');
  return new (DuplicatePhoneError as new (m: unknown[]) => Error)([{ kind: 'partner', id: 'p1', name: 'شركة النور', branchId: BRANCH_A, detail: 'ACTIVE' }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  getLeadBranchId.mockResolvedValue(BRANCH_A);
  updateLead.mockResolvedValue({ id: LEAD_ID, branchId: BRANCH_A });
});

describe('updateLeadHandler - phone number', () => {
  it('a new number that belongs to someone else is a 409 - the lead is not changed and nothing is audited', async () => {
    getLead.mockResolvedValue(current);
    assertNoDuplicatePhone.mockRejectedValue(await duplicateError());
    const res = makeRes();
    await updateLeadHandler(editReq({ phone: '01099998888' }), res as never);
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'DUPLICATE_PHONE' } });
    expect(assertNoDuplicatePhone).toHaveBeenCalledWith('01099998888', { includeLeads: true, excludeLeadId: LEAD_ID });
    expect(updateLead).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('re-typing the SAME number in another format is not a change: no check, the edit goes through', async () => {
    getLead.mockResolvedValue(current);
    await updateLeadHandler(editReq({ phone: '+20 101 111 2222' }), makeRes() as never);
    expect(assertNoDuplicatePhone).not.toHaveBeenCalled();
    expect(updateLead).toHaveBeenCalledTimes(1);
  });

  it('an edit that does not touch the phone never runs the check', async () => {
    await updateLeadHandler(editReq({ name: 'اسم جديد' }), makeRes() as never);
    expect(assertNoDuplicatePhone).not.toHaveBeenCalled();
    expect(getLead).not.toHaveBeenCalled();
  });

  it('allowDuplicate skips the check, and the flag itself is never passed on to be stored', async () => {
    await updateLeadHandler(editReq({ phone: '01099998888', allowDuplicate: true }), makeRes() as never);
    expect(assertNoDuplicatePhone).not.toHaveBeenCalled();
    expect(updateLead).toHaveBeenCalledWith(LEAD_ID, { phone: '01099998888' });
  });

  it('a genuinely new number is saved', async () => {
    getLead.mockResolvedValue(current);
    assertNoDuplicatePhone.mockResolvedValue(undefined);
    const res = makeRes();
    await updateLeadHandler(editReq({ phone: '01077778888' }), res as never);
    expect(updateLead).toHaveBeenCalledWith(LEAD_ID, { phone: '01077778888' });
    expect(res.body).toMatchObject({ success: true });
  });
});
