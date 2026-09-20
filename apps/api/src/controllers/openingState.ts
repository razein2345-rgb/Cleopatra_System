import type { Request, Response } from 'express';
import {
  applyOpeningCreditSchema,
  correctCustomerOpeningCreditSchema,
  createCustomerOpeningSchema,
  createSupplierOpeningSchema,
  reopenOpeningSchema,
  updateCustomerOpeningSchema,
  updateSupplierOpeningSchema,
  verifyOpeningLineSchema,
} from '@cleopatra/shared';
import { recordAudit } from '../services/auditService.js';
import { runIdempotent, idempotencyKeyFromHeader, sendIdempotencyError } from '../services/idempotencyService.js';
import { canAccessBranch, forbidBranch } from '../services/authContext.js';
import { loadOrderBranchOr404 } from './orders.js';
import {
  approveCustomerOpening,
  approveSupplierOpening,
  correctCustomerOpeningCredit,
  createCustomerOpening,
  createSupplierOpening,
  CreditBelowConsumedError,
  CreditCorrectionNotAllowedError,
  CustomerOpeningNotFoundError,
  getCustomerOpening,
  getCustomerOpeningPosition,
  InvalidOpeningTransitionError,
  OpeningNotEditableError,
  reopenCustomerOpening,
  reopenSupplierOpening,
  setCustomerOpeningVerification,
  setSupplierOpeningVerification,
  SupplierOpeningNotFoundError,
  updateCustomerOpening,
  updateSupplierOpening,
} from '../services/openingStateService.js';
import {
  applyOpeningCreditPayment,
  NoApprovedCustomerOpeningError,
  OpeningCreditExceededError,
  OrderHasNoPartnerError,
  OrderNotFoundError,
} from '../services/orderService.js';
import { CutoverApprovalNotAllowedError, VerificationNotAllowedError } from '../services/cutoverService.js';

function handleServiceError(err: unknown, res: Response): boolean {
  if (err instanceof CustomerOpeningNotFoundError || err instanceof SupplierOpeningNotFoundError || err instanceof OrderNotFoundError) {
    res.status(404).json({ success: false, error: { message: err.message } });
    return true;
  }
  if (err instanceof CreditBelowConsumedError) {
    res.status(409).json({ success: false, error: { message: err.message, code: 'CREDIT_BELOW_CONSUMED' } });
    return true;
  }
  if (err instanceof OpeningNotEditableError || err instanceof InvalidOpeningTransitionError) {
    res.status(409).json({ success: false, error: { message: err.message, code: err.name } });
    return true;
  }
  if (err instanceof CutoverApprovalNotAllowedError) {
    res.status(403).json({ success: false, error: { message: err.message, code: err.name } });
    return true;
  }
  // Cutover-revision-round decision (post-3D) — new error, gets an Arabic
  // message here per the owner's explicit rule for this revision round;
  // the English-message errors elsewhere in this function are pre-existing
  // and intentionally left untouched (tracked separately, KNOWN_ISSUES.md).
  if (err instanceof VerificationNotAllowedError) {
    res.status(403).json({ success: false, error: { message: 'التحقق من بند الافتتاح يتطلب صلاحية مدير (ADMIN) أو مسؤول عام (SUPER_ADMIN).', code: err.name } });
    return true;
  }
  if (err instanceof CreditCorrectionNotAllowedError) {
    res.status(403).json({ success: false, error: { message: 'تصحيح الرصيد الافتتاحي متاح فقط لمسؤول عام (SUPER_ADMIN).', code: err.name } });
    return true;
  }
  if (err instanceof OrderHasNoPartnerError || err instanceof NoApprovedCustomerOpeningError) {
    res.status(400).json({ success: false, error: { message: err.message, code: err.name } });
    return true;
  }
  if (err instanceof OpeningCreditExceededError) {
    res.status(409).json({ success: false, error: { message: err.message, code: 'OPENING_CREDIT_EXCEEDED', remaining: err.remaining } });
    return true;
  }
  return false;
}

