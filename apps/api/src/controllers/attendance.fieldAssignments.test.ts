import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Branch isolation for field assignments (owner decision, 2026-09-25 - found
 * in the read-only access review). Create/delete were gated on
 * `employees.edit` alone: the caller could file a task under any branch id
 * and delete any assignment by id. Now the assignment's own branch must be
 * one the caller can access. Real `canAccessBranch` runs; services/audit are
 * mocked (same technique as `cutover.test.ts`).
 */

const createFieldAssignment = vi.fn();
const deleteFieldAssignment = vi.fn();
const getFieldAssignmentBranchId = vi.fn();
const recordAudit = vi.fn().mockResolvedValue(undefined);

vi.mock('../services/attendanceService.js', () => ({
  createFieldAssignment,
  deleteFieldAssignment,
  getFieldAssignmentBranchId,
  FieldAssignmentNotFoundError: class FieldAssignmentNotFoundError extends Error {},
  FieldAssignmentStaffNotFoundError: class FieldAssignmentStaffNotFoundError extends Error {},
  FieldAssignmentStaffNotInBranchError: class FieldAssignmentStaffNotInBranchError extends Error {},
  AlreadyCheckedInError: class AlreadyCheckedInError extends Error {},
  AlreadyCheckedOutError: class AlreadyCheckedOutError extends Error {},
  AlreadyDoneForTodayError: class AlreadyDoneForTodayError extends Error {},
  InvalidKioskCredentialsError: class InvalidKioskCredentialsError extends Error {},
  NotCheckedInError: class NotCheckedInError extends Error {},
  TooFarFromTargetError: class TooFarFromTargetError extends Error {},
  checkIn: vi.fn(),
  checkOut: vi.fn(),
  confirmFieldAssignmentLocation: vi.fn(),
  getTodayEntryForStaff: vi.fn(),
  kioskSubmit: vi.fn(),
  listAttendanceForStaff: vi.fn(),
  listFieldAssignments: vi.fn(),
  listKioskStaff: vi.fn(),
  myTodayFieldAssignments: vi.fn(),
  upsertAttendanceEntry: vi.fn(),
}));
vi.mock('../services/auditService.js', () => ({ recordAudit }));

const { createFieldAssignmentHandler, deleteFieldAssignmentHandler } = await import('./attendance.js');

const BRANCH_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BRANCH_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STAFF_ID = '11111111-1111-1111-1111-111111111111';
const ASSIGNMENT_ID = '22222222-2222-2222-2222-222222222222';

interface FakeAuth {
  staffId: string;
  branchId: string;
  roleNames: string[];
  accessibleBranchIds: string[];
}

const branchAUser: FakeAuth = { staffId: 'staff-a', branchId: BRANCH_A, roleNames: ['ADMIN'], accessibleBranchIds: [BRANCH_A] };
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

function createReq(auth: FakeAuth, branchId: string) {
  return {
    body: {
      staffId: STAFF_ID,
      branchId,
      date: '2026-09-26',
      locationLabel: 'عميل خارجي',
      targetLatitude: 30.05,
      targetLongitude: 31.24,
    },
    auth,
  } as never;
}

const deleteReq = (auth: FakeAuth) => ({ params: { id: ASSIGNMENT_ID }, auth }) as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createFieldAssignmentHandler - branch isolation', () => {
  it('filing an assignment under a branch the caller cannot access is 403 and nothing is written or audited', async () => {
    const res = makeRes();
    await createFieldAssignmentHandler(createReq(branchAUser, BRANCH_B), res as never);

    expect(res.statusCode).toBe(403);
    expect(createFieldAssignment).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('under the caller\'s own branch it is created, and audited under that branch', async () => {
    createFieldAssignment.mockResolvedValue({ id: ASSIGNMENT_ID, branchId: BRANCH_A });
    const res = makeRes();

    await createFieldAssignmentHandler(createReq(branchAUser, BRANCH_A), res as never);

    expect(res.statusCode).toBe(201);
    expect(createFieldAssignment).toHaveBeenCalledTimes(1);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'FieldAssignment', action: 'CREATE', branchId: BRANCH_A }));
  });

  it('an assignee who does not belong to the branch is a 400 STAFF_NOT_IN_BRANCH - nothing is audited', async () => {
    const { FieldAssignmentStaffNotInBranchError } = await import('../services/attendanceService.js');
    createFieldAssignment.mockRejectedValue(new (FieldAssignmentStaffNotInBranchError as new () => Error)());
    const res = makeRes();

    await createFieldAssignmentHandler(createReq(branchAUser, BRANCH_A), res as never);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'STAFF_NOT_IN_BRANCH' } });
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('an unknown / deleted assignee is a 404 - nothing is audited', async () => {
    const { FieldAssignmentStaffNotFoundError } = await import('../services/attendanceService.js');
    createFieldAssignment.mockRejectedValue(new (FieldAssignmentStaffNotFoundError as new () => Error)());
    const res = makeRes();

    await createFieldAssignmentHandler(createReq(branchAUser, BRANCH_A), res as never);

    expect(res.statusCode).toBe(404);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('a SUPER_ADMIN may file one under any branch', async () => {
    createFieldAssignment.mockResolvedValue({ id: ASSIGNMENT_ID, branchId: BRANCH_B });
    const res = makeRes();

    await createFieldAssignmentHandler(createReq(superAdmin, BRANCH_B), res as never);

    expect(res.statusCode).toBe(201);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ branchId: BRANCH_B }));
  });
});

describe('deleteFieldAssignmentHandler - branch isolation', () => {
  it('deleting an assignment of a branch the caller cannot access is 403 and nothing is deleted or audited', async () => {
    getFieldAssignmentBranchId.mockResolvedValue(BRANCH_B);
    const res = makeRes();

    await deleteFieldAssignmentHandler(deleteReq(branchAUser), res as never);

    expect(res.statusCode).toBe(403);
    expect(deleteFieldAssignment).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('an unknown / already-deleted assignment is 404 and nothing is deleted', async () => {
    const { FieldAssignmentNotFoundError } = await import('../services/attendanceService.js');
    getFieldAssignmentBranchId.mockRejectedValue(new (FieldAssignmentNotFoundError as new () => Error)());
    const res = makeRes();

    await deleteFieldAssignmentHandler(deleteReq(branchAUser), res as never);

    expect(res.statusCode).toBe(404);
    expect(deleteFieldAssignment).not.toHaveBeenCalled();
  });

  it('deleting one of the caller\'s own branch works and is audited under that branch', async () => {
    getFieldAssignmentBranchId.mockResolvedValue(BRANCH_A);
    deleteFieldAssignment.mockResolvedValue({ branchId: BRANCH_A });
    const res = makeRes();

    await deleteFieldAssignmentHandler(deleteReq(branchAUser), res as never);

    expect(deleteFieldAssignment).toHaveBeenCalledWith(ASSIGNMENT_ID, branchAUser.staffId);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE', branchId: BRANCH_A }));
  });

  it('a SUPER_ADMIN may delete an assignment of any branch', async () => {
    getFieldAssignmentBranchId.mockResolvedValue(BRANCH_B);
    deleteFieldAssignment.mockResolvedValue({ branchId: BRANCH_B });
    const res = makeRes();

    await deleteFieldAssignmentHandler(deleteReq(superAdmin), res as never);

    expect(deleteFieldAssignment).toHaveBeenCalledTimes(1);
  });
});
