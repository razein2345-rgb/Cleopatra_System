import type { Request, Response } from 'express';
import {
  createCutoverSchema,
  createInventoryOpeningSchema,
  createTreasuryOpeningSchema,
  reopenCutoverSchema,
  supersedeCutoverSchema,
  verifyOpeningLineSchema,
} from '@cleopatra/shared';
import { canAccessBranch, forbidBranch } from '../services/authContext.js';
import { recordAudit } from '../services/auditService.js';
import { runIdempotent, idempotencyKeyFromHeader, sendIdempotencyError } from '../services/idempotencyService.js';
import {
  activateCutover,
  approveCutover,
  createCutover,
  CutoverActivationNotAllowedError,
  CutoverApprovalNotAllowedError,
  CutoverNotEditableError,
  CutoverNotFoundError,
  CutoverNotReadyForApprovalError,
  CutoverNotReadyForSubmissionError,
  CutoverSupersededError,
  CutoverSupersedeNotAllowedError,
  ActiveCutoverExistsError,
  InvalidCutoverDatesError,
  InvalidCutoverTransitionError,
  getCutover,
  getInventoryOpeningBranchId,
  getTreasuryOpeningBranchId,
  InventoryOpeningNotFoundError,
  listCutovers,
  listInventoryOpenings,
  listTreasuryOpenings,
  reopenCutover,
  setInventoryOpeningVerification,
  setTreasuryOpeningVerification,
  submitCutoverForReview,
  supersedeCutover,
  TreasuryOpeningNotFoundError,
  upsertInventoryOpening,
  upsertTreasuryOpening,
  VerificationNotAllowedError,
} from '../services/cutoverService.js';

/** Opening State / Cutover (Phase 3C.2) — deliberately no new permission module (would need a seed run this phase cannot perform, per the read-only-database rule). Gated by `requireAuth` + explicit branch/role checks, matching the existing hardcoded-role idiom already used for treasury/payroll's own elevated actions. */

function handleServiceError(err: unknown, res: Response): boolean {
  if (err instanceof CutoverNotFoundError || err instanceof TreasuryOpeningNotFoundError || err instanceof InventoryOpeningNotFoundError) {
    res.status(404).json({ success: false, error: { message: err.message } });
    return true;
  }
  if (
    err instanceof ActiveCutoverExistsError ||
    err instanceof InvalidCutoverDatesError ||
    err instanceof InvalidCutoverTransitionError ||
    err instanceof CutoverSupersededError ||
    err instanceof CutoverNotReadyForSubmissionError ||
    err instanceof CutoverNotReadyForApprovalError ||
    err instanceof CutoverNotEditableError
  ) {
    res.status(409).json({ success: false, error: { message: err.message, code: err.name } });
    return true;
  }
  if (
    err instanceof CutoverApprovalNotAllowedError ||
    err instanceof CutoverActivationNotAllowedError ||
    err instanceof CutoverSupersedeNotAllowedError
  ) {
    res.status(403).json({ success: false, error: { message: err.message, code: err.name } });
    return true;
  }
  // Cutover-revision-round decision (post-3D) — new error, gets an Arabic
  // message here per the owner's explicit rule for this revision round;
  // the English-message errors above are pre-existing and intentionally
  // left untouched (tracked separately, see KNOWN_ISSUES.md).
  if (err instanceof VerificationNotAllowedError) {
    res.status(403).json({ success: false, error: { message: 'التحقق من بند الافتتاح يتطلب صلاحية مدير (ADMIN) أو مسؤول عام (SUPER_ADMIN).', code: err.name } });
    return true;
  }
  return false;
}

export async function createCutoverHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createCutoverSchema.parse(req.body);
  if (!canAccessBranch(auth, input.branchId)) return forbidBranch(res);

  try {
    const cutover = await createCutover(input, auth.staffId);
    await recordAudit({ entityType: 'CutoverRecord', entityId: cutover.id, action: 'CREATE', performedById: auth.staffId, branchId: cutover.branchId, newValue: cutover });
    res.status(201).json({ success: true, data: cutover });
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }
}

export async function listCutoversHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const branchIds = auth.roleNames.includes('SUPER_ADMIN') ? undefined : auth.accessibleBranchIds;
  const cutovers = await listCutovers(branchIds);
  res.json({ success: true, data: cutovers });
}

async function loadAndCheckBranch(req: Request<{ id: string }>, res: Response): Promise<Awaited<ReturnType<typeof getCutover>> | null> {
  const auth = req.auth!;
  try {
    const cutover = await getCutover(req.params.id);
    if (!canAccessBranch(auth, cutover.branchId)) {
      forbidBranch(res);
      return null;
    }
    return cutover;
  } catch (err) {
    if (handleServiceError(err, res)) return null;
    throw err;
  }
}

export async function getCutoverHandler(req: Request<{ id: string }>, res: Response) {
  const cutover = await loadAndCheckBranch(req, res);
  if (!cutover) return;
  const [treasuryOpenings, inventoryOpenings] = await Promise.all([
    listTreasuryOpenings(cutover.id),
    listInventoryOpenings(cutover.id),
  ]);
  res.json({ success: true, data: { ...cutover, treasuryOpenings, inventoryOpenings } });
}

export async function submitCutoverHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const cutover = await loadAndCheckBranch(req, res);
  if (!cutover) return;
  try {
    const updated = await submitCutoverForReview(cutover.id, auth.staffId);
    await recordAudit({ entityType: 'CutoverRecord', entityId: updated.id, action: 'STATUS_CHANGE', performedById: auth.staffId, branchId: updated.branchId, newValue: { status: updated.status } });
    res.json({ success: true, data: updated });
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }
}