export async function createCustomerOpeningHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createCustomerOpeningSchema.parse(req.body);
  const row = await createCustomerOpening(input, auth.staffId);
  await recordAudit({ entityType: 'CustomerOpening', entityId: row.id, action: 'CREATE', performedById: auth.staffId, partnerId: row.partnerId, newValue: row });
  res.status(201).json({ success: true, data: row });
}

export async function updateCustomerOpeningHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = updateCustomerOpeningSchema.parse(req.body);
  try {
    const row = await updateCustomerOpening(req.params.id, input);
    await recordAudit({ entityType: 'CustomerOpening', entityId: row.id, action: 'UPDATE', performedById: auth.staffId, partnerId: row.partnerId, newValue: row });
    res.json({ success: true, data: row });
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }
}

export async function verifyCustomerOpeningHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = verifyOpeningLineSchema.parse(req.body);
  try {
    const row = await setCustomerOpeningVerification(req.params.id, input.verificationStatus === 'VERIFIED', auth.roleNames);
    await recordAudit({ entityType: 'CustomerOpening', entityId: row.id, action: 'STATUS_CHANGE', performedById: auth.staffId, partnerId: row.partnerId, newValue: { verificationStatus: row.verificationStatus } });
    res.json({ success: true, data: row });
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }
}

export async function approveCustomerOpeningHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  try {
    const row = await approveCustomerOpening(req.params.id, auth.staffId, auth.roleNames);
    await recordAudit({ entityType: 'CustomerOpening', entityId: row.id, action: 'APPROVE', performedById: auth.staffId, partnerId: row.partnerId, newValue: { status: row.status } });
    res.json({ success: true, data: row });
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }
}

/**
 * Cutover-revision-round decision (post-3D, Decision A) — the dedicated
 * correction path for a wrongly-recorded creditAmount. SUPER_ADMIN-only
 * (enforced inside `correctCustomerOpeningCredit` itself, not here — same
 * "service layer owns the invariant" convention as every other action in
 * this controller); works regardless of the record's current status.
 */
export async function correctCustomerOpeningCreditHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = correctCustomerOpeningCreditSchema.parse(req.body);
  try {
    const row = await correctCustomerOpeningCredit(req.params.id, input.creditAmount, input.reason, auth.staffId, auth.roleNames);
    await recordAudit({
      entityType: 'CustomerOpening',
      entityId: row.id,
      action: 'UPDATE',
      performedById: auth.staffId,
      partnerId: row.partnerId,
      newValue: { creditAmount: row.creditAmount, creditCorrectionReason: input.reason },
    });
    res.json({ success: true, data: row });
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }
}

export async function reopenCustomerOpeningHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = reopenOpeningSchema.parse(req.body);
  try {
    const row = await reopenCustomerOpening(req.params.id, auth.staffId, auth.roleNames, input.reason);
    await recordAudit({ entityType: 'CustomerOpening', entityId: row.id, action: 'STATUS_CHANGE', performedById: auth.staffId, partnerId: row.partnerId, newValue: { status: row.status, reopenReason: input.reason } });
    res.json({ success: true, data: row });
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }
}

export async function getCustomerOpeningHandler(req: Request<{ partnerId: string }>, res: Response) {
  const [opening, position] = await Promise.all([
    getCustomerOpening(req.params.partnerId),
    getCustomerOpeningPosition(req.params.partnerId),
  ]);
  res.json({ success: true, data: { opening, position } });
}

export async function createSupplierOpeningHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createSupplierOpeningSchema.parse(req.body);
  const row = await createSupplierOpening(input, auth.staffId);
  await recordAudit({ entityType: 'SupplierOpening', entityId: row.id, action: 'CREATE', performedById: auth.staffId, partnerId: row.partnerId, newValue: row });
  res.status(201).json({ success: true, data: row });
}

