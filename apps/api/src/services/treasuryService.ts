import type { Prisma } from '../generated/prisma/client.js';
import type {
  CreateTreasuryEntryInput,
  EmployeeCashCustody,
  MyTreasurySummary,
  TreasuryBalance,
  TreasuryCategoryTotal,
  TreasuryDayClosure,
  TreasuryDayClosurePreview,
  TreasuryEntry,
  UpdateTreasuryEntryInput,
} from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { businessDayRangeUtc } from '../lib/businessTimezone.js';

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
    expenseId: entry.expenseId,
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
  /**
   * FEATURE-007 M3 (2026-08-13, owner: "الوارد والمنصرف في شاشة الموظف على
   * حسب الفرع بتاعه") — scopes to this branch's entries only (the
   * reception-safe view, never the org-wide list). Branch-scoped, not
   * staff-scoped: everyone assigned to a branch sees that branch's own
   * ledger, not just their own personal entries within it.
   * Owner (2026-09-07, "عايز افصل أمين خزينة كليوباترا عن أمين خزينة
   * برينتنج فا ميظهرش ده هنا ولا ده هنا") — an array scopes to "any of
   * these branches" (a non-Super-Admin cashier's own accessible set),
   * distinct from a bare string (one specific branch) or omitted (every
   * branch — Super Admin only, enforced at the controller).
   */
  branchId?: string | string[];
  /** Owner (2026-08-23, "لما يتضاف يتضاف في صفحة الموردين علشان اعرف انا بدفعله كام") — every entry (payment received from OR paid to) linked to one BusinessPartner, for that partner's own profile page. */
  partnerId?: string;
}): Promise<TreasuryEntry[]> {
  const entries = await prisma.treasuryEntry.findMany({
    where: {
      isDeleted: false,
      ...(filters.branchId
        ? { branchId: Array.isArray(filters.branchId) ? { in: filters.branchId } : filters.branchId }
        : {}),
      ...(filters.partnerId ? { partnerId: filters.partnerId } : {}),
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
 * Owner (2026-08-26, "لما يكون موظف مبيعات يظهرله بعد تقفيل الحساب اليوم
 * متصفر... مفترض إنه سلم فلوس المبيعات لأمين الخزينة") — real cash
 * custody, computed at read time (never stored/mutated). `staffId`'s
 * branch is looked up from `StaffProfile.branchId`, then every CASH-method
 * INCOME entry THIS employee recorded since their branch's most recent
 * daily closing is summed. No separate "handed over" action exists —
 * closing the day (`closeTreasuryDay`) is itself the reset trigger, since
 * any entry recorded after that `closedAt` starts a fresh custody period.
 */
export async function getEmployeeCashCustody(staffId: string): Promise<EmployeeCashCustody> {
  const staff = await prisma.staffProfile.findUniqueOrThrow({ where: { id: staffId }, select: { branchId: true } });
  const lastClosure = await prisma.treasuryDayClosure.findFirst({
    where: { branchId: staff.branchId },
    orderBy: { closedAt: 'desc' },
    select: { closedAt: true },
  });

  const result = await prisma.treasuryEntry.aggregate({
    where: {
      isDeleted: false,
      staffId,
      type: 'INCOME',
      method: 'CASH',
      ...(lastClosure ? { date: { gt: lastClosure.closedAt } } : {}),
    },
    _sum: { amount: true },
  });

  return { amount: result._sum.amount?.toNumber() ?? 0, sinceDate: lastClosure?.closedAt.toISOString() ?? null };
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
/**
 * Owner (2026-08-26, "المفروض إنك فرقت بين أمين خزينة برينتنج وأمين خزينة
 * كليوباترا... يبقى عندي إمكانية رؤية الإتنين وإمكانية رؤية كليوباترا بس
 * ورؤية برينتنج بس") — `branchId` was always accepted by the entries-list
 * endpoint (`listTreasuryEntries`) but never by this balance summary,
 * leaving the admin Treasury screen with no way to narrow the top-line
 * figures to one branch. Undefined (the existing default) still means
 * "both combined" — nothing changes for a caller that never passes it.
 *
 * Owner (2026-09-07, "عايز افصل أمين خزينة كليوباترا عن أمين خزينة
 * برينتنج فا ميظهرش ده هنا ولا ده هنا") — accepts an array too, scoping
 * to "any of these branches" (a non-Super-Admin caller's own accessible
 * set) rather than the org-wide total, enforced at the controller.
 */
export async function getTreasuryBalance(branchId?: string | string[]): Promise<TreasuryBalance> {
  const branchWhere = Array.isArray(branchId) ? { branchId: { in: branchId } } : branchId ? { branchId } : {};
  const grouped = await prisma.treasuryEntry.groupBy({
    by: ['type'],
    where: { isDeleted: false, ...branchWhere },
    _sum: { amount: true },
  });
  const totals: Record<'INCOME' | 'EXPENSE' | 'TRANSFER', number> = { INCOME: 0, EXPENSE: 0, TRANSFER: 0 };
  for (const g of grouped) totals[g.type] = g._sum.amount?.toNumber() ?? 0;

  const groupedByMethod = await prisma.treasuryEntry.groupBy({
    by: ['method', 'type'],
    where: { isDeleted: false, method: { not: null }, type: { in: ['INCOME', 'EXPENSE'] }, ...branchWhere },
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

/**
 * Opening State / Cutover (Phase 3C.2) — single-branch, cutover-aware Cash
 * Position: `TreasuryOpening` (all methods) + TreasuryEntry since
 * `goLiveDate` (Cairo business-day boundary, via `businessDayRangeUtc` —
 * never naive UTC midnight). Deliberately a NEW, separate function rather
 * than a change to `getTreasuryBalance` above: that function's existing
 * multi-branch/all-branch aggregation (used by dashboards, AI tools, and
 * company-wide reports) would need a per-branch cutover lookup for every
 * branch in an arbitrary set, a materially bigger and riskier change than
 * this feature needs. A branch with no ACTIVE, non-superseded cutover
 * behaves exactly like `getTreasuryBalance(branchId)` — full backward
 * compatibility. This is a Cash Position figure ONLY — it must never be
 * read as period income/expense/revenue (see branchFinancialsService.ts's
 * `periodPayments` fix for the sibling rule on the "Cash Received" side).
 */
export async function getBranchCashPosition(branchId: string): Promise<TreasuryBalance> {
  const cutover = await prisma.cutoverRecord.findFirst({ where: { branchId, isSuperseded: false, status: 'ACTIVE' } });
  if (!cutover) return getTreasuryBalance(branchId);

  const boundary = businessDayRangeUtc(cutover.goLiveDate.toISOString().slice(0, 10)).start;
  const [openings, grouped, groupedByMethod] = await Promise.all([
    prisma.treasuryOpening.findMany({ where: { cutoverId: cutover.id } }),
    prisma.treasuryEntry.groupBy({
      by: ['type'],
      where: { isDeleted: false, branchId, date: { gte: boundary } },
      _sum: { amount: true },
    }),
    prisma.treasuryEntry.groupBy({
      by: ['method', 'type'],
      where: { isDeleted: false, branchId, method: { not: null }, type: { in: ['INCOME', 'EXPENSE'] }, date: { gte: boundary } },
      _sum: { amount: true },
    }),
  ]);

  const totals: Record<'INCOME' | 'EXPENSE' | 'TRANSFER', number> = { INCOME: 0, EXPENSE: 0, TRANSFER: 0 };
  for (const g of grouped) totals[g.type] = g._sum.amount?.toNumber() ?? 0;

  const byMethodTotals = new Map<string, number>();
  for (const o of openings) byMethodTotals.set(o.method, o.amount.toNumber());
  for (const g of groupedByMethod) {
    if (!g.method) continue;
    const amount = g._sum.amount?.toNumber() ?? 0;
    const delta = g.type === 'INCOME' ? amount : -amount;
    byMethodTotals.set(g.method, (byMethodTotals.get(g.method) ?? 0) + delta);
  }
  const openingTotal = openings.reduce((sum, o) => sum + o.amount.toNumber(), 0);

  return {
    totalIncome: totals.INCOME,
    totalExpense: totals.EXPENSE,
    totalTransfer: totals.TRANSFER,
    balance: openingTotal + totals.INCOME - totals.EXPENSE,
    byMethod: [...byMethodTotals.entries()].map(([method, balance]) => ({
      method: method as TreasuryBalance['byMethod'][number]['method'],
      balance,
    })),
  };
}

/**
 * Opening State / Cutover (3C.2 correction) — the multi/all-branch entry
 * point for Cash Position, matching `getTreasuryBalance`'s own
 * `string | string[] | undefined` convention (single branch, an explicit
 * set, or "every branch" for a Super Admin with no filter) so the two
 * genuinely-Cash-Position callers that need that full range —
 * `getTreasuryBalanceHandler` and the AI `get_treasury_summary` tool — can
 * simply swap which function they call, no other change to their own
 * branch-resolution logic. Deliberately pure aggregation: sums
 * `getBranchCashPosition` per branch rather than re-deriving a second
 * calculation, so a branch with no ACTIVE cutover still resolves through
 * that function's own unchanged `getTreasuryBalance(branchId)` fallback,
 * and adding a cutover to one branch never affects any other branch's
 * contribution to the combined total.
 */
export async function getCashPosition(branchId?: string | string[]): Promise<TreasuryBalance> {
  const ids = Array.isArray(branchId)
    ? branchId
    : branchId
      ? [branchId]
      : (await prisma.branch.findMany({ where: { isDeleted: false }, select: { id: true } })).map((b) => b.id);

  if (ids.length === 0) return { totalIncome: 0, totalExpense: 0, totalTransfer: 0, balance: 0, byMethod: [] };

  const positions = await Promise.all(ids.map((id) => getBranchCashPosition(id)));

  const totals = positions.reduce(
    (acc, p) => ({
      totalIncome: acc.totalIncome + p.totalIncome,
      totalExpense: acc.totalExpense + p.totalExpense,
      totalTransfer: acc.totalTransfer + p.totalTransfer,
      balance: acc.balance + p.balance,
    }),
    { totalIncome: 0, totalExpense: 0, totalTransfer: 0, balance: 0 },
  );

  const byMethodTotals = new Map<string, number>();
  for (const p of positions) {
    for (const m of p.byMethod) byMethodTotals.set(m.method, (byMethodTotals.get(m.method) ?? 0) + m.balance);
  }

  return {
    ...totals,
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

/**
 * Opening State / Cutover (Phase 3C.1 §4, 3C.2 §14) — a real implementation
 * gap identified during the audit: with no prior closed day, this used to
 * always return 0, even for a branch that just went live with a real,
 * physically-verified opening cash position (`TreasuryOpening`). Only
 * consulted when NO prior `TreasuryDayClosure` row exists at all — the
 * moment any real closure exists, the normal carry-forward chain above
 * takes over exactly as before, so a branch with pre-cutover Cleopatra
 * history (Case 1 — it used Cleopatra before an outage) is completely
 * unaffected. A branch with no `CutoverRecord` at all behaves exactly as
 * today (returns 0) — full backward compatibility, by construction.
 */
async function getCutoverCashSeed(branchId: string): Promise<number> {
  const cutover = await prisma.cutoverRecord.findFirst({
    where: { branchId, isSuperseded: false, status: 'ACTIVE' },
  });
  if (!cutover) return 0;

  const cashOpening = await prisma.treasuryOpening.findUnique({
    where: { cutoverId_method: { cutoverId: cutover.id, method: 'CASH' } },
  });
  return cashOpening?.amount.toNumber() ?? 0;
}

/** The counted cash left in the drawer at the last *actually closed* (not currently reopened) prior day for this branch — 0 if the branch has never closed a day before. */
async function getCarryForwardOpeningBalance(branchId: string, beforeDate: Date): Promise<number> {
  const previous = await prisma.treasuryDayClosure.findFirst({
    where: { branchId, date: { lt: beforeDate }, isOpen: false },
    orderBy: { date: 'desc' },
  });
  if (previous) return previous.actualCountedCash.toNumber();
  return getCutoverCashSeed(branchId);
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
