import type { Request, Response } from 'express';
import {
  createSupplierPaymentSchema,
  createSupplierPurchaseSchema,
  updateSupplierPaymentSchema,
  updateSupplierPurchaseSchema,
} from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { canAccessBranch, forbidBranch } from '../services/authContext.js';
import {
  createPayment,
  createPurchase,
  getSupplierDebtOverview,
  getSupplierStatement,
  listSuppliers,
  softDeletePayment,
  softDeletePurchase,
  updatePayment,
  updatePurchase,
} from '../services/supplierLedgerService.js';
import { recordAudit } from '../services/auditService.js';
import { resolveBranchScope } from './treasuryEntries.js';
import { DayClosedError } from '../services/treasuryService.js';
import { idempotencyKeyFromHeader, runIdempotent, sendIdempotencyError } from '../services/idempotencyService.js';

export async function listSuppliersHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const requestedBranchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
  res.json({ success: true, data: await listSuppliers(resolveBranchScope(auth, true, requestedBranchId)) });
}

export async function getSupplierDebtOverviewHandler(req: Request, res: Response) {
  const auth = req.auth!;
  const requestedBranchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
  res.json({ success: true, data: await getSupplierDebtOverview(resolveBranchScope(auth, true, requestedBranchId)) });
}

export async function getSupplierStatementHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const { from, to } = req.query as { from?: string; to?: string; branchId?: string };
  const requestedBranchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
  const statement = await getSupplierStatement(
    req.params.id,
    from ? new Date(from) : undefined,
    to ? new Date(to) : undefined,
    resolveBranchScope(auth, true, requestedBranchId),
  );
  if (!statement) {
    res.status(404).json({ success: false, error: { message: 'Supplier not found' } });
    return;
  }
  res.json({ success: true, data: statement });
}

async function assertSupplier(partnerId: string): Promise<boolean> {
  const partner = await prisma.businessPartner.findUnique({
    where: { id: partnerId },
    select: { isDeleted: true, roles: true },
  });
  return Boolean(partner && !partner.isDeleted && partner.roles.includes('SUPPLIER'));
}

/**
 * Accounting audit fix (2026-09-17, Decision 2/Fix D) — `SupplierPurchase`/
 * `SupplierPayment` rows now carry a `branchId`, but a small number of
 * pre-existing legacy rows have `null` there (an unmappable historical
 * leftover — see the Prisma schema's own doc comment; never guessed). This
 * mirrors `canAccessBranch` for the normal case, and — since nobody's
 * branch-scoped access should implicitly extend to a record with no known
 * branch — falls back to SUPER_ADMIN-only for that legacy edge case.
 */
function canAccessBranchOrLegacyNull(auth: Parameters<typeof canAccessBranch>[0], branchId: string | null): boolean {
  if (branchId === null) return auth.roleNames.includes('SUPER_ADMIN');
  return canAccessBranch(auth, branchId);
}

export async function createPurchaseHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  if (!(await assertSupplier(req.params.id))) {
    res.status(404).json({ success: false, error: { message: 'Supplier not found' } });
    return;
  }
  const input = createSupplierPurchaseSchema.parse(req.body);
  if (!canAccessBranch(auth, input.branchId)) {
    forbidBranch(res);
    return;
  }
  const purchase = await createPurchase(req.params.id, input, auth.staffId);

  await recordAudit({
    entityType: 'SupplierPurchase',
    entityId: purchase.id,
    action: 'CREATE',
    performedById: auth.staffId,
    partnerId: req.params.id,
    branchId: input.branchId,
    newValue: input,
  });

  res.status(201).json({ success: true, data: purchase });
}

export async function updatePurchaseHandler(req: Request<{ purchaseId: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await prisma.supplierPurchase.findUnique({ where: { id: req.params.purchaseId } });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Purchase not found' } });
    return;
  }
  if (!canAccessBranchOrLegacyNull(auth, existing.branchId)) {
    forbidBranch(res);
    return;
  }
  const input = updateSupplierPurchaseSchema.parse(req.body);
  const updated = await updatePurchase(req.params.purchaseId, input);

  await recordAudit({
    entityType: 'SupplierPurchase',
    entityId: updated.id,
    action: 'UPDATE',
    performedById: auth.staffId,
    partnerId: existing.partnerId,
    branchId: existing.branchId,
    previousValue: { amount: existing.amount.toNumber(), description: existing.description, date: existing.date },
    newValue: input,
  });

  res.json({ success: true, data: updated });
}

