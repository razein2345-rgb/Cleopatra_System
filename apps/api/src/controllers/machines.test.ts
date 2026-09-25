import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Branch isolation for machine writes (owner decision, 2026-09-25 - found in
 * the read-only access review). Create took `branchId` from the body, update
 * could edit/move any machine and delete could remove any id, with no branch
 * check and no audit row. Now the machine's own branch (and the destination
 * when an edit moves it) must be accessible to the caller, and every write is
 * audited under the machine's real branch. Real `canAccessBranch` runs; prisma
 * and audit are mocked.
 */

const machineFindUnique = vi.fn();
const machineCreate = vi.fn();
const machineUpdate = vi.fn();
const recordAudit = vi.fn().mockResolvedValue(undefined);

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    machine: {
      findUnique: (...args: unknown[]) => machineFindUnique(...args),
      create: (...args: unknown[]) => machineCreate(...args),
      update: (...args: unknown[]) => machineUpdate(...args),
      findMany: vi.fn(),
    },
  },
}));
vi.mock('../services/auditService.js', () => ({ recordAudit }));

const { createMachine, updateMachine, deleteMachine } = await import('./machines.js');

const MACHINE_ID = '11111111-1111-1111-1111-111111111111';
const BRANCH_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BRANCH_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

interface FakeAuth {
  staffId: string;
  branchId: string;
  roleNames: string[];
  accessibleBranchIds: string[];
}

const branchAUser: FakeAuth = { staffId: 'staff-a', branchId: BRANCH_A, roleNames: ['PRODUCTION_MANAGER'], accessibleBranchIds: [BRANCH_A] };
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

const existingMachine = (branchId: string, isDeleted = false) => ({ branchId, name: 'ماكينة 1', status: 'RUNNING', isDeleted });

function expectNothingWritten() {
  expect(machineCreate).not.toHaveBeenCalled();
  expect(machineUpdate).not.toHaveBeenCalled();
  expect(recordAudit).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createMachine - branch isolation', () => {
  it('creating under a branch the caller cannot access is 403 and nothing is written or audited', async () => {
    const res = makeRes();
    await createMachine({ body: { name: 'ماكينة', branchId: BRANCH_B }, auth: branchAUser } as never, res as never);

    expect(res.statusCode).toBe(403);
    expectNothingWritten();
  });

  it('under the caller\'s own branch it is created and audited under that branch', async () => {
    machineCreate.mockResolvedValue({ id: MACHINE_ID, name: 'ماكينة', branchId: BRANCH_A, status: 'RUNNING', departmentId: null });
    const res = makeRes();

    await createMachine({ body: { name: 'ماكينة', branchId: BRANCH_A }, auth: branchAUser } as never, res as never);

    expect(res.statusCode).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'Machine', action: 'CREATE', branchId: BRANCH_A }));
  });
});

describe('updateMachine - branch isolation', () => {
  const req = (auth: FakeAuth, body: unknown) => ({ params: { id: MACHINE_ID }, body, auth }) as never;

  it('editing a machine of a branch the caller cannot access is 403 and nothing is written', async () => {
    machineFindUnique.mockResolvedValue(existingMachine(BRANCH_B));
    const res = makeRes();
    await updateMachine(req(branchAUser, { status: 'STOPPED' }), res as never);

    expect(res.statusCode).toBe(403);
    expectNothingWritten();
  });

  it('moving the caller\'s own machine to a branch they cannot access is 403 and nothing is written', async () => {
    machineFindUnique.mockResolvedValue(existingMachine(BRANCH_A));
    const res = makeRes();
    await updateMachine(req(branchAUser, { branchId: BRANCH_B }), res as never);

    expect(res.statusCode).toBe(403);
    expectNothingWritten();
  });

  it('an unknown or deleted machine is 404', async () => {
    machineFindUnique.mockResolvedValue(existingMachine(BRANCH_A, true));
    const res = makeRes();
    await updateMachine(req(branchAUser, { status: 'STOPPED' }), res as never);

    expect(res.statusCode).toBe(404);
    expectNothingWritten();
  });

  it('editing an accessible machine works and is audited under the machine\'s branch', async () => {
    machineFindUnique.mockResolvedValue(existingMachine(BRANCH_A));
    machineUpdate.mockResolvedValue({ id: MACHINE_ID, branchId: BRANCH_A });
    const res = makeRes();
    await updateMachine(req(branchAUser, { status: 'MAINTENANCE' }), res as never);

    expect(machineUpdate).toHaveBeenCalledTimes(1);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', branchId: BRANCH_A, previousValue: expect.objectContaining({ status: 'RUNNING' }) }),
    );
  });

  it('a SUPER_ADMIN may edit and move any machine', async () => {
    machineFindUnique.mockResolvedValue(existingMachine(BRANCH_B));
    machineUpdate.mockResolvedValue({ id: MACHINE_ID, branchId: BRANCH_A });
    const res = makeRes();
    await updateMachine(req(superAdmin, { branchId: BRANCH_A }), res as never);

    expect(machineUpdate).toHaveBeenCalledTimes(1);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ branchId: BRANCH_B }));
  });
});

describe('deleteMachine - branch isolation', () => {
  const req = (auth: FakeAuth) => ({ params: { id: MACHINE_ID }, auth }) as never;

  it('deleting a machine of a branch the caller cannot access is 403 and nothing is written', async () => {
    machineFindUnique.mockResolvedValue(existingMachine(BRANCH_B));
    const res = makeRes();
    await deleteMachine(req(branchAUser), res as never);

    expect(res.statusCode).toBe(403);
    expectNothingWritten();
  });

  it('an unknown or already-deleted machine is 404 and nothing is written', async () => {
    machineFindUnique.mockResolvedValue(null);
    const res = makeRes();
    await deleteMachine(req(branchAUser), res as never);

    expect(res.statusCode).toBe(404);
    expectNothingWritten();
  });

  it('deleting an accessible machine soft-deletes it and audits under the machine\'s branch', async () => {
    machineFindUnique.mockResolvedValue(existingMachine(BRANCH_A));
    machineUpdate.mockResolvedValue({ id: MACHINE_ID });
    const res = makeRes();
    await deleteMachine(req(branchAUser), res as never);

    expect(machineUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isDeleted: true, deletedBy: branchAUser.staffId }) }));
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE', branchId: BRANCH_A }));
  });
});
