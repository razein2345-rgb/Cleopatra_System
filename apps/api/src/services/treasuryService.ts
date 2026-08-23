import type { Prisma } from '../generated/prisma/client.js';
import type {
  CreateTreasuryEntryInput,
  MyTreasurySummary,
  TreasuryBalance,
  TreasuryCategoryTotal,
  TreasuryDayClosure,
  TreasuryDayClosurePreview,
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
    employeeAdvanceId: entry.employeeAdvanceId,
    employeeAdvanceRepaymentId: entry.employeeAdvanceRepaymentId,
    stockMovementId: entry.stockMovementId,
    salaryPaymentId: entry.salaryPaymentId,
    orderItemReturnId: entry.orderItemReturnId,
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
  await assertBranchDayNotClosed(input.branchId, input.date);

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
      partnerId: input.partnerId,
      branchId: input.branchId,
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

function mapDayClosureToDto(record: Prisma.TreasuryDayClosureGetPayload<object>): TreasuryDayClosure {
  return {
    id: record.id,
    branchId: record.branchId,
    date: record.date.toISOString().slice(0, 10),
    openingBalance: record.openingBalance.toNumber(),
    totalInflows: record.totalInflows.toNumber(),
    totalOutflows: record.totalOutflows.toNumber(),
    expectedClosingBalance: record.expectedClosingBalance.toNumber(),
    actualCountedCash: record.actualCountedCash.toNumber(),
    difference: record.difference.toNumber(),
    entryCountAtClose: record.entryCountAtClose,
    notes: record.notes,
    closedById: record.closedById,
    closedAt: record.closedAt.toISOString(),
    isOpen: record.isOpen,
    reopenedById: record.reopenedById,
    reopenedAt: record.reopenedAt?.toISOString() ?? null,
    reopenReason: record.reopenReason,
    isAutoClosed: record.isAutoClosed,
  };
}

/** UTC midnight of a given date (defaults to today) — matches the `@db.Date` column's own storage, no time-of-day component. */
function dateOnly(input?: Date | string): Date {
  const source = input ? new Date(input) : new Date();
  return new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()));
}

export class DayAlreadyClosedError extends Error {
  constructor() {
    super('This branch has already closed this day');
    this.name = 'DayAlreadyClosedError';
  }
}

export class DayNotClosedError extends Error {
  constructor() {
    super('This branch/day is not currently closed');
    this.name = 'DayNotClosedError';
  }
}

/**
 * The daily closing screen's whole reason to exist: a caller who tries to
 * record a treasury entry (manual, invoice payment, employee advance/
 * repayment — every write path, see each call site's own comment) for a
 * branch+date that was already closed and never reopened gets rejected
 * here, once, instead of the check being duplicated per call site.
 */
export class DayClosedError extends Error {
  constructor() {
    super('This branch/day is closed — new treasury entries are locked until it is reopened');
    this.name = 'DayClosedError';
  }
}

export async function assertBranchDayNotClosed(
  branchId: string,
  entryDate: Date | string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  const closure = await client.treasuryDayClosure.findUnique({
    where: { branchId_date: { branchId, date: dateOnly(entryDate) } },
  });
  if (closure && !closure.isOpen) throw new DayClosedError();
}

/**
 * Owner (2026-08-20, two separate confirmations that landed on the same
 * answer — payment corrections and returns both "تعديل رقم بعد ما تقفيل
 * الحساب... من غير أثر واضح" / "يفتح اليوم المقفول تلقائيًا لتسجيل
 * المرتجع") — unlike `assertBranchDayNotClosed` (which *blocks* a brand-new
 * entry on a closed day), a correction to money that already happened on
 * that day must still be recorded — so instead of blocking, this silently
 * reopens the day (a no-op if it was never closed, or already open) so the
 * correction lands visibly rather than being rejected. `reason` always
 * says which action caused the auto-reopen (`reopenedById`/`reopenReason`
 * on `TreasuryDayClosure` — same fields a manual reopen already fills in,
 * so a manual and an automatic reopen are indistinguishable in the audit
 * trail except by their reason text).
 */
