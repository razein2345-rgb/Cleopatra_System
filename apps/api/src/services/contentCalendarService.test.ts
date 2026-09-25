import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * First automated tests for the content-calendar service (CRM review, 2026-09-25): list scoping
 * (a branch-scoped list still includes company-wide entries, ordered by planned date), create
 * defaults, partial update, soft delete and the branch lookup the controller's access check
 * relies on. Only prisma is mocked.
 */

const entryFindMany = vi.fn();
const entryFindUnique = vi.fn();
const entryCreate = vi.fn();
const entryUpdate = vi.fn();

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    contentCalendarEntry: {
      findMany: (...a: unknown[]) => entryFindMany(...a),
      findUnique: (...a: unknown[]) => entryFindUnique(...a),
      create: (...a: unknown[]) => entryCreate(...a),
      update: (...a: unknown[]) => entryUpdate(...a),
    },
  },
}));

const {
  listContentCalendarEntries,
  createContentCalendarEntry,
  getContentCalendarEntryBranchId,
  updateContentCalendarEntry,
  deleteContentCalendarEntry,
  ContentCalendarEntryNotFoundError,
} = await import('./contentCalendarService.js');

const ID = '11111111-1111-1111-1111-111111111111';
const BRANCH_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    title: 'منشور العروض',
    platform: 'INSTAGRAM',
    contentType: 'ريلز',
    notes: null,
    publishedUrl: null,
    scheduledDate: new Date('2026-10-01T00:00:00Z'),
    status: 'IDEA',
    branchId: BRANCH_A,
    assignedToId: 'staff-2',
    assignedTo: { name: 'سارة' },
    recordedById: 'staff-1',
    recordedBy: { name: 'عمر' },
    isDeleted: false,
    createdAt: new Date('2026-09-25T00:00:00Z'),
    updatedAt: new Date('2026-09-25T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  entryUpdate.mockImplementation(() => Promise.resolve(row()));
});

describe('listContentCalendarEntries', () => {
  it('a branch-scoped list returns those branches PLUS company-wide entries, never deleted ones, soonest first', async () => {
    entryFindMany.mockResolvedValue([]);
    await listContentCalendarEntries({ branchIds: [BRANCH_A] });
    expect(entryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isDeleted: false, OR: [{ branchId: { in: [BRANCH_A] } }, { branchId: null }] },
        orderBy: { scheduledDate: 'asc' },
      }),
    );
  });

  it('with no filter (SUPER_ADMIN) it lists everything not deleted', async () => {
    entryFindMany.mockResolvedValue([]);
    await listContentCalendarEntries({});
    expect(entryFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isDeleted: false } }));
  });

  it('maps dates and the assignee name', async () => {
    entryFindMany.mockResolvedValue([row()]);
    const [entry] = await listContentCalendarEntries({});
    expect(entry).toMatchObject({ scheduledDate: '2026-10-01T00:00:00.000Z', assignedToName: 'سارة', status: 'IDEA' });
  });
});

describe('createContentCalendarEntry', () => {
  it('defaults to IDEA and a company-wide, unassigned entry', async () => {
    entryCreate.mockResolvedValue(row({ branchId: null, assignedToId: null, assignedTo: null }));
    await createContentCalendarEntry({ title: 'منشور', platform: 'FACEBOOK', scheduledDate: '2026-10-01' } as never, 'staff-1');
    expect(entryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'IDEA', branchId: null, assignedToId: null, contentType: null, recordedById: 'staff-1', scheduledDate: expect.any(Date) }),
      }),
    );
  });
});

describe('getContentCalendarEntryBranchId', () => {
  it('returns the branch, or null for a company-wide entry', async () => {
    entryFindUnique.mockResolvedValue({ branchId: BRANCH_A, isDeleted: false });
    await expect(getContentCalendarEntryBranchId(ID)).resolves.toBe(BRANCH_A);
    entryFindUnique.mockResolvedValue({ branchId: null, isDeleted: false });
    await expect(getContentCalendarEntryBranchId(ID)).resolves.toBeNull();
  });

  it('throws ContentCalendarEntryNotFoundError for a missing or deleted entry', async () => {
    entryFindUnique.mockResolvedValue(null);
    await expect(getContentCalendarEntryBranchId(ID)).rejects.toThrow(ContentCalendarEntryNotFoundError);
    entryFindUnique.mockResolvedValue({ branchId: BRANCH_A, isDeleted: true });
    await expect(getContentCalendarEntryBranchId(ID)).rejects.toThrow(ContentCalendarEntryNotFoundError);
  });
});

describe('updateContentCalendarEntry / deleteContentCalendarEntry', () => {
  it('a partial update only sends the fields that were provided (and converts the date)', async () => {
    entryFindUnique.mockResolvedValue(row());
    await updateContentCalendarEntry(ID, { status: 'PUBLISHED', publishedUrl: 'https://example.test/p/1' } as never);
    expect(entryUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'PUBLISHED', publishedUrl: 'https://example.test/p/1' } }));
    await updateContentCalendarEntry(ID, { scheduledDate: '2026-11-01' } as never);
    expect(entryUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ data: { scheduledDate: expect.any(Date) } }));
  });

  it('an update or delete of a missing/deleted entry throws and writes nothing', async () => {
    entryFindUnique.mockResolvedValue(row({ isDeleted: true }));
    await expect(updateContentCalendarEntry(ID, { status: 'READY' } as never)).rejects.toThrow(ContentCalendarEntryNotFoundError);
    await expect(deleteContentCalendarEntry(ID, 'staff-1')).rejects.toThrow(ContentCalendarEntryNotFoundError);
    expect(entryUpdate).not.toHaveBeenCalled();
  });

  it('delete is a soft delete recording who deleted it', async () => {
    entryFindUnique.mockResolvedValue(row());
    await deleteContentCalendarEntry(ID, 'staff-1');
    expect(entryUpdate).toHaveBeenCalledWith({ where: { id: ID }, data: { isDeleted: true, deletedAt: expect.any(Date), deletedBy: 'staff-1' } });
  });
});