export async function deletePurchaseHandler(req: Request<{ purchaseId: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await prisma.supplierPurchase.findUnique({ where: { id: req.params.purchaseId } });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Purchase not found' } });
    return;
  }
  if (!canAccessBranchOrLegacyNull(auth, existing.branchId)) {
    forbidBranch(res);
    return;
  }
  await softDeletePurchase(req.params.purchaseId, auth.staffId);

  await recordAudit({
    entityType: 'SupplierPurchase',
    entityId: req.params.purchaseId,
    action: 'DELETE',
    performedById: auth.staffId,
    partnerId: existing.partnerId,
    branchId: existing.branchId,
  });

  res.json({ success: true, data: { id: req.params.purchaseId } });
}

export async function createPaymentHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  if (!(await assertSupplier(req.params.id))) {
    res.status(404).json({ success: false, error: { message: 'Supplier not found' } });
    return;
  }
  const input = createSupplierPaymentSchema.parse(req.body);
  if (!canAccessBranch(auth, input.branchId)) {
    forbidBranch(res);
    return;
  }

  // Accounting audit fix (2026-09-17, Phase 3 E) — a repeated submission
  // of the same supplier payment must not create a second SupplierPayment
  // + a second Treasury OUT for it. Optional header, backward compatible.
  const idempotencyKey = idempotencyKeyFromHeader(req.headers['idempotency-key']);

  let outcome;
  try {
    outcome = await runIdempotent(
      idempotencyKey,
      auth.staffId,
      'POST /api/suppliers/:id/payments',
      { partnerId: req.params.id, ...input },
      async () => {
        const payment = await createPayment(req.params.id, input, auth.staffId);

        await recordAudit({
          entityType: 'SupplierPayment',
          entityId: payment.id,
          action: 'CREATE',
          performedById: auth.staffId,
          partnerId: req.params.id,
          branchId: input.branchId,
          newValue: input,
        });

        return { statusCode: 201, body: { success: true, data: payment } };
      },
    );
  } catch (err) {
    if (sendIdempotencyError(err, res)) return;
    if (err instanceof DayClosedError) {
      res.status(409).json({ success: false, error: { message: err.message, code: 'DAY_CLOSED' } });
      return;
    }
    throw err;
  }

  res.status(outcome.statusCode).json(outcome.body);
}

export async function updatePaymentHandler(req: Request<{ paymentId: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await prisma.supplierPayment.findUnique({ where: { id: req.params.paymentId } });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Payment not found' } });
    return;
  }
  if (!canAccessBranchOrLegacyNull(auth, existing.branchId)) {
    forbidBranch(res);
    return;
  }
  const input = updateSupplierPaymentSchema.parse(req.body);
  const updated = await updatePayment(req.params.paymentId, input);

  await recordAudit({
    entityType: 'SupplierPayment',
    entityId: updated.id,
    action: 'UPDATE',
    performedById: auth.staffId,
    partnerId: existing.partnerId,
    branchId: existing.branchId,
    previousValue: { amount: existing.amount.toNumber(), note: existing.note, date: existing.date, method: existing.method },
    newValue: input,
  });

  res.json({ success: true, data: updated });
}

export async function deletePaymentHandler(req: Request<{ paymentId: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await prisma.supplierPayment.findUnique({ where: { id: req.params.paymentId } });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Payment not found' } });
    return;
  }
  if (!canAccessBranchOrLegacyNull(auth, existing.branchId)) {
    forbidBranch(res);
    return;
  }
  await softDeletePayment(req.params.paymentId, auth.staffId);

  await recordAudit({
    entityType: 'SupplierPayment',
    entityId: req.params.paymentId,
    action: 'DELETE',
    performedById: auth.staffId,
    partnerId: existing.partnerId,
    branchId: existing.branchId,
  });

  res.json({ success: true, data: { id: req.params.paymentId } });
}