export async function reopenDayIfClosed(
  branchId: string,
  entryDate: Date | string,
  staffId: string,
  reason: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  const date = dateOnly(entryDate);
  const closure = await client.treasuryDayClosure.findUnique({ where: { branchId_date: { branchId, date } } });
  if (!closure || closure.isOpen) return;
  await client.treasuryDayClosure.update({
    where: { id: closure.id },
    data: { isOpen: true, reopenedById: staffId, reopenedAt: new Date(), reopenReason: reason },
  });
}

/** Cash-only inflow/outflow totals for one branch+day — the physical-drawer reconciliation the owner asked for excludes Vodafone Cash/InstaPay/bank entries, which never touch the counted cash. */
async function computeCashFlows(
  branchId: string,
  date: Date,
): Promise<{ inflows: number; outflows: number; entryCount: number }> {
  const startOfDay = date;
  const endOfDay = new Date(date.getTime() + 24 * 60 * 60 * 1000 - 1);
  const grouped = await prisma.treasuryEntry.groupBy({
    by: ['type'],
    where: { isDeleted: false, branchId, method: 'CASH', date: { gte: startOfDay, lte: endOfDay } },
    _sum: { amount: true },
    _count: { _all: true },
  });

  let inflows = 0;
  let outflows = 0;
  let entryCount = 0;
  for (const g of grouped) {
    const amount = g._sum.amount?.toNumber() ?? 0;
    entryCount += g._count._all;
    if (g.type === 'INCOME') inflows += amount;
    else if (g.type === 'EXPENSE') outflows += amount;
    // TRANSFER entries move cash between wallets, not into/out of the branch — excluded, same convention as getTreasuryBalance.
  }
  return { inflows, outflows, entryCount };
}

/** The counted cash left in the drawer at the last *actually closed* (not currently reopened) prior day for this branch — 0 if the branch has never closed a day before. */
async function getCarryForwardOpeningBalance(branchId: string, beforeDate: Date): Promise<number> {
  const previous = await prisma.treasuryDayClosure.findFirst({
    where: { branchId, date: { lt: beforeDate }, isOpen: false },
    orderBy: { date: 'desc' },
  });
  return previous?.actualCountedCash.toNumber() ?? 0;
}

/** The live numbers for today (or any not-yet-closed day) before the employee commits a close — same math `closeTreasuryDay` persists, computed fresh on every call. */
export async function getDayClosurePreview(branchId: string, forDate?: string): Promise<TreasuryDayClosurePreview> {
  const date = dateOnly(forDate);
  const openingBalance = await getCarryForwardOpeningBalance(branchId, date);
  const { inflows, outflows, entryCount } = await computeCashFlows(branchId, date);
  return {
    branchId,
    date: date.toISOString().slice(0, 10),
    openingBalance,
    totalInflows: inflows,
    totalOutflows: outflows,
    expectedClosingBalance: openingBalance + inflows - outflows,
    entryCount,
  };
}

/**
 * FEATURE-016, rebuilt 2026-08-18 per the owner's detailed spec — a real
 * cash-drawer reconciliation (Opening + Inflows - Outflows = Expected,
 * compared against what the employee actually counted), not the old
 * review-marker-only behaviour. Locks new treasury entries for this
 * branch+date going forward (`assertBranchDayNotClosed`) until reopened.
 * Re-closing after a reopen updates the same row (full audit trail lives
 * in `AuditLog`, not in extra rows here) — closing while still `isOpen:
 * false` (never reopened) is the 409 case.
 */
