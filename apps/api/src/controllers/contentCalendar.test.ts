import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * First automated tests for the Content Calendar controller (CRM review, 2026-09-25). Locks the
 * branch rule found in that review: edit/delete are checked against the ENTRY's own branch (and
 * the destination when an edit moves it), never the caller's home branch; a company-wide entry
 * (no branch) stays editable by anyone holding the permission; a rejected action writes and
 * audits nothing. Real `canAccessBranch`; services and audit mocked.
 */

const listEntries = vi.fn();
const getEntryBranchId = vi.fn();
const createEntry = vi.fn();
const updateEntry = vi.fn();
const deleteEntry = vi.fn();
const recordAudit = vi.fn().mockResolvedValue(undefined);

vi.mock('../services/contentCalendarService.js', () => ({
  listContentCalendarEntries: listEntries,
  getContentCalendarEntryBranchId: getEntryBranchId,
  createContentCalendarEntry: createEntry,
  updateContentCalendarEntry: updateEntry,
  deleteContentCalendarEntry: deleteEntry,
  ContentCalendarEntryNotFoundError: class ContentCalendarEntryNotFoundError extends Error {},
}));
vi.mock('../services/auditService.js', () => ({ recordAudit }));

const handlers = await import('./contentCalendar.js');

const ENTRY_ID = '11111111-1111-1111-1111-111111111111';
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

const idReq = (auth: FakeAuth, body: unknown = {}) => ({ params: { id: ENTRY_ID }, body, auth }) as never;

function expectNothingWritten() {
  expect(updateEntry).not.toHaveBeenCalled();
  expect(deleteEntry).not.toHaveBeenCalled();
  expect(recordAudit).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('list / create', () => {
  it('a branch-scoped caller lists only their branches; a SUPER_ADMIN is unfiltered', async () => {
    listEntries.mockResolvedValue([]);
    await handlers.listContentCalendarEntriesHandler({ auth: salesA } as never, makeRes() as never);
    expect(listEntries).toHaveBeenLastCalledWith({ branchIds: [BRANCH_A] });
    await handlers.listContentCalendarEntriesHandler({ auth: superAdmin } as never, makeRes() as never);
    expect(listEntries).toHaveBeenLastCalledWith({ branchIds: undefined });
  });

  it('creating under a branch the caller cannot access is 403 and writes nothing', async () => {
    const res = makeRes();
    await handlers.createContentCalendarEntryHandler(
      { body: { title: 'منشور', platform: 'INSTAGRAM', scheduledDate: '2026-10-01', branchId: BRANCH_B }, auth: salesA } as never,
      res as never,
    );
    expect(res.statusCode).toBe(403);
    expect(createEntry).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('a company-wide entry is created and audited', async () => {
    createEntry.mockResolvedValue({ id: ENTRY_ID, title: 'منشور', platform: 'INSTAGRAM', scheduledDate: '2026-10-01', branchId: null });
    const res = makeRes();
    await handlers.createContentCalendarEntryHandler(
      { body: { title: 'منشور', platform: 'INSTAGRAM', scheduledDate: '2026-10-01' }, auth: salesA } as never,
      res as never,
    );
    expect(res.statusCode).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE' }));
  });
});

describe('update - the entry\'s own branch decides', () => {
  it('editing an entry of a branch the caller cannot access is 403 and nothing is written', async () => {
    getEntryBranchId.mockResolvedValue(BRANCH_B);
    const res = makeRes();
    await handlers.updateContentCalendarEntryHandler(idReq(salesA, { status: 'READY' }), res as never);
    expect(res.statusCode).toBe(403);
    expectNothingWritten();
  });

  it('moving the caller\'s own entry to a branch they cannot access is 403 and nothing is written', async () => {
    getEntryBranchId.mockResolvedValue(BRANCH_A);
    const res = makeRes();
    await handlers.updateContentCalendarEntryHandler(idReq(salesA, { branchId: BRANCH_B }), res as never);
    expect(res.statusCode).toBe(403);
    expectNothingWritten();
  });

  it('an unknown / deleted entry is 404', async () => {
    const { ContentCalendarEntryNotFoundError } = await import('../services/contentCalendarService.js');
    getEntryBranchId.mockRejectedValue(new (ContentCalendarEntryNotFoundError as new () => Error)());
    const res = makeRes();
    await handlers.updateContentCalendarEntryHandler(idReq(salesA, { status: 'READY' }), res as never);
    expect(res.statusCode).toBe(404);
    expectNothingWritten();
  });

  it('editing an accessible entry works and is audited under its ORIGINAL branch, the move visible in the payload', async () => {
    const granted: FakeAuth = { ...salesA, accessibleBranchIds: [BRANCH_A, BRANCH_B] };
    getEntryBranchId.mockResolvedValue(BRANCH_A);
    updateEntry.mockResolvedValue({ id: ENTRY_ID, branchId: BRANCH_B });
    await handlers.updateContentCalendarEntryHandler(idReq(granted, { branchId: BRANCH_B }), makeRes() as never);
    expect(updateEntry).toHaveBeenCalledTimes(1);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE', branchId: BRANCH_A, newValue: { branchId: BRANCH_B } }));
  });

  it('a company-wide entry (no branch) stays editable by a branch-scoped holder of the permission (unchanged behaviour)', async () => {
    getEntryBranchId.mockResolvedValue(null);
    updateEntry.mockResolvedValue({ id: ENTRY_ID, branchId: null });
    const res = makeRes();
    await handlers.updateContentCalendarEntryHandler(idReq(salesA, { status: 'PUBLISHED', publishedUrl: 'https://example.test/p/1' }), res as never);
    expect(updateEntry).toHaveBeenCalledTimes(1);
    expect(res.body).toMatchObject({ success: true });
  });

  it('a SUPER_ADMIN may edit an entry of any branch', async () => {
    getEntryBranchId.mockResolvedValue(BRANCH_B);
    updateEntry.mockResolvedValue({ id: ENTRY_ID, branchId: BRANCH_B });
    await handlers.updateContentCalendarEntryHandler(idReq(superAdmin, { status: 'READY' }), makeRes() as never);
    expect(updateEntry).toHaveBeenCalledTimes(1);
  });
});

describe('delete - the entry\'s own branch decides', () => {
  it('deleting an entry of a branch the caller cannot access is 403 and nothing is deleted or audited', async () => {
    getEntryBranchId.mockResolvedValue(BRANCH_B);
    const res = makeRes();
    await handlers.deleteContentCalendarEntryHandler(idReq(salesA), res as never);
    expect(res.statusCode).toBe(403);
    expectNothingWritten();
  });

  it('an unknown / deleted entry is 404', async () => {
    const { ContentCalendarEntryNotFoundError } = await import('../services/contentCalendarService.js');
    getEntryBranchId.mockRejectedValue(new (ContentCalendarEntryNotFoundError as new () => Error)());
    const res = makeRes();
    await handlers.deleteContentCalendarEntryHandler(idReq(salesA), res as never);
    expect(res.statusCode).toBe(404);
    expectNothingWritten();
  });

  it('deleting an accessible entry soft-deletes it and audits under the entry\'s branch (the row used to have none)', async () => {
    getEntryBranchId.mockResolvedValue(BRANCH_A);
    deleteEntry.mockResolvedValue(undefined);
    await handlers.deleteContentCalendarEntryHandler(idReq(salesA), makeRes() as never);
    expect(deleteEntry).toHaveBeenCalledWith(ENTRY_ID, salesA.staffId);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE', branchId: BRANCH_A }));
  });
});
