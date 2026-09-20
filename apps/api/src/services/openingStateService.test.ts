import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Opening State / Cutover (Phase 3C.2) — the credit-floor invariant
 * (Phase 3C.1 §7): CustomerOpening.creditAmount can never be edited below
 * what's already been consumed via OPENING_CREDIT_APPLICATION payments,
 * with no SUPER_ADMIN override (an arithmetic integrity rule, not a
 * permission decision).
 */

const customerOpeningFindUnique = vi.fn();
const customerOpeningUpdate = vi.fn();
const supplierOpeningFindUnique = vi.fn();
const supplierOpeningUpdate = vi.fn();
const paymentAggregate = vi.fn();

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    customerOpening: {
      findUnique: (...args: unknown[]) => customerOpeningFindUnique(...args),
      update: (...args: unknown[]) => customerOpeningUpdate(...args),
    },
    supplierOpening: {
      findUnique: (...args: unknown[]) => supplierOpeningFindUnique(...args),
      update: (...args: unknown[]) => supplierOpeningUpdate(...args),
    },
    payment: { aggregate: (...args: unknown[]) => paymentAggregate(...args) },
  },
}));

// openingStateService.ts imports orderService.js (for ORDER_INCLUDE/mapOrderToDto)
// — not exercised by these tests, but must resolve without error at import
// time. `cutoverService.js` (for assertCanApprove/CutoverApprovalNotAllowedError/
// VerificationNotAllowedError) is deliberately left UNMOCKED — the real,
// pure `assertCanApprove` runs for real in the maker-checker integration
// tests below, giving genuine cross-module coverage (it has zero DB calls
// of its own, so the shared `../lib/prisma.js` mock above is never touched
// by it either way).
vi.mock('./orderService.js', () => ({ ORDER_INCLUDE: {}, mapOrderToDto: vi.fn() }));

const {
  updateCustomerOpening,
  correctCustomerOpeningCredit,
  approveCustomerOpening,
  approveSupplierOpening,
  CreditBelowConsumedError,
  CreditCorrectionNotAllowedError,
  CustomerOpeningNotFoundError,
  OpeningNotEditableError,
} = await import('./openingStateService.js');
const { CutoverApprovalNotAllowedError } = await import('./cutoverService.js');

const OPENING_ID = '11111111-1111-1111-1111-111111111111';
const PARTNER_ID = '22222222-2222-2222-2222-222222222222';
const MAKER_ID = '44444444-4444-4444-4444-444444444444';

