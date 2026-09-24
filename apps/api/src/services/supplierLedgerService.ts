import type {
  SupplierDebtOverview,
  SupplierPayment,
  SupplierPurchase,
  SupplierStatement,
  SupplierSummary,
} from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';
import { assertBranchDayNotClosed, reopenDayIfClosed } from './treasuryService.js';

/**
 * الموردين ledger — جزء 3 من مبادرة "فصل الخزينة/الربح بالفرع + الموردين +
 * التقارير" (docs/AI/PROJECT_STATUS.md § 6). Owner: "كل مورد معروف بتعامل
 * معاه كل قد ايه بوردله فلوس وهو ليه كام عندي بالظبط... أقدر اسجل دفعات
 * واطبع كشف حساب". Balance = sum(purchases) - sum(payments): a purchase is
 * what the supplier charges us (increases what we owe), a payment is what
 * we pay them (reduces it) — deliberately the mirror image of a customer's
 * balance, not the same sign convention.
 */

type PurchaseRecord = Prisma.SupplierPurchaseGetPayload<object>;
type PaymentRecord = Prisma.SupplierPaymentGetPayload<object>;

export function mapPurchaseToDto(row: PurchaseRecord): SupplierPurchase {
  return {
    id: row.id,
    partnerId: row.partnerId,
    amount: row.amount.toNumber(),
    description: row.description,
    date: row.date.toISOString(),
    recordedById: row.recordedById,
    branchId: row.branchId,
    itemSupplierTaskId: row.itemSupplierTaskId,
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapPaymentToDto(row: PaymentRecord): SupplierPayment {
  return {
    id: row.id,
    partnerId: row.partnerId,
    amount: row.amount.toNumber(),
    note: row.note,
    date: row.date.toISOString(),
    recordedById: row.recordedById,
    method: row.method,
    branchId: row.branchId,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listSuppliers(branchId?: string | string[]): Promise<SupplierSummary[]> {
  const partners = await prisma.businessPartner.findMany({
    where: { isDeleted: false, roles: { has: 'SUPPLIER' } },
    orderBy: { nameAr: 'asc' },
    select: {
      id: true,
      nameAr: true,
      phone: true,
      branchId: true,
      commercialProfile: { select: { paymentTermsDays: true } },
    },
  });
  if (partners.length === 0) return [];

  // Accounting audit fix (2026-09-17, Decision 2/Fix D) — the supplier
  // (BusinessPartner) itself stays shared across branches (every supplier
  // is always listed), but its totals/balance now reflect only the
  // activity a branch-scoped caller may actually see — same "shared
  // master data, scoped activity" split as Treasury's own branch scoping.
  const branchWhere = Array.isArray(branchId) ? { branchId: { in: branchId } } : branchId ? { branchId } : {};

  const partnerIds = partners.map((p) => p.id);
  const [purchaseSums, paymentSums] = await Promise.all([
    prisma.supplierPurchase.groupBy({
      by: ['partnerId'],
      where: { partnerId: { in: partnerIds }, isDeleted: false, ...branchWhere },
      _sum: { amount: true },
    }),
    prisma.supplierPayment.groupBy({
      by: ['partnerId'],
      where: { partnerId: { in: partnerIds }, isDeleted: false, ...branchWhere },
      _sum: { amount: true },
    }),
  ]);
  const purchaseByPartner = new Map(purchaseSums.map((s) => [s.partnerId, s._sum.amount?.toNumber() ?? 0]));
  const paymentByPartner = new Map(paymentSums.map((s) => [s.partnerId, s._sum.amount?.toNumber() ?? 0]));

  return partners.map((p) => {
    const totalPurchases = purchaseByPartner.get(p.id) ?? 0;
    const totalPayments = paymentByPartner.get(p.id) ?? 0;
    return {
      partnerId: p.id,
      nameAr: p.nameAr,
      phone: p.phone,
      branchId: p.branchId,
      paymentTermsDays: p.commercialProfile?.paymentTermsDays ?? null,
      totalPurchases,
      totalPayments,
      balance: totalPurchases - totalPayments,
    };
  });
}

export async function getSupplierDebtOverview(branchId?: string | string[]): Promise<SupplierDebtOverview> {
  const suppliers = await listSuppliers(branchId);
  return {
    totalOwedToSuppliers: suppliers.reduce((sum, s) => sum + s.balance, 0),
    supplierCount: suppliers.length,
  };
}

export interface RawLedgerEntry {
  kind: 'PURCHASE' | 'PAYMENT';
  id: string;
  date: Date;
  description: string | null;
  amount: number;
}

/**
 * Merges purchases+payments into one running-balance feed — exactly the
 * "كشف حساب" shape the reference screenshot showed. A purchase (+) is what
 * the supplier charges us; a payment (-) is what we pay them. `from`/`to`
 * filter which entries are *listed*, but `openingBalance` still folds in
 * everything before `from` so the running balance stays correct mid-
 * statement, not reset to zero at the period boundary. Pure/sync so it can
 * be unit-tested without a database — `getSupplierStatement` below is the
 * only caller, feeding it real rows sorted oldest-first.
 */
export function buildStatement(
  entriesSortedByDate: RawLedgerEntry[],
  from?: Date,
  to?: Date,
  openingSeed = 0,
): { openingBalance: number; entries: SupplierStatement['entries']; closingBalance: number } {
  // Opening State / Cutover (Phase 3C.2 §27) — openingSeed is the approved
  // SupplierOpening's net figure (payableAmount − creditAmount), folded in
  // as one more term alongside the pre-`from` real-row fold-in this
  // function already does — extending the existing computed-rollup
  // mechanism rather than building a parallel one (Phase 3A.1 §13's
  // locked recommendation). Defaults to 0 so every existing caller/test
  // is unaffected.
  let openingBalance = openingSeed;
  let runningBalance = openingSeed;
  const entries: SupplierStatement['entries'] = [];

  for (const entry of entriesSortedByDate) {
    const delta = entry.kind === 'PURCHASE' ? entry.amount : -entry.amount;
    if (from && entry.date < from) {
      openingBalance += delta;
      runningBalance += delta;
      continue;
    }
    if (to && entry.date > to) continue;
    runningBalance += delta;
    entries.push({
      kind: entry.kind,
      id: entry.id,
      date: entry.date.toISOString(),
      description: entry.description,
      amount: entry.amount,
      runningBalance,
    });
  }

  return { openingBalance, entries, closingBalance: runningBalance };
}

export async function getSupplierStatement(
  partnerId: string,
  from?: Date,
  to?: Date,
  branchId?: string | string[],
): Promise<SupplierStatement | null> {
  const partner = await prisma.businessPartner.findUnique({
    where: { id: partnerId },
    select: { id: true, nameAr: true, isDeleted: true },
  });
  if (!partner || partner.isDeleted) return null;

  const branchWhere = Array.isArray(branchId) ? { branchId: { in: branchId } } : branchId ? { branchId } : {};
  const [purchases, payments, supplierOpening] = await Promise.all([
    prisma.supplierPurchase.findMany({ where: { partnerId, isDeleted: false, ...branchWhere }, orderBy: { date: 'asc' } }),
    prisma.supplierPayment.findMany({ where: { partnerId, isDeleted: false, ...branchWhere }, orderBy: { date: 'asc' } }),
    prisma.supplierOpening.findUnique({ where: { partnerId } }),
  ]);

  const merged: RawLedgerEntry[] = [
    ...purchases.map((p) => ({ kind: 'PURCHASE' as const, id: p.id, date: p.date, description: p.description, amount: p.amount.toNumber() })),
    ...payments.map((p) => ({ kind: 'PAYMENT' as const, id: p.id, date: p.date, description: p.note, amount: p.amount.toNumber() })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Opening State / Cutover (Phase 3C.2 §27) — only an APPROVED
  // SupplierOpening contributes; DRAFT/REVIEW figures are not yet
  // certified and must never leak into a real statement.
  const openingSeed =
    supplierOpening && supplierOpening.status === 'APPROVED'
      ? supplierOpening.payableAmount.toNumber() - supplierOpening.creditAmount.toNumber()
      : 0;

  const { openingBalance, entries, closingBalance } = buildStatement(merged, from, to, openingSeed);

  return { partnerId: partner.id, nameAr: partner.nameAr, openingBalance, entries, closingBalance };
}

export async function createPurchase(
  partnerId: string,
  input: { amount: number; description?: string | null; date: string; branchId: string },
  recordedById: string,
): Promise<SupplierPurchase> {
  const row = await prisma.supplierPurchase.create({
    data: {
      partnerId,
      amount: input.amount,
      description: input.description ?? null,
      date: new Date(input.date),
      recordedById,
      branchId: input.branchId,
    },
  });
  return mapPurchaseToDto(row);
}

export async function updatePurchase(
  id: string,
  input: { amount?: number; description?: string | null; date?: string },
): Promise<SupplierPurchase> {
  const row = await prisma.supplierPurchase.update({
    where: { id },
    data: {
      amount: input.amount,
      description: input.description === undefined ? undefined : input.description,
      date: input.date === undefined ? undefined : new Date(input.date),
    },
  });
  return mapPurchaseToDto(row);
}

export async function softDeletePurchase(id: string, deletedBy: string): Promise<void> {
  await prisma.supplierPurchase.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy },
  });
}

/**
 * Accounting audit fix (2026-09-17, Decision 1) — a supplier payment is
 * real cash leaving the business, which the ledger never reflected in
 * Treasury before this (the audit's confirmed evidence: zero real
 * SupplierPayment usage in production, plus at least one manual Treasury
 * EXPENSE entry — "دفع حساب للصياد" — that looks exactly like a supplier
 * payment recorded the old, disconnected way). The SupplierPayment row and
 * its TreasuryEntry are created atomically in one transaction — if either
 * fails, both roll back — mirroring the exact same pattern
 * `salaryPaymentService.createSalaryPayment` already uses for the
 * conceptually identical "an obligation gets paid, so post the cash
 * outflow" case. `assertBranchDayNotClosed` blocks (doesn't auto-reopen —
 * this is a brand-new payment, not a correction to a past one).
 */
export async function createPayment(
  partnerId: string,
  input: { amount: number; note?: string | null; date: string; method: Prisma.SupplierPaymentCreateInput['method']; branchId: string },
  recordedById: string,
): Promise<SupplierPayment> {
  const date = new Date(input.date);
  await assertBranchDayNotClosed(input.branchId, date);

  return prisma.$transaction(async (tx) => {
    const row = await tx.supplierPayment.create({
      data: {
        partnerId,
        amount: input.amount,
        note: input.note ?? null,
        date,
        recordedById,
        method: input.method,
        branchId: input.branchId,
      },
    });

    await tx.treasuryEntry.create({
      data: {
        type: 'EXPENSE',
        amount: input.amount,
        method: input.method,
        category: 'دفعة مورد',
        note: input.note ?? null,
        date,
        sourceType: 'SUPPLIER_PAYMENT',
        supplierPaymentId: row.id,
        partnerId,
        staffId: recordedById,
        branchId: input.branchId,
      },
    });

    return mapPaymentToDto(row);
  });
}

/**
 * Accounting audit fix (2026-09-17, Decision 1/19) — now that a
 * SupplierPayment is paired with a real `TreasuryEntry`, editing the
 * payment must keep the two in sync atomically, same discipline as
 * `orderService.updatePayment` — never one without the other, and
 * `reopenDayIfClosed` surfaces a correction landing on an already-closed
 * day rather than silently blocking or ignoring it.
 */
export async function updatePayment(
  id: string,
  input: { amount?: number; note?: string | null; date?: string; method?: Prisma.SupplierPaymentUpdateInput['method'] },
): Promise<SupplierPayment> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.supplierPayment.findUniqueOrThrow({ where: { id } });
    const newAmount = input.amount ?? existing.amount;
    const newMethod = input.method ?? existing.method;
    const newDate = input.date !== undefined ? new Date(input.date) : existing.date;

    const row = await tx.supplierPayment.update({
      where: { id },
      data: {
        amount: input.amount,
        note: input.note === undefined ? undefined : input.note,
        date: input.date === undefined ? undefined : newDate,
        method: input.method,
      },
    });

    await tx.treasuryEntry.updateMany({
      where: { supplierPaymentId: id },
      data: { amount: newAmount, method: newMethod, date: newDate, note: input.note === undefined ? undefined : input.note },
    });

    if (existing.branchId) {
      await reopenDayIfClosed(existing.branchId, existing.date, existing.recordedById, `تعديل دفعة مورد`, tx);
    }

    return mapPaymentToDto(row);
  });
}

/**
 * Accounting audit fix (2026-09-17, Decision 1/19) — soft-deleting a
 * SupplierPayment now also soft-deletes its linked `TreasuryEntry`
 * atomically, same "reversal, never a dangling entry" discipline as
 * `orderService.deletePayment`.
 */
export async function softDeletePayment(id: string, deletedBy: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.supplierPayment.findUniqueOrThrow({ where: { id } });
    await tx.supplierPayment.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy },
    });
    await tx.treasuryEntry.updateMany({
      where: { supplierPaymentId: id },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy },
    });
    if (existing.branchId) {
      await reopenDayIfClosed(existing.branchId, existing.date, deletedBy, `حذف دفعة مورد`, tx);
    }
  });
}
