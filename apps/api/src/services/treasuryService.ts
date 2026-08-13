import type { Prisma } from '../generated/prisma/client.js';
import type {
  CreateTreasuryEntryInput,
  MyTreasurySummary,
  TreasuryBalance,
  TreasuryEntry,
  UpdateTreasuryEntryInput,
} from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';

type TreasuryEntryRecord = Prisma.TreasuryEntryGetPayload<object>;

export function mapTreasuryEntryToDto(entry: TreasuryEntryRecord): TreasuryEntry {
  return {
    id: entry.id,
    type: entry.type,
    amount: entry.amount.toNumber(),
    category: entry.category,
    note: entry.note,
    date: entry.date.toISOString(),
    sourceType: entry.sourceType,
    method: entry.method,
    orderId: entry.orderId,
    paymentId: entry.paymentId,
    partnerId: entry.partnerId,
    staffId: entry.staffId,
    branchId: entry.branchId,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export class TreasuryEntryNotFoundError extends Error {
  constructor() {
    super('Treasury entry not found');
    this.name = 'TreasuryEntryNotFoundError';
  }
}

/**
 * Auto-posted entries (`sourceType: 'INVOICE_PAYMENT'`, created only by
 * `orderService.recordPayment`) may never be edited or deleted through
 * this module — they are the audit trail of a real payment. This is the
 * one place that rule is enforced, not duplicated per call site.
 */
export class ManualEntryOnlyError extends Error {
  constructor() {
    super('Only manually recorded entries can be edited or deleted here');
    this.name = 'ManualEntryOnlyError';
  }
}

export async function listTreasuryEntries(filters: {
  type?: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  /** FEATURE-007 M3 (2026-08-13, owner: "الوارد والمنصرف في شاشة الموظف على حسب الفرع بتاعه") — scopes to this branch's entries only (the reception-safe view, never the org-wide list). Branch-scoped, not staff-scoped: everyone assigned to a branch sees that branch's own ledger, not just their own personal entries within it. */
  branchId?: string;
}): Promise<TreasuryEntry[]> {
  const entries = await prisma.treasuryEntry.findMany({
    where: {
      isDeleted: false,
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            date: {
              ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
              ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
            },
          }
        : {}),
      ...(filters.search
        ? {
            OR: [
              { note: { contains: filters.search, mode: 'insensitive' } },
              { category: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { date: 'desc' },
  });
  return entries.map(mapTreasuryEntryToDto);
}

/**
 * The reception-safe summary — total and count of entries recorded under
 * a specific branch, never the org-wide balance. This is the only
 * treasury figure a caller with `treasury.create` but not `treasury.view`
 * may ever see (locked decision, FEATURE-007 00_REQUIREMENTS.md).
 *
 * Branch-scoped, not staff-scoped (2026-08-13, owner: "الوارد والمنصرف في
 * شاشة الموظف على حسب الفرع بتاعه — لو حاطه في فرع كليوباترا يبقى الوارد
 * والمنصرف بتاعه في كليوباترا بس") — a caller assigned to a branch sees
 * that branch's own running total, not just the entries they personally
 * recorded within it.
 */
export async function getMyTreasurySummary(branchId: string): Promise<MyTreasurySummary> {
  const result = await prisma.treasuryEntry.aggregate({
    where: { isDeleted: false, branchId },
    _sum: { amount: true },
    _count: true,
  });
  return { total: result._sum.amount?.toNumber() ?? 0, entryCount: result._count };
}

/**
 * Balance = income - expense. Transfers move cash between wallets — they
 * are recorded for the ledger/history but never change the total, the
 * same reasoning `treasuryBalanceSchema`'s own doc comment states.
 * `byMethod` (FEATURE-007 M3) is the same income-minus-expense math, just
 * grouped per wallet instead of collapsed to one figure — entries with no
 * `method` (pre-M3 history) are excluded from the breakdown, not folded
 * into a misleading "unknown wallet" bucket.
 */
export async function getTreasuryBalance(): Promise<TreasuryBalance> {
  const grouped = await prisma.treasuryEntry.groupBy({
    by: ['type'],
    where: { isDeleted: false },
    _sum: { amount: true },
  });
  const totals: Record<'INCOME' | 'EXPENSE' | 'TRANSFER', number> = { INCOME: 0, EXPENSE: 0, TRANSFER: 0 };
  for (const g of grouped) totals[g.type] = g._sum.amount?.toNumber() ?? 0;

  const groupedByMethod = await prisma.treasuryEntry.groupBy({
    by: ['method', 'type'],
    where: { isDeleted: false, method: { not: null }, type: { in: ['INCOME', 'EXPENSE'] } },
    _sum: { amount: true },
  });
  const byMethodTotals = new Map<string, number>();
  for (const g of groupedByMethod) {
    if (!g.method) continue;
    const amount = g._sum.amount?.toNumber() ?? 0;
    const delta = g.type === 'INCOME' ? amount : -amount;
    byMethodTotals.set(g.method, (byMethodTotals.get(g.method) ?? 0) + delta);
  }

  return {
    totalIncome: totals.INCOME,
    totalExpense: totals.EXPENSE,
    totalTransfer: totals.TRANSFER,
    balance: totals.INCOME - totals.EXPENSE,
    byMethod: [...byMethodTotals.entries()].map(([method, balance]) => ({
      method: method as TreasuryBalance['byMethod'][number]['method'],
      balance,
    })),
  };
}

export async function createManualTreasuryEntry(
  input: CreateTreasuryEntryInput,
  staffId: string,
): Promise<TreasuryEntry> {
  const created = await prisma.treasuryEntry.create({
    data: {
      type: input.type,
      amount: input.amount,
      method: input.method,
      category: input.category ?? null,
      note: input.note ?? null,
      date: new Date(input.date),
      sourceType: 'MANUAL',
      branchId: input.branchId,
      partnerId: input.partnerId ?? null,
      staffId,
    },
  });
  return mapTreasuryEntryToDto(created);
}

export async function updateManualTreasuryEntry(
  id: string,
  input: UpdateTreasuryEntryInput,
): Promise<TreasuryEntry> {
  const existing = await prisma.treasuryEntry.findUnique({ where: { id } });
  if (!existing || existing.isDeleted) throw new TreasuryEntryNotFoundError();
  if (existing.sourceType !== 'MANUAL') throw new ManualEntryOnlyError();

  const updated = await prisma.treasuryEntry.update({
    where: { id },
    data: {
      amount: input.amount,
      method: input.method,
      category: input.category,
      note: input.note,
      date: input.date ? new Date(input.date) : undefined,
    },
  });
  return mapTreasuryEntryToDto(updated);
}

export async function deleteManualTreasuryEntry(id: string, deletedBy: string): Promise<void> {
  const existing = await prisma.treasuryEntry.findUnique({ where: { id } });
  if (!existing || existing.isDeleted) throw new TreasuryEntryNotFoundError();
  if (existing.sourceType !== 'MANUAL') throw new ManualEntryOnlyError();

  await prisma.treasuryEntry.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy },
  });
}
