import { prisma } from '../lib/prisma.js';
import type { CreateFixedMonthlyExpenseInput, FixedMonthlyExpense, UpdateFixedMonthlyExpenseInput } from '@cleopatra/shared';

export class FixedMonthlyExpenseNotFoundError extends Error {
  constructor() {
    super('Fixed monthly expense not found');
    this.name = 'FixedMonthlyExpenseNotFoundError';
  }
}

type Row = {
  id: string;
  name: string;
  amount: { toNumber(): number };
  branchId: string | null;
  branch: { name: string } | null;
  createdAt: Date;
  updatedAt: Date;
};

function toDto(row: Row): FixedMonthlyExpense {
  return {
    id: row.id,
    name: row.name,
    amount: row.amount.toNumber(),
    branchId: row.branchId,
    branchName: row.branch?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listFixedMonthlyExpenses(): Promise<FixedMonthlyExpense[]> {
  const rows = await prisma.fixedMonthlyExpense.findMany({
    where: { isDeleted: false },
    include: { branch: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(toDto);
}

export async function createFixedMonthlyExpense(input: CreateFixedMonthlyExpenseInput): Promise<FixedMonthlyExpense> {
  const row = await prisma.fixedMonthlyExpense.create({
    data: { name: input.name, amount: input.amount, branchId: input.branchId ?? null },
    include: { branch: { select: { name: true } } },
  });
  return toDto(row);
}

export async function updateFixedMonthlyExpense(id: string, input: UpdateFixedMonthlyExpenseInput): Promise<FixedMonthlyExpense> {
  const existing = await prisma.fixedMonthlyExpense.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw new FixedMonthlyExpenseNotFoundError();
  const row = await prisma.fixedMonthlyExpense.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.branchId !== undefined ? { branchId: input.branchId } : {}),
    },
    include: { branch: { select: { name: true } } },
  });
  return toDto(row);
}

export async function deleteFixedMonthlyExpense(id: string, deletedBy: string): Promise<void> {
  const existing = await prisma.fixedMonthlyExpense.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw new FixedMonthlyExpenseNotFoundError();
  await prisma.fixedMonthlyExpense.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy },
  });
}

/**
 * Owner (2026-09-08, "محتاج قسم خاص بالخزينة يكون فيه المصروفات الشهرية
 * الدائمة علشان يخصمها من الربح يومياً... مثلا إيجار مكان 2800ج خاص بفرع
 * برينتنج المفروض يقسمه على ال30 يوم ويخصم يومياً... مرتبات الموظفين
 * يحسبها ويقسمها على الأيام ويخصمها") — the daily deduction against net
 * profit has two sources, both prorated: (1) every `FixedMonthlyExpense`
 * row ÷ 30, and (2) every active staff member's own real `baseSalary` ÷
 * their own pay-cycle day count (WEEKLY ÷ 7, MONTHLY ÷ 30 — never a
 * blanket ÷30 for a weekly-paid employee, which would understate their
 * real daily cost by roughly 4×). Both are attributed to a branch by that
 * row's own `branchId` (an expense's, or a `StaffProfile`'s home branch).
 *
 * A company-wide expense (`branchId: null`) isn't fairly one branch's
 * burden, so it is returned SEPARATELY as `companyWideDaily` rather than
 * folded into `perBranch` — a caller showing one branch's own row uses
 * only `perBranch`, while a caller showing the grand total across every
 * branch adds `companyWideDaily` in exactly once (see
 * `getCompanyFinancialSummary`'s own use of this).
 */
export async function getDailyFixedCostByBranch(): Promise<{ perBranch: Map<string, number>; companyWideDaily: number }> {
  const [expenses, staff] = await Promise.all([
    prisma.fixedMonthlyExpense.findMany({ where: { isDeleted: false }, select: { amount: true, branchId: true } }),
    prisma.staffProfile.findMany({
      where: { isActive: true, baseSalary: { not: null }, payFrequency: { not: null } },
      select: { branchId: true, baseSalary: true, payFrequency: true },
    }),
  ]);

  const perBranch = new Map<string, number>();
  let companyWideDaily = 0;
  const add = (branchId: string | null, dailyAmount: number) => {
    if (branchId === null) {
      companyWideDaily += dailyAmount;
      return;
    }
    perBranch.set(branchId, (perBranch.get(branchId) ?? 0) + dailyAmount);
  };

  for (const e of expenses) add(e.branchId, e.amount.toNumber() / 30);
  for (const s of staff) {
    const cycleDays = s.payFrequency === 'WEEKLY' ? 7 : 30;
    add(s.branchId, s.baseSalary!.toNumber() / cycleDays);
  }

  return { perBranch, companyWideDaily };
}
