import type { Prisma } from '../generated/prisma/client.js';
import type {
  CreateCustomerOpeningInput,
  CreateSupplierOpeningInput,
  CustomerOpening,
  CustomerOpeningPosition,
  SupplierOpening,
  UpdateCustomerOpeningInput,
  UpdateSupplierOpeningInput,
} from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { ORDER_INCLUDE, mapOrderToDto } from './orderService.js';
import { assertCanApprove, CutoverApprovalNotAllowedError, VerificationNotAllowedError } from './cutoverService.js';
import { isAdminOrAbove } from './authContext.js';

/**
 * Opening State / Cutover (Phase 3C.2) — CustomerOpening/SupplierOpening
 * are company-wide, standalone (NOT children of any branch's
 * CutoverRecord — Phase 3C.1 §5's locked resolution to the branch-scope
 * question). Each carries its own independent mini-lifecycle reusing
 * `CutoverStatus`'s shape; `enteredById` is the maker for approval
 * purposes (Phase 3C.1 §5 — no schema rename, service-layer convention
 * only).
 */

export class CustomerOpeningNotFoundError extends Error {
  constructor() {
    super('Customer opening not found');
    this.name = 'CustomerOpeningNotFoundError';
  }
}
export class SupplierOpeningNotFoundError extends Error {
  constructor() {
    super('Supplier opening not found');
    this.name = 'SupplierOpeningNotFoundError';
  }
}
export class OpeningNotEditableError extends Error {
  constructor() {
    super('This opening is no longer in DRAFT — reopen it before editing');
    this.name = 'OpeningNotEditableError';
  }
}
export class InvalidOpeningTransitionError extends Error {
  constructor(from: string) {
    super(`Cannot approve an opening currently in ${from}`);
    this.name = 'InvalidOpeningTransitionError';
  }
}
/**
 * Phase 3C.1 §7 — hard arithmetic invariant on the NORMAL edit path
 * (`updateCustomerOpening`), no override there, not even for SUPER_ADMIN.
 * Cutover-revision-round decision (post-3D): a wrongly-recorded
 * creditAmount is still fixable, but only via the separate, more heavily
 * gated `correctCustomerOpeningCredit` below — never by relaxing this
 * check on the normal path.
 */
export class CreditBelowConsumedError extends Error {
  constructor(consumed: number) {
    super(`creditAmount cannot be set below the ${consumed.toFixed(2)} already consumed`);
    this.name = 'CreditBelowConsumedError';
  }
}
export class CreditCorrectionNotAllowedError extends Error {
  constructor() {
    super('Only a SUPER_ADMIN may correct an approved opening credit amount');
    this.name = 'CreditCorrectionNotAllowedError';
  }
}

