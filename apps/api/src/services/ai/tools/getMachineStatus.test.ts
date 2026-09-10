import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * `get_machine_status` reuses `controllers/machines.ts::listMachines`'s
 * exact query verbatim — these tests lock in that the `branchId` filter
 * (or its absence) reaches Prisma unmodified, with no invented default.
 */
const findMany = vi.fn();

vi.mock('../../../lib/prisma.js', () => ({
  prisma: { machine: { findMany: (...args: unknown[]) => findMany(...args) } },
}));

const { getMachineStatusTool } = await import('./getMachineStatus.js');

function machine(overrides: Record<string, unknown> = {}) {
  return {
    id: 'machine-1',
    name: 'ماكينة أوفست 1',
    branchId: 'branch-cleopatra',
    departmentId: 'dept-printing',
    status: 'RUNNING',
    isDeleted: false,
    createdAt: new Date('2026-08-16'),
    updatedAt: new Date('2026-08-16'),
    ...overrides,
  };
}

beforeEach(() => {
  findMany.mockReset();
});

describe('get_machine_status tool — schema', () => {
  it('accepts no branchId or a valid uuid', () => {
    expect(() => getMachineStatusTool.inputSchema.parse({})).not.toThrow();
    expect(() => getMachineStatusTool.inputSchema.parse({ branchId: '11111111-1111-1111-1111-111111111111' })).not.toThrow();
  });

  it('rejects a non-uuid branchId', () => {
    expect(getMachineStatusTool.inputSchema.safeParse({ branchId: 'not-a-uuid' }).success).toBe(false);
  });
});

describe('get_machine_status tool — authorization declaration', () => {
  it('requires machines.view, the same permission the real route already uses', () => {
    expect(getMachineStatusTool.requiredPermission).toBe('machines.view');
    expect(getMachineStatusTool.requiresSuperAdmin).toBeUndefined();
  });
});

describe('get_machine_status tool — query behavior (matches listMachines exactly)', () => {
  it('queries with no branchId filter when omitted — same as the real controller default', async () => {
    findMany.mockResolvedValueOnce([machine()]);
    await getMachineStatusTool.execute({}, { auth: {} as never });
    expect(findMany).toHaveBeenCalledWith({ where: { isDeleted: false }, orderBy: { name: 'asc' } });
  });

  it('forwards branchId into the where clause unmodified when given', async () => {
    findMany.mockResolvedValueOnce([machine()]);
    await getMachineStatusTool.execute({ branchId: 'branch-cleopatra' }, { auth: {} as never });
    expect(findMany).toHaveBeenCalledWith({
      where: { isDeleted: false, branchId: 'branch-cleopatra' },
      orderBy: { name: 'asc' },
    });
  });

  it('returns rows exactly as the service returns them, never inventing or altering fields', async () => {
    const rows = [machine(), machine({ id: 'machine-2', name: 'ماكينة ديجيتال', status: 'MAINTENANCE' })];
    findMany.mockResolvedValueOnce(rows);
    const result = await getMachineStatusTool.execute({}, { auth: {} as never });
    expect(result).toEqual(rows);
  });

  it('returns an empty array as-is when no machines match', async () => {
    findMany.mockResolvedValueOnce([]);
    const result = await getMachineStatusTool.execute({ branchId: '11111111-1111-1111-1111-111111111111' }, { auth: {} as never });
    expect(result).toEqual([]);
  });
});
