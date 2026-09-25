import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * First automated tests for the call-log service (CRM review, 2026-09-25): list filters, create
 * mapping, the branch lookups the controller's access checks rely on (the log's own branch, and
 * the branch of the customer/lead a new log points at), partial update and soft delete.
 * Only prisma is mocked.
 */

const callLogFindMany = vi.fn();
const callLogFindUnique = vi.fn();
const callLogCreate = vi.fn();
const callLogUpdate = vi.fn();
const partnerFindUnique = vi.fn();
const leadFindUnique = vi.fn();

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    callLog: {
      findMany: (...a: unknown[]) => callLogFindMany(...a),
      findUnique: (...a: unknown[]) => callLogFindUnique(...a),
      create: (...a: unknown[]) => callLogCreate(...a),
      update: (...a: unknown[]) => callLogUpdate(...a),
    },
    businessPartner: { findUnique: (...a: unknown[]) => partnerFindUnique(...a) },
    lead: { findUnique: (...a: unknown[]) => leadFindUnique(...a) },
  },
}));

const {
  listCallLogs,
  createCallLog,
  getCallLogBranchId,
  getCallTargetBranchIds,
  updateCallLog,
  deleteCallLog,
  CallLogNotFoundError,
  CallLogTargetNotFoundError,
} = await import('./callLogService.js');

const ID = '11111111-1111-1111-1111-111111111111';
const BRANCH_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BRANCH_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    direction: 'INBOUND',
    purpose: 'استفسار عن سعر',
    outcome: 'NEEDS_FOLLOWUP',
    notes: null,
    partnerId: null,
    partner: null,
    leadId: null,
    lead: null,
    contactName: 'متصل جديد',
    contactPhone: '01000000000',
    branchId: BRANCH_A,
    staffId: 'staff-1',
    staff: { name: 'عمر' },
    followUpDate: new Date('2026-09-30T00:00:00Z'),
    isDeleted: false,
    createdAt: new Date('2026-09-25T00:00:00Z'),
    updatedAt: new Date('2026-09-25T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  callLogUpdate.mockImplementation(() => Promise.resolve(row()));
});

describe('listCallLogs', () => {
  it('excludes deleted logs and applies the customer / lead / branch filters together', async () => {
    callLogFindMany.mockResolvedValue([]);
    await listCallLogs({ partnerId: 'p1', leadId: 'l1', branchIds: [BRANCH_A] });
    expect(callLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isDeleted: false, partnerId: 'p1', leadId: 'l1', branchId: { in: [BRANCH_A] } } }),
    );
  });

  it('with no filters (SUPER_ADMIN, whole list) only the deleted flag applies', async () => {
    callLogFindMany.mockResolvedValue([]);
    await listCallLogs({});
    expect(callLogFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isDeleted: false } }));
  });

  it('maps dates and the employee name', async () => {
    callLogFindMany.mockResolvedValue([row()]);
    const [log] = await listCallLogs({});
    expect(log).toMatchObject({ staffName: 'عمر', followUpDate: '2026-09-30T00:00:00.000Z', outcome: 'NEEDS_FOLLOWUP' });
  });
});

describe('createCallLog', () => {
  it('records the caller as the employee, defaults the optional links to null and converts the follow-up date', async () => {
    callLogCreate.mockResolvedValue(row());
    await createCallLog({ direction: 'INBOUND', purpose: 'استفسار', outcome: 'NEEDS_FOLLOWUP', branchId: BRANCH_A, contactName: 'متصل', followUpDate: '2026-09-30' } as never, 'staff-1');
    expect(callLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ staffId: 'staff-1', partnerId: null, leadId: null, notes: null, followUpDate: expect.any(Date) }),
      }),
    );
  });
});

describe('getCallLogBranchId', () => {
  it('returns the log\'s branch and 404s a missing or deleted log', async () => {
    callLogFindUnique.mockResolvedValue({ branchId: BRANCH_B, isDeleted: false });
    await expect(getCallLogBranchId(ID)).resolves.toBe(BRANCH_B);
    callLogFindUnique.mockResolvedValue(null);
    await expect(getCallLogBranchId(ID)).rejects.toThrow(CallLogNotFoundError);
    callLogFindUnique.mockResolvedValue({ branchId: BRANCH_B, isDeleted: true });
    await expect(getCallLogBranchId(ID)).rejects.toThrow(CallLogNotFoundError);
  });
});

describe('getCallTargetBranchIds', () => {
  it('returns the branch of the linked customer or lead (nothing when the log links to neither)', async () => {
    partnerFindUnique.mockResolvedValue({ branchId: BRANCH_B, isDeleted: false });
    await expect(getCallTargetBranchIds({ partnerId: 'p1' })).resolves.toEqual([BRANCH_B]);
    leadFindUnique.mockResolvedValue({ branchId: BRANCH_A, isDeleted: false });
    await expect(getCallTargetBranchIds({ leadId: 'l1' })).resolves.toEqual([BRANCH_A]);
    await expect(getCallTargetBranchIds({})).resolves.toEqual([]);
  });

  it('a missing or deleted customer / lead is CallLogTargetNotFoundError', async () => {
    partnerFindUnique.mockResolvedValue(null);
    await expect(getCallTargetBranchIds({ partnerId: 'p1' })).rejects.toThrow(CallLogTargetNotFoundError);
    leadFindUnique.mockResolvedValue({ branchId: BRANCH_A, isDeleted: true });
    await expect(getCallTargetBranchIds({ leadId: 'l1' })).rejects.toThrow(CallLogTargetNotFoundError);
  });
});

describe('updateCallLog / deleteCallLog', () => {
  it('a partial update only sends the provided fields and can never change the branch, customer or lead', async () => {
    callLogFindUnique.mockResolvedValue(row());
    await updateCallLog(ID, { outcome: 'RESOLVED', notes: 'تم الرد' } as never);
    expect(callLogUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { outcome: 'RESOLVED', notes: 'تم الرد' } }));
  });

  it('a missing/deleted log throws and writes nothing', async () => {
    callLogFindUnique.mockResolvedValue(row({ isDeleted: true }));
    await expect(updateCallLog(ID, { outcome: 'RESOLVED' } as never)).rejects.toThrow(CallLogNotFoundError);
    await expect(deleteCallLog(ID, 'staff-1')).rejects.toThrow(CallLogNotFoundError);
    expect(callLogUpdate).not.toHaveBeenCalled();
  });

  it('delete is a soft delete recording who deleted it', async () => {
    callLogFindUnique.mockResolvedValue(row());
    await deleteCallLog(ID, 'staff-1');
    expect(callLogUpdate).toHaveBeenCalledWith({ where: { id: ID }, data: { isDeleted: true, deletedAt: expect.any(Date), deletedBy: 'staff-1' } });
  });
});