function toCustomerOpeningDto(r: Prisma.CustomerOpeningGetPayload<object>): CustomerOpening {
  return {
    id: r.id,
    partnerId: r.partnerId,
    receivableAmount: r.receivableAmount.toNumber(),
    creditAmount: r.creditAmount.toNumber(),
    status: r.status,
    approvedById: r.approvedById,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    reopenedById: r.reopenedById,
    reopenedAt: r.reopenedAt?.toISOString() ?? null,
    reopenReason: r.reopenReason,
    verificationStatus: r.verificationStatus,
    notes: r.notes,
    enteredById: r.enteredById,
    creditCorrectedById: r.creditCorrectedById,
    creditCorrectedAt: r.creditCorrectedAt?.toISOString() ?? null,
    creditCorrectionReason: r.creditCorrectionReason,
    selfApprovedException: r.selfApprovedException,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function toSupplierOpeningDto(r: Prisma.SupplierOpeningGetPayload<object>): SupplierOpening {
  return {
    id: r.id,
    partnerId: r.partnerId,
    payableAmount: r.payableAmount.toNumber(),
    creditAmount: r.creditAmount.toNumber(),
    status: r.status,
    approvedById: r.approvedById,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    reopenedById: r.reopenedById,
    reopenedAt: r.reopenedAt?.toISOString() ?? null,
    reopenReason: r.reopenReason,
    verificationStatus: r.verificationStatus,
    notes: r.notes,
    enteredById: r.enteredById,
    selfApprovedException: r.selfApprovedException,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** SUM of already-applied opening-credit payments for a partner — isDeleted:false, matching every other Payment aggregation in this codebase. */
export async function getConsumedOpeningCredit(
  partnerId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<number> {
  const result = await client.payment.aggregate({
    where: { sourceType: 'OPENING_CREDIT_APPLICATION', isDeleted: false, order: { partnerId } },
    _sum: { amount: true },
  });
  return result._sum.amount?.toNumber() ?? 0;
}

export async function createCustomerOpening(input: CreateCustomerOpeningInput, staffId: string): Promise<CustomerOpening> {
  const row = await prisma.customerOpening.create({
    data: {
      partnerId: input.partnerId,
      receivableAmount: input.receivableAmount,
      creditAmount: input.creditAmount,
      notes: input.notes ?? null,
      enteredById: staffId,
    },
  });
  return toCustomerOpeningDto(row);
}

export async function updateCustomerOpening(id: string, input: UpdateCustomerOpeningInput): Promise<CustomerOpening> {
  const existing = await prisma.customerOpening.findUnique({ where: { id } });
  if (!existing) throw new CustomerOpeningNotFoundError();
  if (existing.status !== 'DRAFT') throw new OpeningNotEditableError();

  if (input.creditAmount !== undefined) {
    const consumed = await getConsumedOpeningCredit(existing.partnerId);
    if (input.creditAmount < consumed) throw new CreditBelowConsumedError(consumed);
  }

  const row = await prisma.customerOpening.update({
    where: { id },
    data: {
      receivableAmount: input.receivableAmount,
      creditAmount: input.creditAmount,
      notes: input.notes,
      verificationStatus: 'UNVERIFIED',
    },
  });
  return toCustomerOpeningDto(row);
}

/**
 * Cutover-revision-round decision (post-3D) — the dedicated correction
 * path for a wrongly-recorded creditAmount. Deliberately separate from
 * `updateCustomerOpening` above, not a parameter on it: that function's
 * `CreditBelowConsumedError` guard stays absolute with zero override,
 * exactly as Phase 3C.1 §7 locked it — this is a distinct operation with
 * its own, much narrower gate (SUPER_ADMIN only, mandatory reason), and
 * it works regardless of the record's current status (APPROVED included
 * — the whole point is fixing a mistake found after approval, not just
 * in DRAFT). `getConsumedOpeningCredit` is NOT re-checked here — a
 * correction is a deliberate acknowledgment that the ORIGINAL figure was
 * wrong, not a normal edit re-validating against consumption.
 */
export async function correctCustomerOpeningCredit(
  id: string,
  newCreditAmount: number,
  reason: string,
  staffId: string,
  roleNames: string[],
): Promise<CustomerOpening> {
  if (!roleNames.includes('SUPER_ADMIN')) throw new CreditCorrectionNotAllowedError();
  const existing = await prisma.customerOpening.findUnique({ where: { id } });
  if (!existing) throw new CustomerOpeningNotFoundError();

  const row = await prisma.customerOpening.update({
    where: { id },
    data: {
      creditAmount: newCreditAmount,
      creditCorrectedById: staffId,
      creditCorrectedAt: new Date(),
      creditCorrectionReason: reason,
    },
  });
  return toCustomerOpeningDto(row);
}

export async function approveCustomerOpening(id: string, staffId: string, roleNames: string[]): Promise<CustomerOpening> {
  const existing = await prisma.customerOpening.findUnique({ where: { id } });
  if (!existing) throw new CustomerOpeningNotFoundError();
  if (existing.status !== 'DRAFT') throw new InvalidOpeningTransitionError(existing.status);
  const selfApprovedException = assertCanApprove(existing.enteredById, staffId, roleNames);
  if (existing.verificationStatus !== 'VERIFIED') throw new InvalidOpeningTransitionError(existing.status);

  const row = await prisma.customerOpening.update({
    where: { id },
    data: { status: 'APPROVED', approvedById: staffId, approvedAt: new Date(), selfApprovedException },
  });
  return toCustomerOpeningDto(row);
}

export async function reopenCustomerOpening(id: string, staffId: string, roleNames: string[], reason: string): Promise<CustomerOpening> {
  if (!roleNames.includes('ADMIN') && !roleNames.includes('SUPER_ADMIN')) throw new CutoverApprovalNotAllowedError();
  const existing = await prisma.customerOpening.findUnique({ where: { id } });
  if (!existing) throw new CustomerOpeningNotFoundError();
  if (existing.status !== 'APPROVED') throw new InvalidOpeningTransitionError(existing.status);

  const row = await prisma.customerOpening.update({
    where: { id },
    data: { status: 'DRAFT', reopenedById: staffId, reopenedAt: new Date(), reopenReason: reason },
  });
  return toCustomerOpeningDto(row);
}

export async function setCustomerOpeningVerification(id: string, verified: boolean, roleNames: string[]): Promise<CustomerOpening> {
  if (!isAdminOrAbove(roleNames)) throw new VerificationNotAllowedError();
  const existing = await prisma.customerOpening.findUnique({ where: { id } });
  if (!existing) throw new CustomerOpeningNotFoundError();
  const row = await prisma.customerOpening.update({
    where: { id },
    data: { verificationStatus: verified ? 'VERIFIED' : 'UNVERIFIED' },
  });
  return toCustomerOpeningDto(row);
}

export async function getCustomerOpening(partnerId: string): Promise<CustomerOpening | null> {
  const row = await prisma.customerOpening.findUnique({ where: { partnerId } });
  return row ? toCustomerOpeningDto(row) : null;
}

/**
 * The read-time addition described throughout Phase 3A.1/3C — never
 * persisted, never written back into Order/Payment. Reuses
 * `orderService.ts`'s own `ORDER_INCLUDE`/`mapOrderToDto` rather than
 * re-deriving the balance formula a fourth time.
 */
export async function getCustomerOpeningPosition(partnerId: string): Promise<CustomerOpeningPosition> {
  const [orders, opening, consumedOpeningCredit] = await Promise.all([
    prisma.order.findMany({ where: { partnerId, isDeleted: false }, include: ORDER_INCLUDE }),
    prisma.customerOpening.findUnique({ where: { partnerId } }),
    getConsumedOpeningCredit(partnerId),
  ]);

  const liveRemainingBalance = orders.reduce((sum, o) => sum + mapOrderToDto(o, true).remainingBalance, 0);
  const isApproved = opening?.status === 'APPROVED';
  const openingReceivable = isApproved ? opening!.receivableAmount.toNumber() : 0;
  const openingCreditTotal = isApproved ? opening!.creditAmount.toNumber() : 0;
  const remainingOpeningCredit = Math.max(0, openingCreditTotal - consumedOpeningCredit);

  return {
    liveRemainingBalance,
    openingReceivable,
    openingCreditTotal,
    consumedOpeningCredit,
    remainingOpeningCredit,
    position: liveRemainingBalance + openingReceivable - remainingOpeningCredit,
  };
}

export async function createSupplierOpening(input: CreateSupplierOpeningInput, staffId: string): Promise<SupplierOpening> {
  const row = await prisma.supplierOpening.create({
    data: {
      partnerId: input.partnerId,
      payableAmount: input.payableAmount,
      creditAmount: input.creditAmount,
      notes: input.notes ?? null,
      enteredById: staffId,
    },
  });
  return toSupplierOpeningDto(row);
}

export async function updateSupplierOpening(id: string, input: UpdateSupplierOpeningInput): Promise<SupplierOpening> {
  const existing = await prisma.supplierOpening.findUnique({ where: { id } });
  if (!existing) throw new SupplierOpeningNotFoundError();
  if (existing.status !== 'DRAFT') throw new OpeningNotEditableError();

  const row = await prisma.supplierOpening.update({
    where: { id },
    data: {
      payableAmount: input.payableAmount,
      creditAmount: input.creditAmount,
      notes: input.notes,
      verificationStatus: 'UNVERIFIED',
    },
  });
  return toSupplierOpeningDto(row);
}

export async function approveSupplierOpening(id: string, staffId: string, roleNames: string[]): Promise<SupplierOpening> {
  const existing = await prisma.supplierOpening.findUnique({ where: { id } });
  if (!existing) throw new SupplierOpeningNotFoundError();
  if (existing.status !== 'DRAFT') throw new InvalidOpeningTransitionError(existing.status);
  const selfApprovedException = assertCanApprove(existing.enteredById, staffId, roleNames);
  if (existing.verificationStatus !== 'VERIFIED') throw new InvalidOpeningTransitionError(existing.status);

  const row = await prisma.supplierOpening.update({
    where: { id },
    data: { status: 'APPROVED', approvedById: staffId, approvedAt: new Date(), selfApprovedException },
  });
  return toSupplierOpeningDto(row);
}

export async function reopenSupplierOpening(id: string, staffId: string, roleNames: string[], reason: string): Promise<SupplierOpening> {
  if (!roleNames.includes('ADMIN') && !roleNames.includes('SUPER_ADMIN')) throw new CutoverApprovalNotAllowedError();
  const existing = await prisma.supplierOpening.findUnique({ where: { id } });
  if (!existing) throw new SupplierOpeningNotFoundError();
  if (existing.status !== 'APPROVED') throw new InvalidOpeningTransitionError(existing.status);

  const row = await prisma.supplierOpening.update({
    where: { id },
    data: { status: 'DRAFT', reopenedById: staffId, reopenedAt: new Date(), reopenReason: reason },
  });
  return toSupplierOpeningDto(row);
}

export async function setSupplierOpeningVerification(id: string, verified: boolean, roleNames: string[]): Promise<SupplierOpening> {
  if (!isAdminOrAbove(roleNames)) throw new VerificationNotAllowedError();
  const existing = await prisma.supplierOpening.findUnique({ where: { id } });
  if (!existing) throw new SupplierOpeningNotFoundError();
  const row = await prisma.supplierOpening.update({
    where: { id },
    data: { verificationStatus: verified ? 'VERIFIED' : 'UNVERIFIED' },
  });
  return toSupplierOpeningDto(row);
}

/** APPROVED SupplierOpening's net figure (payable − credit) — the one term supplierLedgerService.ts::buildStatement folds in, per Phase 3A.1 §13. Purely informational credit (no auto-consumption mechanism) — Phase 3C audit left this undecided pending a confirmed business case. */
export async function getSupplierOpeningNet(partnerId: string): Promise<number> {
  const row = await prisma.supplierOpening.findUnique({ where: { partnerId } });
  if (!row || row.status !== 'APPROVED') return 0;
  return row.payableAmount.toNumber() - row.creditAmount.toNumber();
}
