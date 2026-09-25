import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * First automated tests for the Leads controller (CRM review, 2026-09-25).
 * Locks the branch-access rule found in that review: every lead action is checked against
 * the LEAD's own branch (never the caller's home branch), a list only returns the branches
 * the caller can access, and a rejected action writes and audits nothing. The real
 * `canAccessBranch` runs; services and audit are mocked (same technique as `cutover.test.ts`).
 */

const listLeads = vi.fn();
const getLead = vi.fn();
const getLeadBranchId = vi.fn();
const createLead = vi.fn();
const updateLead = vi.fn();
const advanceLeadStage = vi.fn();
const rejectLead = vi.fn();
const convertLeadToPartner = vi.fn();
const deleteLead = vi.fn();
const bulkCreateLeads = vi.fn();
const assertNoDuplicatePhone = vi.fn();
const recordAudit = vi.fn().mockResolvedValue(undefined);

vi.mock('../services/leadService.js', () => ({
  listLeads,
  getLead,
  getLeadBranchId,
  createLead,
  updateLead,
  advanceLeadStage,
  rejectLead,
  convertLeadToPartner,
  deleteLead,
  bulkCreateLeads,
  assertNoDuplicatePhone,
  DuplicatePhoneError: class DuplicatePhoneError extends Error {
    constructor(public readonly matches: unknown[] = []) {
      super('duplicate');
    }
  },
  LeadNotFoundError: class LeadNotFoundError extends Error {},
  LeadAlreadyResolvedError: class LeadAlreadyResolvedError extends Error {},
}));
vi.mock('../services/leadImportParser.js', () => ({ LeadImportParseError: class LeadImportParseError extends Error {}, parseLeadImportFile: vi.fn() }));
vi.mock('../services/auditService.js', () => ({ recordAudit }));

const handlers = await import('./leads.js');

const LEAD_ID = '11111111-1111-1111-1111-111111111111';
const BRANCH_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BRANCH_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

interface FakeAuth {
  staffId: string;
  branchId: string;
  roleNames: string[];
  accessibleBranchIds: string[];
}

/** A SALES-style caller: home branch A, no access to B. */
const salesA: FakeAuth = { staffId: 'staff-a', branchId: BRANCH_A, roleNames: ['SALES'], accessibleBranchIds: [BRANCH_A] };
const superAdmin: FakeAuth = { staffId: 'root', branchId: BRANCH_A, roleNames: ['SUPER_ADMIN'], accessibleBranchIds: [BRANCH_A] };

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

const idReq = (auth: FakeAuth, body: unknown = {}) => ({ params: { id: LEAD_ID }, body, auth }) as never;

function expectNothingWritten() {
  expect(updateLead).not.toHaveBeenCalled();
  expect(advanceLeadStage).not.toHaveBeenCalled();
  expect(rejectLead).not.toHaveBeenCalled();
  expect(convertLeadToPartner).not.toHaveBeenCalled();
  expect(deleteLead).not.toHaveBeenCalled();
  expect(recordAudit).not.toHaveBeenCalled();
}