export async function approveCutoverHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const cutover = await loadAndCheckBranch(req, res);
  if (!cutover) return;
  try {
    const updated = await approveCutover(cutover.id, auth.staffId, auth.roleNames);
    await recordAudit({ entityType: 'CutoverRecord', entityId: updated.id, action: 'APPROVE', performedById: auth.staffId, branchId: updated.branchId, newValue: { status: updated.status, approvedById: updated.approvedById } });
    res.json({ success: true, data: updated });
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }
}

/** Only handler wrapped in `runIdempotent` — the one consequential, side-effect-producing (real StockMovement rows) transition, per Phase 3A.1 §20/3C.2 §34. */
export async function activateCutoverHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const cutover = await loadAndCheckBranch(req, res);
  if (!cutover) return;

  const idempotencyKey = idempotencyKeyFromHeader(req.header('Idempotency-Key'));
  try {
    const outcome = await runIdempotent(idempotencyKey, auth.staffId, 'POST /api/cutover/:id/activate', { id: cutover.id }, async () => {
      const updated = await activateCutover(cutover.id, auth.staffId, auth.roleNames);
      await recordAudit({ entityType: 'CutoverRecord', entityId: updated.id, action: 'STATUS_CHANGE', performedById: auth.staffId, branchId: updated.branchId, newValue: { status: updated.status, activatedById: updated.activatedById } });
      return { statusCode: 200, body: { success: true, data: updated } };
    });
    res.status(outcome.statusCode).json(outcome.body);
  } catch (err) {
    if (sendIdempotencyError(err, res)) return;
    if (handleServiceError(err, res)) return;
    throw err;
  }
}

export async function reopenCutoverHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = reopenCutoverSchema.parse(req.body);
  const cutover = await loadAndCheckBranch(req, res);
  if (!cutover) return;
  try {
    const updated = await reopenCutover(cutover.id, auth.staffId, auth.roleNames, input.reason);
    await recordAudit({ entityType: 'CutoverRecord', entityId: updated.id, action: 'STATUS_CHANGE', performedById: auth.staffId, branchId: updated.branchId, newValue: { status: updated.status, reopenReason: input.reason } });
    res.json({ success: true, data: updated });
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }
}

export async function supersedeCutoverHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = supersedeCutoverSchema.parse(req.body);
  const cutover = await loadAndCheckBranch(req, res);
  if (!cutover) return;
  try {
    const updated = await supersedeCutover(cutover.id, auth.staffId, auth.roleNames, input.reason);
    await recordAudit({ entityType: 'CutoverRecord', entityId: updated.id, action: 'STATUS_CHANGE', performedById: auth.staffId, branchId: updated.branchId, newValue: { isSuperseded: true, supersededReason: input.reason } });
    res.json({ success: true, data: updated });
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }
}

export async function createTreasuryOpeningHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = createTreasuryOpeningSchema.parse(req.body);
  const cutover = await loadAndCheckBranch(req, res);
  if (!cutover) return;
  try {
    const row = await upsertTreasuryOpening(cutover.id, input, auth.staffId);
    await recordAudit({ entityType: 'TreasuryOpening', entityId: row.id, action: 'CREATE', performedById: auth.staffId, branchId: cutover.branchId, newValue: row });
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }
}

/**
 * Phase 3D re-audit fix — this route is identified by the line's own id,
 * not the cutover's, so it never went through `loadAndCheckBranch` like
 * every sibling Cutover mutation; the branch check was missing entirely.
 * Resolves the line's parent Cutover's branch first, same authorization
 * shape as `createTreasuryOpeningHandler` above (branch access only, no
 * extra role restriction — creating a line has none either, so verifying
 * one shouldn't gain a stricter, undesigned requirement).
 */
export async function verifyTreasuryOpeningHandler(req: Request<{ lineId: string }>, res: Response) {
  const auth = req.auth!;
  const input = verifyOpeningLineSchema.parse(req.body);
  try {
    const branchId = await getTreasuryOpeningBranchId(req.params.lineId);
    if (!canAccessBranch(auth, branchId)) {
      forbidBranch(res);
      return;
    }
    const row = await setTreasuryOpeningVerification(req.params.lineId, input.verificationStatus === 'VERIFIED', auth.roleNames);
    await recordAudit({ entityType: 'TreasuryOpening', entityId: row.id, action: 'STATUS_CHANGE', performedById: auth.staffId, branchId, newValue: { verificationStatus: row.verificationStatus } });
    res.json({ success: true, data: row });
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }
}

export async function createInventoryOpeningHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = createInventoryOpeningSchema.parse(req.body);
  const cutover = await loadAndCheckBranch(req, res);
  if (!cutover) return;
  try {
    const row = await upsertInventoryOpening(cutover.id, input, auth.staffId);
    await recordAudit({ entityType: 'InventoryOpening', entityId: row.id, action: 'CREATE', performedById: auth.staffId, branchId: cutover.branchId, newValue: row });
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }
}

/** Same reasoning and shape as verifyTreasuryOpeningHandler above, for InventoryOpening. */
export async function verifyInventoryOpeningHandler(req: Request<{ lineId: string }>, res: Response) {
  const auth = req.auth!;
  const input = verifyOpeningLineSchema.parse(req.body);
  try {
    const branchId = await getInventoryOpeningBranchId(req.params.lineId);
    if (!canAccessBranch(auth, branchId)) {
      forbidBranch(res);
      return;
    }
    const row = await setInventoryOpeningVerification(req.params.lineId, input.verificationStatus === 'VERIFIED', auth.roleNames);
    await recordAudit({ entityType: 'InventoryOpening', entityId: row.id, action: 'STATUS_CHANGE', performedById: auth.staffId, branchId, newValue: { verificationStatus: row.verificationStatus } });
    res.json({ success: true, data: row });
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }
}