export async function closeTreasuryDay(
  branchId: string,
  staffId: string,
  actualCountedCash: number,
  notes?: string,
  // Owner (2026-08-23, "ان احدد وقت لما يجي الحساب بيتقفل دايركت") — set
  // only by `autoCloseDayJob.ts`; a human closing the day always counts
  // the real drawer, so this stays `false` for every other caller.
  isAutoClosed = false,
): Promise<TreasuryDayClosure> {
  const date = dateOnly();
  const existing = await prisma.treasuryDayClosure.findUnique({ where: { branchId_date: { branchId, date } } });
  if (existing && !existing.isOpen) throw new DayAlreadyClosedError();

  const openingBalance = await getCarryForwardOpeningBalance(branchId, date);
  const { inflows, outflows, entryCount } = await computeCashFlows(branchId, date);
  const expectedClosingBalance = openingBalance + inflows - outflows;
  const difference = actualCountedCash - expectedClosingBalance;

  const data = {
    branchId,
    date,
    openingBalance,
    totalInflows: inflows,
    totalOutflows: outflows,
    expectedClosingBalance,
    actualCountedCash,
    difference,
    entryCountAtClose: entryCount,
    notes: notes ?? null,
    closedById: staffId,
    closedAt: new Date(),
    isOpen: false,
    reopenedById: null,
    reopenedAt: null,
    reopenReason: null,
    isAutoClosed,
  };

  const result = existing
    ? await prisma.treasuryDayClosure.update({ where: { id: existing.id }, data })
    : await prisma.treasuryDayClosure.create({ data });
  return mapDayClosureToDto(result);
}

/** Unlocks new entries for an already-closed branch+date. Gated at the controller layer to SUPER_ADMIN/ADMIN only, per the owner's "Reopening should require the appropriate authorized permission" — a stricter bar than closing itself (which any `treasury.create` holder can do). */
export async function reopenTreasuryDay(
  branchId: string,
  forDate: string,
  staffId: string,
  reason: string,
): Promise<TreasuryDayClosure> {
  const date = dateOnly(forDate);
  const existing = await prisma.treasuryDayClosure.findUnique({ where: { branchId_date: { branchId, date } } });
  if (!existing || existing.isOpen) throw new DayNotClosedError();

  const updated = await prisma.treasuryDayClosure.update({
    where: { id: existing.id },
    data: { isOpen: true, reopenedById: staffId, reopenedAt: new Date(), reopenReason: reason },
  });
  return mapDayClosureToDto(updated);
}

/** Null when today hasn't been closed yet for this branch — the normal, default state. */
export async function getTodayClosure(branchId: string): Promise<TreasuryDayClosure | null> {
  const closure = await prisma.treasuryDayClosure.findUnique({
    where: { branchId_date: { branchId, date: dateOnly() } },
  });
  return closure ? mapDayClosureToDto(closure) : null;
}

/**
 * Owner (2026-08-20, "حابب إن يظهرلي جمب التصنيف بتاع الخزينة بيدخلي كام
 * إجمالي وشهرياً") — total and this-calendar-month sums per category
 * name, for the "إدارة تصنيفات المصروفات/الإيرادات" settings screen.
 * Matched by `TreasuryEntry.category`'s free-text value (not an FK — see
 * TreasuryCategory's own schema comment), so this also naturally surfaces
 * totals for any legacy free-text category never added to the managed
 * list. `entries with category: null` are simply excluded — there's no
 * catalog row to attribute them to.
 */
export async function getTreasuryCategoryTotals(): Promise<TreasuryCategoryTotal[]> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [allTime, thisMonth] = await Promise.all([
    prisma.treasuryEntry.groupBy({
      by: ['category'],
      where: { isDeleted: false, category: { not: null } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.treasuryEntry.groupBy({
      by: ['category'],
      where: { isDeleted: false, category: { not: null }, date: { gte: startOfMonth } },
      _sum: { amount: true },
    }),
  ]);

  const monthByCategory = new Map(thisMonth.map((row) => [row.category as string, row._sum.amount?.toNumber() ?? 0]));

  return allTime.map((row) => ({
    category: row.category as string,
    total: row._sum.amount?.toNumber() ?? 0,
    month: monthByCategory.get(row.category as string) ?? 0,
    entryCount: row._count,
  }));
}