function decimal(n: number) {
  return { toNumber: () => n };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('updateCustomerOpening — credit floor guard', () => {
  it('rejects a creditAmount below what has already been consumed', async () => {
    customerOpeningFindUnique.mockResolvedValue({ id: OPENING_ID, partnerId: PARTNER_ID, status: 'DRAFT' });
    paymentAggregate.mockResolvedValue({ _sum: { amount: decimal(3000) } });

    await expect(updateCustomerOpening(OPENING_ID, { creditAmount: 2999.99 })).rejects.toThrow(CreditBelowConsumedError);
    expect(customerOpeningUpdate).not.toHaveBeenCalled();
  });

  it('allows a creditAmount exactly equal to what has been consumed (boundary)', async () => {
    customerOpeningFindUnique.mockResolvedValue({ id: OPENING_ID, partnerId: PARTNER_ID, status: 'DRAFT' });
    paymentAggregate.mockResolvedValue({ _sum: { amount: decimal(3000) } });
    customerOpeningUpdate.mockResolvedValue({
      id: OPENING_ID,
      partnerId: PARTNER_ID,
      receivableAmount: decimal(0),
      creditAmount: decimal(3000),
      status: 'DRAFT',
      approvedById: null,
      approvedAt: null,
      reopenedById: null,
      reopenedAt: null,
      reopenReason: null,
      verificationStatus: 'UNVERIFIED',
      notes: null,
      enteredById: 'staff-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(updateCustomerOpening(OPENING_ID, { creditAmount: 3000 })).resolves.toMatchObject({ creditAmount: 3000 });
  });

  it('allows raising creditAmount above what has been consumed', async () => {
    customerOpeningFindUnique.mockResolvedValue({ id: OPENING_ID, partnerId: PARTNER_ID, status: 'DRAFT' });
    paymentAggregate.mockResolvedValue({ _sum: { amount: decimal(1000) } });
    customerOpeningUpdate.mockResolvedValue({
      id: OPENING_ID,
      partnerId: PARTNER_ID,
      receivableAmount: decimal(0),
      creditAmount: decimal(9999),
      status: 'DRAFT',
      approvedById: null,
      approvedAt: null,
      reopenedById: null,
      reopenedAt: null,
      reopenReason: null,
      verificationStatus: 'UNVERIFIED',
      notes: null,
      enteredById: 'staff-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(updateCustomerOpening(OPENING_ID, { creditAmount: 9999 })).resolves.toMatchObject({ creditAmount: 9999 });
  });

  it('does not check consumption when creditAmount is not part of the edit', async () => {
    customerOpeningFindUnique.mockResolvedValue({ id: OPENING_ID, partnerId: PARTNER_ID, status: 'DRAFT' });
    customerOpeningUpdate.mockResolvedValue({
      id: OPENING_ID,
      partnerId: PARTNER_ID,
      receivableAmount: decimal(500),
      creditAmount: decimal(0),
      status: 'DRAFT',
      approvedById: null,
      approvedAt: null,
      reopenedById: null,
      reopenedAt: null,
      reopenReason: null,
      verificationStatus: 'UNVERIFIED',
      notes: null,
      enteredById: 'staff-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await updateCustomerOpening(OPENING_ID, { receivableAmount: 500 });
    expect(paymentAggregate).not.toHaveBeenCalled();
  });

  it('rejects editing an opening that is no longer DRAFT (must be reopened first)', async () => {
    customerOpeningFindUnique.mockResolvedValue({ id: OPENING_ID, partnerId: PARTNER_ID, status: 'APPROVED' });
    await expect(updateCustomerOpening(OPENING_ID, { creditAmount: 100 })).rejects.toThrow(OpeningNotEditableError);
  });
});

const STAFF_ID = '33333333-3333-3333-3333-333333333333';

/**
 * Cutover-revision-round decision (post-3D, Decision A) — the dedicated
 * correction path, deliberately separate from `updateCustomerOpening`
 * above and its own suite: SUPER_ADMIN only (no ADMIN exception, unlike
 * maker-checker approval), works regardless of the record's current
 * status (the whole point is fixing an already-APPROVED mistake), and
 * deliberately does NOT re-check consumption the way the normal edit
 * path does — a correction is an acknowledgment the original figure was
 * wrong, not a normal edit.
 */
describe('correctCustomerOpeningCredit — SUPER_ADMIN-only correction path', () => {
  const baseRecord = {
    id: OPENING_ID,
    partnerId: PARTNER_ID,
    receivableAmount: decimal(0),
    creditAmount: decimal(3000),
    status: 'APPROVED',
    approvedById: 'someone-else',
    approvedAt: new Date(),
    reopenedById: null,
    reopenedAt: null,
    reopenReason: null,
    verificationStatus: 'VERIFIED',
    notes: null,
    enteredById: 'staff-1',
    creditCorrectedById: null,
    creditCorrectedAt: null,
    creditCorrectionReason: null,
    selfApprovedException: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('SUPER_ADMIN can correct the credit amount with a reason, even on an APPROVED record', async () => {
    customerOpeningFindUnique.mockResolvedValue(baseRecord);
    customerOpeningUpdate.mockResolvedValue({
      ...baseRecord,
      creditAmount: decimal(500),
      creditCorrectedById: STAFF_ID,
      creditCorrectedAt: new Date(),
      creditCorrectionReason: 'رصيد اتسجل غلط وقت الإدخال الأول',
    });

    const result = await correctCustomerOpeningCredit(OPENING_ID, 500, 'رصيد اتسجل غلط وقت الإدخال الأول', STAFF_ID, ['SUPER_ADMIN']);

    expect(result.creditAmount).toBe(500);
    expect(result.creditCorrectionReason).toBe('رصيد اتسجل غلط وقت الإدخال الأول');
    expect(customerOpeningUpdate).toHaveBeenCalledWith({
      where: { id: OPENING_ID },
      data: {
        creditAmount: 500,
        creditCorrectedById: STAFF_ID,
        creditCorrectedAt: expect.any(Date),
        creditCorrectionReason: 'رصيد اتسجل غلط وقت الإدخال الأول',
      },
    });
  });

  it('rejects an ADMIN (not SUPER_ADMIN) — no ADMIN exception on this path, unlike maker-checker approval', async () => {
    await expect(correctCustomerOpeningCredit(OPENING_ID, 500, 'سبب', STAFF_ID, ['ADMIN'])).rejects.toThrow(CreditCorrectionNotAllowedError);
    expect(customerOpeningFindUnique).not.toHaveBeenCalled();
    expect(customerOpeningUpdate).not.toHaveBeenCalled();
  });

  it('rejects a caller with no elevated role at all', async () => {
    await expect(correctCustomerOpeningCredit(OPENING_ID, 500, 'سبب', STAFF_ID, ['SALES'])).rejects.toThrow(CreditCorrectionNotAllowedError);
  });

  it('allows correcting BELOW already-consumed credit — the entire point of this path, unlike the normal edit above', async () => {
    customerOpeningFindUnique.mockResolvedValue(baseRecord);
    customerOpeningUpdate.mockResolvedValue({ ...baseRecord, creditAmount: decimal(0) });

    await expect(
      correctCustomerOpeningCredit(OPENING_ID, 0, 'العميل كان مسجل رصيد وهمي بالغلط', STAFF_ID, ['SUPER_ADMIN']),
    ).resolves.toBeDefined();
    // Structural proof this path never re-checks consumption: the aggregate is simply never called.
    expect(paymentAggregate).not.toHaveBeenCalled();
  });

  it('rejects a nonexistent CustomerOpening', async () => {
    customerOpeningFindUnique.mockResolvedValue(null);
    await expect(correctCustomerOpeningCredit(OPENING_ID, 500, 'سبب', STAFF_ID, ['SUPER_ADMIN'])).rejects.toThrow(CustomerOpeningNotFoundError);
  });
});

/**
 * Cutover-revision-round decision (post-3D, Decision C) — thin
 * integration coverage confirming `approveCustomerOpening` wires the
 * shared `assertCanApprove` primitive correctly (using `enteredById` as
 * the maker, not `approvedById`/some other field) and persists its return
 * value as `selfApprovedException`. The full self-approval/role matrix
 * itself is tested once, authoritatively, in cutoverService.test.ts —
 * not repeated here.
 */
describe('approveCustomerOpening — maker-checker integration', () => {
  function baseDraft(enteredById: string) {
    return {
      id: OPENING_ID,
      partnerId: PARTNER_ID,
      receivableAmount: decimal(0),
      creditAmount: decimal(1000),
      status: 'DRAFT',
      verificationStatus: 'VERIFIED',
      approvedById: null,
      approvedAt: null,
      reopenedById: null,
      reopenedAt: null,
      reopenReason: null,
      notes: null,
      enteredById,
      creditCorrectedById: null,
      creditCorrectedAt: null,
      creditCorrectionReason: null,
      selfApprovedException: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  it('SUPER_ADMIN approving their OWN CustomerOpening succeeds and persists selfApprovedException: true', async () => {
    customerOpeningFindUnique.mockResolvedValue(baseDraft(STAFF_ID)); // enteredById === approver
    customerOpeningUpdate.mockResolvedValue({ ...baseDraft(STAFF_ID), status: 'APPROVED', selfApprovedException: true });

    const result = await approveCustomerOpening(OPENING_ID, STAFF_ID, ['SUPER_ADMIN']);

    expect(result.selfApprovedException).toBe(true);
    expect(customerOpeningUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ selfApprovedException: true }) }),
    );
  });

  it('ADMIN approving someone ELSE\'s CustomerOpening succeeds and persists selfApprovedException: false', async () => {
    customerOpeningFindUnique.mockResolvedValue(baseDraft(MAKER_ID)); // enteredById !== approver (STAFF_ID)
    customerOpeningUpdate.mockResolvedValue({ ...baseDraft(MAKER_ID), status: 'APPROVED', selfApprovedException: false });

    await approveCustomerOpening(OPENING_ID, STAFF_ID, ['ADMIN']);

    expect(customerOpeningUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ selfApprovedException: false }) }),
    );
  });

  it('ADMIN approving their OWN CustomerOpening is rejected before any update', async () => {
    customerOpeningFindUnique.mockResolvedValue(baseDraft(STAFF_ID));
    await expect(approveCustomerOpening(OPENING_ID, STAFF_ID, ['ADMIN'])).rejects.toThrow(CutoverApprovalNotAllowedError);
    expect(customerOpeningUpdate).not.toHaveBeenCalled();
  });

  it('a non-admin approving someone else\'s CustomerOpening is rejected before any update', async () => {
    customerOpeningFindUnique.mockResolvedValue(baseDraft(MAKER_ID));
    await expect(approveCustomerOpening(OPENING_ID, STAFF_ID, [])).rejects.toThrow(CutoverApprovalNotAllowedError);
    expect(customerOpeningUpdate).not.toHaveBeenCalled();
  });
});

/** Same integration coverage as approveCustomerOpening above, for SupplierOpening — same shared primitive, same "thin wiring test, not the full matrix" reasoning. */
describe('approveSupplierOpening — maker-checker integration', () => {
  function baseDraft(enteredById: string) {
    return {
      id: OPENING_ID,
      partnerId: PARTNER_ID,
      payableAmount: decimal(0),
      creditAmount: decimal(0),
      status: 'DRAFT',
      verificationStatus: 'VERIFIED',
      approvedById: null,
      approvedAt: null,
      reopenedById: null,
      reopenedAt: null,
      reopenReason: null,
      notes: null,
      enteredById,
      selfApprovedException: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  it('SUPER_ADMIN approving their OWN SupplierOpening succeeds and persists selfApprovedException: true', async () => {
    supplierOpeningFindUnique.mockResolvedValue(baseDraft(STAFF_ID));
    supplierOpeningUpdate.mockResolvedValue({ ...baseDraft(STAFF_ID), status: 'APPROVED', selfApprovedException: true });

    const result = await approveSupplierOpening(OPENING_ID, STAFF_ID, ['SUPER_ADMIN']);

    expect(result.selfApprovedException).toBe(true);
    expect(supplierOpeningUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ selfApprovedException: true }) }),
    );
  });

  it('ADMIN approving someone ELSE\'s SupplierOpening succeeds and persists selfApprovedException: false', async () => {
    supplierOpeningFindUnique.mockResolvedValue(baseDraft(MAKER_ID));
    supplierOpeningUpdate.mockResolvedValue({ ...baseDraft(MAKER_ID), status: 'APPROVED', selfApprovedException: false });

    await approveSupplierOpening(OPENING_ID, STAFF_ID, ['ADMIN']);

    expect(supplierOpeningUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ selfApprovedException: false }) }),
    );
  });

  it('ADMIN approving their OWN SupplierOpening is rejected before any update', async () => {
    supplierOpeningFindUnique.mockResolvedValue(baseDraft(STAFF_ID));
    await expect(approveSupplierOpening(OPENING_ID, STAFF_ID, ['ADMIN'])).rejects.toThrow(CutoverApprovalNotAllowedError);
    expect(supplierOpeningUpdate).not.toHaveBeenCalled();
  });

  it('a non-admin approving someone else\'s SupplierOpening is rejected before any update', async () => {
    supplierOpeningFindUnique.mockResolvedValue(baseDraft(MAKER_ID));
    await expect(approveSupplierOpening(OPENING_ID, STAFF_ID, [])).rejects.toThrow(CutoverApprovalNotAllowedError);
    expect(supplierOpeningUpdate).not.toHaveBeenCalled();
  });
});