const leadDto = (branchId: string) => ({ id: LEAD_ID, branchId, name: 'عميل محتمل', phone: '01000000000', stage: 'NEW' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('list / get - branch scoping', () => {
  it('a branch-scoped caller only asks for the branches they can access', async () => {
    listLeads.mockResolvedValue([]);
    await handlers.listLeadsHandler({ auth: salesA } as never, makeRes() as never);
    expect(listLeads).toHaveBeenCalledWith({ branchIds: [BRANCH_A] });
  });

  it('a SUPER_ADMIN is not filtered', async () => {
    listLeads.mockResolvedValue([]);
    await handlers.listLeadsHandler({ auth: superAdmin } as never, makeRes() as never);
    expect(listLeads).toHaveBeenCalledWith({ branchIds: undefined });
  });

  it('getting a lead of another branch is 403 and returns nothing', async () => {
    getLead.mockResolvedValue(leadDto(BRANCH_B));
    const res = makeRes();
    await handlers.getLeadHandler(idReq(salesA), res as never);
    expect(res.statusCode).toBe(403);
    expect(res.body).not.toMatchObject({ success: true });
  });

  it('getting an unknown lead is 404; getting an accessible one works', async () => {
    getLead.mockResolvedValueOnce(null);
    const notFound = makeRes();
    await handlers.getLeadHandler(idReq(salesA), notFound as never);
    expect(notFound.statusCode).toBe(404);

    getLead.mockResolvedValueOnce(leadDto(BRANCH_A));
    const ok = makeRes();
    await handlers.getLeadHandler(idReq(salesA), ok as never);
    expect(ok.body).toMatchObject({ success: true });
  });
});

describe('create - branch access (unchanged rule, now covered)', () => {
  const createReq = (auth: FakeAuth, branchId: string) => ({ body: { name: 'عميل', phone: '01000000000', branchId }, auth }) as never;

  it('creating under a branch the caller cannot access is 403 and writes nothing', async () => {
    const res = makeRes();
    await handlers.createLeadHandler(createReq(salesA, BRANCH_B), res as never);
    expect(res.statusCode).toBe(403);
    expect(createLead).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('under an accessible branch it is created and audited under that branch', async () => {
    createLead.mockResolvedValue({ id: LEAD_ID, branchId: BRANCH_A, name: 'عميل', phone: '01000000000', source: null });
    const res = makeRes();
    await handlers.createLeadHandler(createReq(salesA, BRANCH_A), res as never);
    expect(res.statusCode).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', branchId: BRANCH_A }));
  });
});

describe('update / stage / reject / convert / delete - the lead\'s own branch decides', () => {
  const actions: Array<[string, (auth: FakeAuth) => Promise<unknown>]> = [
    ['update', (auth) => handlers.updateLeadHandler(idReq(auth, { name: 'اسم جديد' }), makeRes() as never)],
    ['advance stage', (auth) => handlers.advanceLeadStageHandler(idReq(auth, { stage: 'CONTACTED' }), makeRes() as never)],
    ['reject', (auth) => handlers.rejectLeadHandler(idReq(auth, { reason: 'مش مهتم' }), makeRes() as never)],
    ['convert to customer', (auth) => handlers.convertLeadHandler(idReq(auth), makeRes() as never)],
    ['delete', (auth) => handlers.deleteLeadHandler(idReq(auth), makeRes() as never)],
  ];

  for (const [name, run] of actions) {
    it(`${name}: a lead of a branch the caller cannot access is rejected and nothing is written or audited`, async () => {
      getLeadBranchId.mockResolvedValue(BRANCH_B);
      await run(salesA);
      expectNothingWritten();
    });

    it(`${name}: an unknown / deleted lead is 404 and nothing is written`, async () => {
      const { LeadNotFoundError } = await import('../services/leadService.js');
      getLeadBranchId.mockRejectedValue(new (LeadNotFoundError as new () => Error)());
      await run(salesA);
      expectNothingWritten();
    });
  }

  it('the rejection is a 403 for a branch the caller cannot access', async () => {
    getLeadBranchId.mockResolvedValue(BRANCH_B);
    const res = makeRes();
    await handlers.convertLeadHandler(idReq(salesA), res as never);
    expect(res.statusCode).toBe(403);
  });

  it('converting an accessible lead works and both audit rows carry the lead\'s branch', async () => {
    getLeadBranchId.mockResolvedValue(BRANCH_A);
    convertLeadToPartner.mockResolvedValue({ leadId: LEAD_ID, partnerId: 'partner-1', partner: { branchId: BRANCH_A } });
    const res = makeRes();
    await handlers.convertLeadHandler(idReq(salesA), res as never);
    expect(res.statusCode).toBe(201);
    expect(recordAudit.mock.calls.map((c) => (c[0] as { branchId: string }).branchId)).toEqual([BRANCH_A, BRANCH_A]);
  });

  it('moving a lead to a branch the caller cannot access is rejected even when the source branch is theirs', async () => {
    getLeadBranchId.mockResolvedValue(BRANCH_A);
    const res = makeRes();
    await handlers.updateLeadHandler(idReq(salesA, { branchId: BRANCH_B }), res as never);
    expect(res.statusCode).toBe(403);
    expectNothingWritten();
  });

  it('deleting an accessible lead soft-deletes it and audits under the lead\'s branch (the audit row used to have none)', async () => {
    getLeadBranchId.mockResolvedValue(BRANCH_A);
    deleteLead.mockResolvedValue(undefined);
    await handlers.deleteLeadHandler(idReq(salesA), makeRes() as never);
    expect(deleteLead).toHaveBeenCalledWith(LEAD_ID, salesA.staffId);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE', branchId: BRANCH_A }));
  });

  it('a SUPER_ADMIN may act on a lead of any branch', async () => {
    getLeadBranchId.mockResolvedValue(BRANCH_B);
    advanceLeadStage.mockResolvedValue({ id: LEAD_ID, branchId: BRANCH_B, stage: 'CONTACTED' });
    const res = makeRes();
    await handlers.advanceLeadStageHandler(idReq(superAdmin, { stage: 'CONTACTED' }), res as never);
    expect(advanceLeadStage).toHaveBeenCalledTimes(1);
    expect(res.body).toMatchObject({ success: true });
  });
});

describe('import - branch access (unchanged rule, now covered)', () => {
  it('importing into a branch the caller cannot access is 403 and nothing is created', async () => {
    const res = makeRes();
    await handlers.importLeadsHandler({ body: { branchId: BRANCH_B, rows: [{ rowNumber: 2, name: 'عميل', phone: '01000000000' }] }, auth: salesA } as never, res as never);
    expect(res.statusCode).toBe(403);
    expect(bulkCreateLeads).not.toHaveBeenCalled();
  });
});

describe('duplicate phone numbers (owner decision, 2026-09-25)', () => {
  const createReq = (body: Record<string, unknown> = {}) =>
    ({ body: { name: 'عميل', phone: '01011112222', branchId: BRANCH_A, ...body }, auth: salesA }) as never;

  async function duplicateError(matches: Array<{ kind: 'partner' | 'lead'; id: string; name: string; branchId: string; detail: string | null }>) {
    const { DuplicatePhoneError } = await import('../services/leadService.js');
    return new (DuplicatePhoneError as new (m: unknown[]) => Error)(matches);
  }

  it('creating a lead whose phone already exists is a 409 DUPLICATE_PHONE naming the match - nothing is created', async () => {
    assertNoDuplicatePhone.mockRejectedValue(await duplicateError([{ kind: 'partner', id: 'p1', name: 'شركة النور', branchId: BRANCH_A, detail: 'ACTIVE' }]));
    const res = makeRes();
    await handlers.createLeadHandler(createReq(), res as never);
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'DUPLICATE_PHONE', hiddenCount: 0, matches: [{ id: 'p1' }] } });
    expect((res.body as { error: { message: string } }).error.message).toContain('شركة النور');
    expect(assertNoDuplicatePhone).toHaveBeenCalledWith('01011112222', { includeLeads: true });
    expect(createLead).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('a match in a branch the caller cannot access is only COUNTED, never described (no cross-branch read)', async () => {
    assertNoDuplicatePhone.mockRejectedValue(
      await duplicateError([
        { kind: 'partner', id: 'p-b', name: 'عميل فرع تاني', branchId: BRANCH_B, detail: null },
        { kind: 'lead', id: 'l-a', name: 'ليد فرعي', branchId: BRANCH_A, detail: 'NEW' },
      ]),
    );
    const res = makeRes();
    await handlers.createLeadHandler(createReq(), res as never);
    const error = (res.body as { error: { matches: Array<{ id: string }>; hiddenCount: number; message: string } }).error;
    expect(error.matches.map((m) => m.id)).toEqual(['l-a']);
    expect(error.hiddenCount).toBe(1);
    expect(JSON.stringify(res.body)).not.toContain('عميل فرع تاني');
  });

  it('when every match is in another branch the message does not name it', async () => {
    assertNoDuplicatePhone.mockRejectedValue(await duplicateError([{ kind: 'partner', id: 'p-b', name: 'سري', branchId: BRANCH_B, detail: null }]));
    const res = makeRes();
    await handlers.createLeadHandler(createReq(), res as never);
    expect(JSON.stringify(res.body)).not.toContain('سري');
    expect(res.body).toMatchObject({ error: { code: 'DUPLICATE_PHONE', matches: [], hiddenCount: 1 } });
  });

  it('allowDuplicate skips the check and creates the lead', async () => {
    createLead.mockResolvedValue({ id: LEAD_ID, branchId: BRANCH_A, name: 'عميل', phone: '01011112222', source: null });
    const res = makeRes();
    await handlers.createLeadHandler(createReq({ allowDuplicate: true }), res as never);
    expect(assertNoDuplicatePhone).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(201);
  });

  it('a new phone number is created normally', async () => {
    assertNoDuplicatePhone.mockResolvedValue(undefined);
    createLead.mockResolvedValue({ id: LEAD_ID, branchId: BRANCH_A, name: 'عميل', phone: '01011112222', source: null });
    const res = makeRes();
    await handlers.createLeadHandler(createReq(), res as never);
    expect(res.statusCode).toBe(201);
  });

  it('converting to a customer that already exists is a 409 with the match, and nothing is written', async () => {
    getLeadBranchId.mockResolvedValue(BRANCH_A);
    convertLeadToPartner.mockRejectedValue(await duplicateError([{ kind: 'partner', id: 'p1', name: 'شركة النور', branchId: BRANCH_A, detail: 'ACTIVE' }]));
    const res = makeRes();
    await handlers.convertLeadHandler(idReq(salesA), res as never);
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'DUPLICATE_PHONE', matches: [{ id: 'p1' }] } });
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('converting with allowDuplicate passes the choice to the service', async () => {
    getLeadBranchId.mockResolvedValue(BRANCH_A);
    convertLeadToPartner.mockResolvedValue({ leadId: LEAD_ID, partnerId: 'partner-2', partner: { branchId: BRANCH_A } });
    await handlers.convertLeadHandler(idReq(salesA, { allowDuplicate: true }), makeRes() as never);
    expect(convertLeadToPartner).toHaveBeenCalledWith(LEAD_ID, { allowDuplicate: true });
  });

  it('import passes allowDuplicates through and reports per-row results', async () => {
    bulkCreateLeads.mockResolvedValue([{ rowNumber: 2, success: false, error: 'الرقم موجود بالفعل عند عميل "س"' }]);
    const res = makeRes();
    await handlers.importLeadsHandler(
      { body: { branchId: BRANCH_A, allowDuplicates: true, rows: [{ rowNumber: 2, name: 'عميل', phone: '01011112222' }] }, auth: salesA } as never,
      res as never,
    );
    expect(bulkCreateLeads).toHaveBeenCalledWith(expect.any(Array), BRANCH_A, undefined, salesA.staffId, { allowDuplicates: true });
    expect(res.body).toMatchObject({ success: true, data: { successCount: 0, failCount: 1 } });
  });
});
