import type { Request, Response } from 'express';
import {
  createSupplierPaymentSchema,
  createSupplierPurchaseSchema,
  updateSupplierPaymentSchema,
  updateSupplierPurchaseSchema,
} from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
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

export async function listSuppliersHandler(_req: Request, res: Response) {
  res.json({ success: true, data: await listSuppliers() });
}

export async function getSupplierDebtOverviewHandler(_req: Request, res: Response) {
  res.json({ success: true, data: await getSupplierDebtOverview() });
}

export async function getSupplierStatementHandler(req: Request<{ id: string }>, res: Response) {
  const { from, to } = req.query as { from?: string; to?: string };
  const statement = await getSupplierStatement(
    req.params.id,
    from ? new Date(from) : undefined,
    to ? new Date(to) : undefined,
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

export async function createPurchaseHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  if (!(await assertSupplier(req.params.id))) {
    res.status(404).json({ success: false, error: { message: 'Supplier not found' } });
    return;
  }
  const input = createSupplierPurchaseSchema.parse(req.body);
  const purchase = await createPurchase(req.params.id, input, auth.staffId);

  await recordAudit({
    entityType: 'SupplierPurchase',
    entityId: purchase.id,
    action: 'CREATE',
    performedById: auth.staffId,
    partnerId: req.params.id,
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
  const input = updateSupplierPurchaseSchema.parse(req.body);
  const updated = await updatePurchase(req.params.purchaseId, input);

  await recordAudit({
    entityType: 'SupplierPurchase',
    entityId: updated.id,
    action: 'UPDATE',
    performedById: auth.staffId,
    partnerId: existing.partnerId,
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
  await softDeletePurchase(req.params.purchaseId, auth.staffId);

  await recordAudit({
    entityType: 'SupplierPurchase',
    entityId: req.params.purchaseId,
    action: 'DELETE',
    performedById: auth.staffId,
    partnerId: existing.partnerId,
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
  const payment = await createPayment(req.params.id, input, auth.staffId);

  await recordAudit({
    entityType: 'SupplierPayment',
    entityId: payment.id,
    action: 'CREATE',
    performedById: auth.staffId,
    partnerId: req.params.id,
    newValue: input,
  });

  res.status(201).json({ success: true, data: payment });
}

export async function updatePaymentHandler(req: Request<{ paymentId: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await prisma.supplierPayment.findUnique({ where: { id: req.params.paymentId } });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'Payment not found' } });
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
    previousValue: { amount: existing.amount.toNumber(), note: existing.note, date: existing.date },
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
  await softDeletePayment(req.params.paymentId, auth.staffId);

  await recordAudit({
    entityType: 'SupplierPayment',
    entityId: req.params.paymentId,
    action: 'DELETE',
    performedById: auth.staffId,
    partnerId: existing.partnerId,
  });

  res.json({ success: true, data: { id: req.params.paymentId } });
}
