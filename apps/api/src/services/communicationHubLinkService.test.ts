import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * First automated tests for the communication-hub links (CRM review, 2026-09-25): list order,
 * new links append at the end, moving a link swaps it with its neighbour (no-op at the edges),
 * missing/deleted links are NotFound, delete is soft. Only prisma is mocked.
 */

const linkFindMany = vi.fn();
const linkFindUnique = vi.fn();
const linkAggregate = vi.fn();
const linkCreate = vi.fn();
const linkUpdate = vi.fn();
const transaction = vi.fn((ops: Promise<unknown>[]) => Promise.all(ops));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    communicationHubLink: {
      findMany: (...a: unknown[]) => linkFindMany(...a),
      findUnique: (...a: unknown[]) => linkFindUnique(...a),
      aggregate: (...a: unknown[]) => linkAggregate(...a),
      create: (...a: unknown[]) => linkCreate(...a),
      update: (...a: unknown[]) => linkUpdate(...a),
    },
    $transaction: (ops: Promise<unknown>[]) => transaction(ops),
  },
}));

const {
  listCommunicationHubLinks,
  createCommunicationHubLink,
  updateCommunicationHubLink,
  moveCommunicationHubLink,
  deleteCommunicationHubLink,
  CommunicationHubLinkNotFoundError,
} = await import('./communicationHubLinkService.js');

function row(id: string, sortOrder: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    label: `رابط ${id}`,
    url: 'wa.me/201000000000',
    sortOrder,
    isDeleted: false,
    createdAt: new Date('2026-09-25T00:00:00Z'),
    updatedAt: new Date('2026-09-25T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  linkUpdate.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(row(where.id, 0)));
});

describe('listCommunicationHubLinks', () => {
  it('returns the non-deleted links in their saved order', async () => {
    linkFindMany.mockResolvedValue([row('a', 0), row('b', 1)]);
    const links = await listCommunicationHubLinks();
    expect(linkFindMany).toHaveBeenCalledWith({ where: { isDeleted: false }, orderBy: { sortOrder: 'asc' } });
    expect(links.map((l) => l.id)).toEqual(['a', 'b']);
  });
});

describe('createCommunicationHubLink', () => {
  it('the first link gets sortOrder 0', async () => {
    linkAggregate.mockResolvedValue({ _max: { sortOrder: null } });
    linkCreate.mockResolvedValue(row('a', 0));
    await createCommunicationHubLink({ label: 'واتساب', url: 'wa.me/201000000000' });
    expect(linkCreate).toHaveBeenCalledWith({ data: { label: 'واتساب', url: 'wa.me/201000000000', sortOrder: 0 } });
  });

  it('a new link is appended after the current last one', async () => {
    linkAggregate.mockResolvedValue({ _max: { sortOrder: 4 } });
    linkCreate.mockResolvedValue(row('f', 5));
    await createCommunicationHubLink({ label: 'فيسبوك', url: 'facebook.com/page' });
    expect(linkCreate).toHaveBeenCalledWith({ data: { label: 'فيسبوك', url: 'facebook.com/page', sortOrder: 5 } });
  });
});

describe('moveCommunicationHubLink', () => {
  const rows = () => [row('a', 0), row('b', 1), row('c', 2)];

  it('moving a link up swaps its sortOrder with the previous one, in one transaction', async () => {
    linkFindMany.mockResolvedValue(rows());
    await moveCommunicationHubLink('b', 'up');
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(linkUpdate).toHaveBeenCalledWith({ where: { id: 'b' }, data: { sortOrder: 0 } });
    expect(linkUpdate).toHaveBeenCalledWith({ where: { id: 'a' }, data: { sortOrder: 1 } });
  });

  it('moving a link down swaps it with the next one', async () => {
    linkFindMany.mockResolvedValue(rows());
    await moveCommunicationHubLink('b', 'down');
    expect(linkUpdate).toHaveBeenCalledWith({ where: { id: 'b' }, data: { sortOrder: 2 } });
    expect(linkUpdate).toHaveBeenCalledWith({ where: { id: 'c' }, data: { sortOrder: 1 } });
  });

  it('moving the first link up or the last link down is a no-op (nothing is written)', async () => {
    linkFindMany.mockResolvedValue(rows());
    await moveCommunicationHubLink('a', 'up');
    await moveCommunicationHubLink('c', 'down');
    expect(linkUpdate).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('a link that is not in the list is NotFound', async () => {
    linkFindMany.mockResolvedValue(rows());
    await expect(moveCommunicationHubLink('zzz', 'up')).rejects.toThrow(CommunicationHubLinkNotFoundError);
  });
});

describe('updateCommunicationHubLink / deleteCommunicationHubLink', () => {
  it('a missing or deleted link throws NotFound and writes nothing', async () => {
    linkFindUnique.mockResolvedValue(null);
    await expect(updateCommunicationHubLink('a', { label: 'x' })).rejects.toThrow(CommunicationHubLinkNotFoundError);
    linkFindUnique.mockResolvedValue(row('a', 0, { isDeleted: true }));
    await expect(deleteCommunicationHubLink('a', 'staff-1')).rejects.toThrow(CommunicationHubLinkNotFoundError);
    expect(linkUpdate).not.toHaveBeenCalled();
  });

  it('update sends only what was provided; delete is a soft delete recording who deleted it', async () => {
    linkFindUnique.mockResolvedValue(row('a', 0));
    await updateCommunicationHubLink('a', { url: 'instagram.com/x' });
    expect(linkUpdate).toHaveBeenLastCalledWith({ where: { id: 'a' }, data: { url: 'instagram.com/x' } });
    await deleteCommunicationHubLink('a', 'staff-1');
    expect(linkUpdate).toHaveBeenLastCalledWith({ where: { id: 'a' }, data: { isDeleted: true, deletedAt: expect.any(Date), deletedBy: 'staff-1' } });
  });
});
