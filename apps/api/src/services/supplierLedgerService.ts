import type {
  SupplierDebtOverview,
  SupplierPayment,
  SupplierPurchase,
  SupplierStatement,
  SupplierSummary,
} from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import type { Prisma } from '../generated/prisma/client.js';

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
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listSuppliers(): Promise<SupplierSummary[]> {
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

  const partnerIds = partners.map((p) => p.id);
  const [purchaseSums, paymentSums] = await Promise.all([
    prisma.supplierPurchase.groupBy({
      by: ['partnerId'],
      where: { partnerId: { in: partnerIds }, isDeleted: false },
      _sum: { amount: true },
    }),
    prisma.supplierPayment.groupBy({
      by: ['partnerId'],
      where: { partnerId: { in: partnerIds }, isDeleted: false },
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

export async function getSupplierDebtOverview(): Promise<SupplierDebtOverview> {
  const suppliers = await listSuppliers();
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
): { openingBalance: number; entries: SupplierStatement['entries']; closingBalance: number } {
  let openingBalance = 0;
  let runningBalance = 0;
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
): Promise<SupplierStatement | null> {
  const partner = await prisma.businessPartner.findUnique({
    where: { id: partnerId },
    select: { id: true, nameAr: true, isDeleted: true },
  });
  if (!partner || partner.isDeleted) return null;

  const [purchases, payments] = await Promise.all([
    prisma.supplierPurchase.findMany({ where: { partnerId, isDeleted: false }, orderBy: { date: 'asc' } }),
    prisma.supplierPayment.findMany({ where: { partnerId, isDeleted: false }, orderBy: { date: 'asc' } }),
  ]);

  const merged: RawLedgerEntry[] = [
    ...purchases.map((p) => ({ kind: 'PURCHASE' as const, id: p.id, date: p.date, description: p.description, amount: p.amount.toNumber() })),
    ...payments.map((p) => ({ kind: 'PAYMENT' as const, id: p.id, date: p.date, description: p.note, amount: p.amount.toNumber() })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const { openingBalance, entries, closingBalance } = buildStatement(merged, from, to);

  return { partnerId: partner.id, nameAr: partner.nameAr, openingBalance, entries, closingBalance };
}

export async function createPurchase(
  partnerId: string,
  input: { amount: number; description?: string | null; date: string },
  recordedById: string,
): Promise<SupplierPurchase> {
  const row = await prisma.supplierPurchase.create({
    data: {
      partnerId,
      amount: input.amount,
      description: input.description ?? null,
      date: new Date(input.date),
      recordedById,
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

export async function createPayment(
  partnerId: string,
  input: { amount: number; note?: string | null; date: string },
  recordedById: string,
): Promise<SupplierPayment> {
  const row = await prisma.supplierPayment.create({
    data: {
      partnerId,
      amount: input.amount,
      note: input.note ?? null,
      date: new Date(input.date),
      recordedById,
    },
  });
  return mapPaymentToDto(row);
}

export async function updatePayment(
  id: string,
  input: { amount?: number; note?: string | null; date?: string },
): Promise<SupplierPayment> {
  const row = await prisma.supplierPayment.update({
    where: { id },
    data: {
      amount: input.amount,
      note: input.note === undefined ? undefined : input.note,
      date: input.date === undefined ? undefined : new Date(input.date),
    },
  });
  return mapPaymentToDto(row);
}

export async function softDeletePayment(id: string, deletedBy: string): Promise<void> {
  await prisma.supplierPayment.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy },
  });
}
