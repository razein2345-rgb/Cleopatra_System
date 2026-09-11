import { describe, expect, it, vi, beforeEach } from 'vitest';

const findFirst = vi.fn();
const create = vi.fn();
const executeRaw = vi.fn();

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        $executeRaw: (...args: unknown[]) => executeRaw(...args),
        businessPartner: {
          findFirst: (...args: unknown[]) => findFirst(...args),
          create: (...args: unknown[]) => create(...args),
        },
      }),
  },
}));

const { getOrCreateWalkInPartner, WALK_IN_PARTNER_NAME } = await import('./posService.js');

function partner(overrides: Partial<{ id: string; branchId: string; nameAr: string }> = {}) {
  return { id: 'partner-1', branchId: 'branch-1', nameAr: WALK_IN_PARTNER_NAME, isIndividual: true, roles: ['CUSTOMER'], ...overrides };
}

describe('getOrCreateWalkInPartner', () => {
  beforeEach(() => {
    findFirst.mockReset();
    create.mockReset();
    executeRaw.mockReset();
  });

  it('returns the existing walk-in partner for the branch instead of creating a new one', async () => {
    findFirst.mockResolvedValue(partner());

    const result = await getOrCreateWalkInPartner('branch-1');

    expect(result).toEqual(partner());
    expect(create).not.toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalledWith({
      where: { isDeleted: false, branchId: 'branch-1', nameAr: WALK_IN_PARTNER_NAME },
    });
  });

  it('creates the walk-in partner once when none exists yet for the branch', async () => {
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue(partner({ id: 'partner-new' }));

    const result = await getOrCreateWalkInPartner('branch-1');

    expect(result.id).toBe('partner-new');
    expect(create).toHaveBeenCalledWith({
      data: { nameAr: WALK_IN_PARTNER_NAME, isIndividual: true, roles: ['CUSTOMER'], branchId: 'branch-1' },
    });
  });

  it('never creates a duplicate customer — the same branch always resolves to the same partner once it exists', async () => {
    findFirst.mockResolvedValue(partner({ id: 'partner-1', branchId: 'branch-1' }));

    await getOrCreateWalkInPartner('branch-1');
    await getOrCreateWalkInPartner('branch-1');

    expect(create).not.toHaveBeenCalled();
  });

  it('is branch-isolated — different branches never share or collide on the same walk-in partner lookup', async () => {
    findFirst.mockResolvedValueOnce(partner({ id: 'partner-a', branchId: 'branch-a' }));
    findFirst.mockResolvedValueOnce(partner({ id: 'partner-b', branchId: 'branch-b' }));

    const a = await getOrCreateWalkInPartner('branch-a');
    const b = await getOrCreateWalkInPartner('branch-b');

    expect(a.branchId).toBe('branch-a');
    expect(b.branchId).toBe('branch-b');
    expect(findFirst).toHaveBeenNthCalledWith(1, { where: { isDeleted: false, branchId: 'branch-a', nameAr: WALK_IN_PARTNER_NAME } });
    expect(findFirst).toHaveBeenNthCalledWith(2, { where: { isDeleted: false, branchId: 'branch-b', nameAr: WALK_IN_PARTNER_NAME } });
  });

  it('acquires a branch-scoped advisory lock before checking for an existing partner (concurrency safety)', async () => {
    findFirst.mockResolvedValue(partner());

    await getOrCreateWalkInPartner('branch-1');

    expect(executeRaw).toHaveBeenCalled();
    const callOrder = [...executeRaw.mock.invocationCallOrder, ...findFirst.mock.invocationCallOrder];
    expect(Math.min(...executeRaw.mock.invocationCallOrder)).toBeLessThan(Math.min(...findFirst.mock.invocationCallOrder));
    expect(callOrder.length).toBeGreaterThan(0);
  });
});
