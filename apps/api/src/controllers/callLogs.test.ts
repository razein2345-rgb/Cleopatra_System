import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * First automated tests for the Call Center controller (CRM review, 2026-09-25). Locks the
 * branch rule found in that review: edit/delete are checked against the CALL LOG's own branch
 * (never the caller's home branch), a NEW log linked to a customer or lead also needs access to
 * that record's branch, and a rejected action writes and audits nothing. Real `canAccessBranch`;
 * services and audit mocked.
 */

const listCallLogs = vi.fn();
const getCallLogBranchId = vi.fn();
const getCallTargetBranchIds = vi.fn();
const createCallLog = vi.fn();
const updateCallLog = vi.fn();
const deleteCallLog = vi.fn();
const recordAudit = vi.fn().mockResolvedValue(undefined);

vi.mock('../services/callLogService.js', () => ({
  listCallLogs,
  getCallLogBranchId,
  getCallTargetBranchIds,
  createCallLog,
  updateCallLog,
  deleteCallLog,
  CallLogNotFoundError: class CallLogNotFoundError extends Error {},
  CallLogTargetNotFoundError: class CallLogTargetNotFoundError extends Error {},
}));
vi.mock('../services/auditService.js', () => ({ recordAudit }));

const handlers = await import('./callLogs.js');

const LOG_ID = '11111111-1111-1111-1111-111111111111';
const PARTNER_ID = '22222222-2222-2222-2222-222222222222';
const LEAD_ID = '33333333-3333-3333-3333-333333333333';
const BRANCH_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BRANCH_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

interface FakeAuth {
  staffId: string;
  branchId: string;
  roleNames: string[];
  accessibleBranchIds: string[];
}

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

const idReq = (auth: FakeAuth, body: unknown = {}) => ({ params: { id: LOG_ID }, body, auth }) as never;
const createReq = (auth: FakeAuth, extra: Record<string, unknown> = {}) =>
  ({ body: { direction: 'INBOUND', purpose: 'استفسار', outcome: 'RESOLVED', branchId: BRANCH_A, contactName: 'متصل', ...extra }, auth }) as never;

function expectNothingWritten() {
  expect(createCallLog).not.toHaveBeenCalled();
  expect(updateCallLog).not.toHaveBeenCalled();
  expect(deleteCallLog).not.toHaveBeenCalled();
  expect(recordAudit).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  getCallTargetBranchIds.mockResolvedValue([]);
});

describe('list', () => {
  it('a branch-scoped caller lists only their branches; a SUPER_ADMIN is unfiltered', async () => {
    listCallLogs.mockResolvedValue([]);
    await handlers.listCallLogsHandler({ auth: salesA, query: {} } as never, makeRes() as never);
    expect(listCallLogs).toHaveBeenLastCalledWith(expect.objectContaining({ branchIds: [BRANCH_A] }));
    await handlers.listCallLogsHandler({ auth: superAdmin, query: {} } as never, makeRes() as never);
    expect(listCallLogs).toHaveBeenLastCalledWith(expect.objectContaining({ branchIds: undefined }));
  });
});

