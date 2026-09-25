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
