import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Owner decision (2026-09-25) - a field assignment may only be created for an
 * employee who actually belongs to the assignment's branch: it is their home
 * branch, or they hold an explicit UserBranchAccess grant on it. Only prisma
 * is mocked; the check under test is the real one.
 */

const staffFindUnique = vi.fn();
const fieldAssignmentCreate = vi.fn();

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    staffProfile: { findUnique: (...args: unknown[]) => staffFindUnique(...args) },
    fieldAssignment: { create: (...args: unknown[]) => fieldAssignmentCreate(...args) },
  },
}));

const { createFieldAssignment, FieldAssignmentStaffNotFoundError, FieldAssignmentStaffNotInBranchError } = await import('./attendanceService.js');

const STAFF_ID = '11111111-1111-1111-1111-111111111111';
const BRANCH_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BRANCH_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const input = {
  staffId: STAFF_ID,
  branchId: BRANCH_A,
  date: '2026-09-26',
  locationLabel: 'عميل خارجي',
  targetLatitude: 30.05,
  targetLongitude: 31.24,
};

function createdRecord() {
  return {
    id: 'fa-1',
    staffId: STAFF_ID,
    branchId: BRANCH_A,
    date: new Date('2026-09-26'),
    locationLabel: 'عميل خارجي',
    targetLatitude: 30.05,
    targetLongitude: 31.24,
    radiusMeters: 200,
    confirmedAt: null,
    confirmedLatitude: null,
    confirmedLongitude: null,
    distanceMeters: null,
    createdById: 'creator',
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fieldAssignmentCreate.mockResolvedValue(createdRecord());
});

describe('createFieldAssignment - the assignee must belong to the branch', () => {
  it('an employee whose HOME branch is the task branch is allowed', async () => {
    staffFindUnique.mockResolvedValue({ isDeleted: false, branchId: BRANCH_A, branchAccess: [] });
    await expect(createFieldAssignment(input, 'creator')).resolves.toBeDefined();
    expect(fieldAssignmentCreate).toHaveBeenCalledTimes(1);
  });

  it('an employee from another branch WITH an explicit access grant on the task branch is allowed', async () => {
    staffFindUnique.mockResolvedValue({ isDeleted: false, branchId: BRANCH_B, branchAccess: [{ id: 'grant-1' }] });
    await expect(createFieldAssignment(input, 'creator')).resolves.toBeDefined();
    expect(fieldAssignmentCreate).toHaveBeenCalledTimes(1);
  });

  it('an employee from another branch with NO grant is rejected and nothing is written', async () => {
    staffFindUnique.mockResolvedValue({ isDeleted: false, branchId: BRANCH_B, branchAccess: [] });
    await expect(createFieldAssignment(input, 'creator')).rejects.toThrow(FieldAssignmentStaffNotInBranchError);
    expect(fieldAssignmentCreate).not.toHaveBeenCalled();
  });

  it('the grant lookup is scoped to the task branch (a grant on some OTHER branch does not count)', async () => {
    staffFindUnique.mockResolvedValue({ isDeleted: false, branchId: BRANCH_B, branchAccess: [] });
    await expect(createFieldAssignment(input, 'creator')).rejects.toThrow(FieldAssignmentStaffNotInBranchError);
    expect(staffFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ branchAccess: expect.objectContaining({ where: { branchId: BRANCH_A } }) }),
      }),
    );
  });

  it('an unknown or deleted employee is rejected and nothing is written', async () => {
    staffFindUnique.mockResolvedValue(null);
    await expect(createFieldAssignment(input, 'creator')).rejects.toThrow(FieldAssignmentStaffNotFoundError);
    staffFindUnique.mockResolvedValue({ isDeleted: true, branchId: BRANCH_A, branchAccess: [] });
    await expect(createFieldAssignment(input, 'creator')).rejects.toThrow(FieldAssignmentStaffNotFoundError);
    expect(fieldAssignmentCreate).not.toHaveBeenCalled();
  });
});