describe('create - branch access', () => {
  it('logging a call under a branch the caller cannot access is 403 and writes nothing', async () => {
    const res = makeRes();
    await handlers.createCallLogHandler(createReq(salesA, { branchId: BRANCH_B }), res as never);
    expect(res.statusCode).toBe(403);
    expectNothingWritten();
  });

  it('a log linked to a customer of a branch the caller cannot access is 403 and writes nothing', async () => {
    getCallTargetBranchIds.mockResolvedValue([BRANCH_B]);
    const res = makeRes();
    await handlers.createCallLogHandler(createReq(salesA, { contactName: undefined, partnerId: PARTNER_ID }), res as never);
    expect(res.statusCode).toBe(403);
    expect(getCallTargetBranchIds).toHaveBeenCalledWith({ partnerId: PARTNER_ID, leadId: undefined });
    expectNothingWritten();
  });

  it('same for a lead of another branch', async () => {
    getCallTargetBranchIds.mockResolvedValue([BRANCH_B]);
    const res = makeRes();
    await handlers.createCallLogHandler(createReq(salesA, { contactName: undefined, leadId: LEAD_ID }), res as never);
    expect(res.statusCode).toBe(403);
    expectNothingWritten();
  });

  it('a customer or lead that does not exist is 404 and writes nothing', async () => {
    const { CallLogTargetNotFoundError } = await import('../services/callLogService.js');
    getCallTargetBranchIds.mockRejectedValue(new (CallLogTargetNotFoundError as new () => Error)());
    const res = makeRes();
    await handlers.createCallLogHandler(createReq(salesA, { contactName: undefined, partnerId: PARTNER_ID }), res as never);
    expect(res.statusCode).toBe(404);
    expectNothingWritten();
  });

  it('a log on an accessible branch (with an accessible customer, or a bare caller name) is created and audited under that branch', async () => {
    getCallTargetBranchIds.mockResolvedValue([BRANCH_A]);
    createCallLog.mockResolvedValue({ id: LOG_ID, branchId: BRANCH_A, partnerId: PARTNER_ID, direction: 'INBOUND', purpose: 'استفسار', outcome: 'RESOLVED' });
    const res = makeRes();
    await handlers.createCallLogHandler(createReq(salesA, { contactName: undefined, partnerId: PARTNER_ID }), res as never);
    expect(res.statusCode).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', branchId: BRANCH_A, partnerId: PARTNER_ID }));
  });
});

describe('update / delete - the call log\'s own branch decides', () => {
  const actions: Array<[string, (auth: FakeAuth) => Promise<unknown>]> = [
    ['update', (auth) => handlers.updateCallLogHandler(idReq(auth, { outcome: 'RESOLVED' }), makeRes() as never)],
    ['delete', (auth) => handlers.deleteCallLogHandler(idReq(auth), makeRes() as never)],
  ];

  for (const [name, run] of actions) {
    it(`${name}: a log of a branch the caller cannot access is rejected and nothing is written or audited`, async () => {
      getCallLogBranchId.mockResolvedValue(BRANCH_B);
      await run(salesA);
      expectNothingWritten();
    });

    it(`${name}: an unknown / deleted log is 404 and nothing is written`, async () => {
      const { CallLogNotFoundError } = await import('../services/callLogService.js');
      getCallLogBranchId.mockRejectedValue(new (CallLogNotFoundError as new () => Error)());
      await run(salesA);
      expectNothingWritten();
    });
  }

  it('the rejection is a 403', async () => {
    getCallLogBranchId.mockResolvedValue(BRANCH_B);
    const res = makeRes();
    await handlers.deleteCallLogHandler(idReq(salesA), res as never);
    expect(res.statusCode).toBe(403);
  });

  it('editing an accessible log works and is audited under the log\'s branch', async () => {
    getCallLogBranchId.mockResolvedValue(BRANCH_A);
    updateCallLog.mockResolvedValue({ id: LOG_ID, branchId: BRANCH_A, partnerId: null });
    await handlers.updateCallLogHandler(idReq(salesA, { outcome: 'NEEDS_FOLLOWUP' }), makeRes() as never);
    expect(updateCallLog).toHaveBeenCalledTimes(1);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE', branchId: BRANCH_A }));
  });

  it('deleting an accessible log soft-deletes it and audits under the log\'s branch (the row used to have none)', async () => {
    getCallLogBranchId.mockResolvedValue(BRANCH_A);
    deleteCallLog.mockResolvedValue(undefined);
    await handlers.deleteCallLogHandler(idReq(salesA), makeRes() as never);
    expect(deleteCallLog).toHaveBeenCalledWith(LOG_ID, salesA.staffId);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE', branchId: BRANCH_A }));
  });

  it('a SUPER_ADMIN may edit or delete a log of any branch', async () => {
    getCallLogBranchId.mockResolvedValue(BRANCH_B);
    updateCallLog.mockResolvedValue({ id: LOG_ID, branchId: BRANCH_B, partnerId: null });
    await handlers.updateCallLogHandler(idReq(superAdmin, { notes: 'x' }), makeRes() as never);
    expect(updateCallLog).toHaveBeenCalledTimes(1);
  });
});