export async function updateSupplierOpeningHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = updateSupplierOpeningSchema.parse(req.body);
  try {
    const row = await updateSupplierOpening(req.params.id, input);
    await recordAudit({ entityType: 'SupplierOpening', entityId: row.id, action: 'UPDATE', performedById: auth.staffId, partnerId: row.partnerId, newValue: row });
    res.json({ success: true, data: row });
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }
}

export async function verifySupplierOpeningHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = verifyOpeningLineSchema.parse(req.body);
  try {
    const row = await setSupplierOpeningVerification(req.params.id, input.verificationStatus === 'VERIFIED', auth.roleNames);
    await recordAudit({ entityType: 'SupplierOpening', entityId: row.id, action: 'STATUS_CHANGE', performedById: auth.staffId, partnerId: row.partnerId, newValue: { verificationStatus: row.verificationStatus } });
    res.json({ success: true, data: row });
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }
}

export async function approveSupplierOpeningHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  try {
    const row = await approveSupplierOpening(req.params.id, auth.staffId, auth.roleNames);
    await recordAudit({ entityType: 'SupplierOpening', entityId: row.id, action: 'APPROVE', performedById: auth.staffId, partnerId: row.partnerId, newValue: { status: row.status } });
    res.json({ success: true, data: row });
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }
}

export async function reopenSupplierOpeningHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = reopenOpeningSchema.parse(req.body);
  try {
    const row = await reopenSupplierOpening(req.params.id, auth.staffId, auth.roleNames, input.reason);
    await recordAudit({ entityType: 'SupplierOpening', entityId: row.id, action: 'STATUS_CHANGE', performedById: auth.staffId, partnerId: row.partnerId, newValue: { status: row.status, reopenReason: input.reason } });
    res.json({ success: true, data: row });
  } catch (err) {
    if (handleServiceError(err, res)) return;
    throw err;
  }
}

/**
 * Opening Credit Application (Phase 3C.2 §18/§34) — the one other
 * financially consequential Opening State mutation besides Cutover
 * activation, so it gets the same `runIdempotent` protection. The
 * advisory lock (acquireAdvisoryLock, inside applyOpeningCreditPayment's
 * own transaction) is what actually protects the concurrency invariant;
 * idempotency here only protects against a lost-response retry replaying
 * the same logical attempt.
 *
 * Branch guard (post-3C.2 verification fix) — mirrors
 * `recordPaymentHandler`'s exact pattern in orders.ts (`loadOrderBranchOr404`
 * then `canAccessBranch`/`forbidBranch`) verbatim, reusing that shared
 * helper rather than duplicating the 404/branch lookup. This endpoint sits
 * next to the normal payment endpoint on the same Order resource and must
 * enforce the same branch-isolation invariant — a non-Super-Admin caller
 * scoped to another branch was previously able to apply Opening Credit to
 * an Order outside their branch, which no other Order mutation allows.
 */
export async function applyOpeningCreditHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const orderBranchId = await loadOrderBranchOr404(req.params.id, res);
  if (!orderBranchId) return;
  if (!canAccessBranch(auth, orderBranchId)) {
    forbidBranch(res);
    return;
  }

  const input = applyOpeningCreditSchema.parse(req.body);
  const idempotencyKey = idempotencyKeyFromHeader(req.header('Idempotency-Key'));

  try {
    const outcome = await runIdempotent(
      idempotencyKey,
      auth.staffId,
      'POST /api/orders/:id/opening-credit',
      { orderId: req.params.id, ...input },
      async () => {
        const result = await applyOpeningCreditPayment(req.params.id, input.amount, input.method);
        await recordAudit({
          entityType: 'Payment',
          entityId: result.paymentId,
          action: 'CREATE',
          performedById: auth.staffId,
          newValue: { orderId: req.params.id, amount: input.amount, method: input.method, sourceType: 'OPENING_CREDIT_APPLICATION' },
        });
        return { statusCode: 201, body: { success: true, data: result } };
      },
    );
    res.status(outcome.statusCode).json(outcome.body);
  } catch (err) {
    if (sendIdempotencyError(err, res)) return;
    if (handleServiceError(err, res)) return;
    throw err;
  }
}
