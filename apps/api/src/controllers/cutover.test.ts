import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Phase 3D re-audit fix — regression coverage for the branch-isolation
 * guard added to `verifyTreasuryOpeningHandler`/`verifyInventoryOpeningHandler`.
 * These two were the one exception to every other Cutover mutation's
 * branch check (they're identified by the line's own id, not the
 * cutover's, so they never went through `loadAndCheckBranch`) — a
 * non-Super-Admin caller scoped to Branch A could flip the verification
 * status of a Branch B cutover's line.
 *
 * Same technique as `openingState.test.ts`: everything DB-touching
 * (`getTreasuryOpeningBranchId`/`getInventoryOpeningBranchId`,
 * `setTreasuryOpeningVerification`/`setInventoryOpeningVerification`,
 * `recordAudit`) is mocked, but the real `canAccessBranch` from
 * `authContext.ts` runs unmocked — the actual authorization decision.
 */

const getTreasuryOpeningBranchId = vi.fn();
const getInventoryOpeningBranchId = vi.fn();
const setTreasuryOpeningVerification = vi.fn();
const setInventoryOpeningVerification = vi.fn();
const recordAudit = vi.fn().mockResolvedValue(undefined);

vi.mock('../services/cutoverService.js', () => ({
  getTreasuryOpeningBranchId,
  getInventoryOpeningBranchId,
  setTreasuryOpeningVerification,
  setInventoryOpeningVerification,
  TreasuryOpeningNotFoundError: class TreasuryOpeningNotFoundError extends Error {},
  InventoryOpeningNotFoundError: class InventoryOpeningNotFoundError extends Error {},
  CutoverNotFoundError: class CutoverNotFoundError extends Error {},
  CutoverNotEditableError: class CutoverNotEditableError extends Error {},
  CutoverNotReadyForApprovalError: class CutoverNotReadyForApprovalError extends Error {},
  CutoverNotReadyForSubmissionError: class CutoverNotReadyForSubmissionError extends Error {},
  CutoverActivationNotAllowedError: class CutoverActivationNotAllowedError extends Error {},
  CutoverApprovalNotAllowedError: class CutoverApprovalNotAllowedError extends Error {},
  CutoverSupersedeNotAllowedError: class CutoverSupersedeNotAllowedError extends Error {},
  ActiveCutoverExistsError: class ActiveCutoverExistsError extends Error {},
  InvalidCutoverDatesError: class InvalidCutoverDatesError extends Error {},
  InvalidCutoverTransitionError: class InvalidCutoverTransitionError extends Error {},
  getCutover: vi.fn(),
  listCutovers: vi.fn(),
  listInventoryOpenings: vi.fn(),
  listTreasuryOpenings: vi.fn(),
  createCutover: vi.fn(),
  submitCutoverForReview: vi.fn(),
  approveCutover: vi.fn(),
  activateCutover: vi.fn(),
  reopenCutover: vi.fn(),
  supersedeCutover: vi.fn(),
  upsertTreasuryOpening: vi.fn(),
  upsertInventoryOpening: vi.fn(),
}));
vi.mock('../services/auditService.js', () => ({ recordAudit }));

const { verifyTreasuryOpeningHandler, verifyInventoryOpeningHandler } = await import('./cutover.js');

interface FakeAuth {
  staffId: string;
  roleNames: string[];
  accessibleBranchIds: string[];
}

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

function makeReq(lineId: string, auth: FakeAuth) {
  return {
    params: { lineId },
    body: { verificationStatus: 'VERIFIED' },
    auth,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('verifyTreasuryOpeningHandler — branch isolation', () => {
  it('a caller scoped to the line\'s own branch may verify it', async () => {
    getTreasuryOpeningBranchId.mockResolvedValue('branch-1');
    setTreasuryOpeningVerification.mockResolvedValue({ id: 'line-1', verificationStatus: 'VERIFIED' });
    const res = makeRes();

    await verifyTreasuryOpeningHandler(makeReq('line-1', { staffId: 'staff-1', roleNames: ['SALES'], accessibleBranchIds: ['branch-1'] }), res as never);

    expect(setTreasuryOpeningVerification).toHaveBeenCalledWith('line-1', true, ['SALES']);
    expect(res.body).toMatchObject({ success: true });
  });

  it('a caller scoped to a different branch is rejected with 403 and never reaches the service', async () => {
    getTreasuryOpeningBranchId.mockResolvedValue('branch-2');
    const res = makeRes();

    await verifyTreasuryOpeningHandler(makeReq('line-1', { staffId: 'staff-1', roleNames: ['SALES'], accessibleBranchIds: ['branch-1'] }), res as never);

    expect(setTreasuryOpeningVerification).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('SUPER_ADMIN bypasses branch scoping regardless of accessibleBranchIds', async () => {
    getTreasuryOpeningBranchId.mockResolvedValue('branch-2');
    setTreasuryOpeningVerification.mockResolvedValue({ id: 'line-1', verificationStatus: 'VERIFIED' });
    const res = makeRes();

    await verifyTreasuryOpeningHandler(makeReq('line-1', { staffId: 'staff-1', roleNames: ['SUPER_ADMIN'], accessibleBranchIds: ['branch-1'] }), res as never);

    expect(setTreasuryOpeningVerification).toHaveBeenCalledWith('line-1', true, ['SUPER_ADMIN']);
  });
});

describe('verifyInventoryOpeningHandler — branch isolation', () => {
  it('a caller scoped to the line\'s own branch may verify it', async () => {
    getInventoryOpeningBranchId.mockResolvedValue('branch-1');
    setInventoryOpeningVerification.mockResolvedValue({ id: 'line-1', verificationStatus: 'VERIFIED' });
    const res = makeRes();

    await verifyInventoryOpeningHandler(makeReq('line-1', { staffId: 'staff-1', roleNames: ['SALES'], accessibleBranchIds: ['branch-1'] }), res as never);

    expect(setInventoryOpeningVerification).toHaveBeenCalledWith('line-1', true, ['SALES']);
  });

  it('a caller scoped to a different branch is rejected with 403 and never reaches the service', async () => {
    getInventoryOpeningBranchId.mockResolvedValue('branch-2');
    const res = makeRes();

    await verifyInventoryOpeningHandler(makeReq('line-1', { staffId: 'staff-1', roleNames: ['SALES'], accessibleBranchIds: ['branch-1'] }), res as never);

    expect(setInventoryOpeningVerification).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('a nonexistent line 404s before any branch check or service call', async () => {
    const { InventoryOpeningNotFoundError } = await import('../services/cutoverService.js');
    getInventoryOpeningBranchId.mockRejectedValue(new (InventoryOpeningNotFoundError as new (...a: never[]) => Error)());
    const res = makeRes();

    await verifyInventoryOpeningHandler(makeReq('line-missing', { staffId: 'staff-1', roleNames: ['SALES'], accessibleBranchIds: ['branch-1'] }), res as never);

    expect(setInventoryOpeningVerification).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
  });
});
