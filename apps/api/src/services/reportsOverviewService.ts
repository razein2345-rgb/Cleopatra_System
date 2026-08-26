import type { ReportsOverview } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';

/**
 * صفحة التقارير الشاملة — جزء 6 (آخر جزء عمدًا، بيجمّع كل الأجزاء التانية)
 * من مبادرة "فصل الخزينة/الربح بالفرع + الموردين + التقارير"
 * (docs/AI/PROJECT_STATUS.md § 6). owner أكّد صراحة: مجمّعة لكل الشركة، مش
 * مقسّمة لكل فرع. كل تصنيف من الـ7 بيعيد استخدام بيانات موجودة بالفعل —
 * صفر مصدر بيانات جديد، الجديد هنا هو التجميع/العرض بس.
 *
 * `TreasuryEntry.sourceType` (موجود من زمان) هو اللي بيفرّق "مدفوعات
 * الموظفين" عن "المصروفات" العادية من نفس الجدول، بدل استعلام 3 جداول
 * منفصلة ودمجهم يدوي.
 */
export async function getReportsOverview(from?: Date, to?: Date): Promise<ReportsOverview> {
  const dateFilter = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  const hasDateFilter = Boolean(from || to);

  const [
    methodGrouped,
    typeGrouped,
    ordersForDebt,
    salesInvoices,
    treasuryEntries,
    supplierPurchases,
    stockMovements,
  ] = await Promise.all([
    prisma.treasuryEntry.groupBy({
      by: ['method', 'type'],
      where: {
        isDeleted: false,
        method: { not: null },
        type: { in: ['INCOME', 'EXPENSE'] },
        ...(hasDateFilter ? { date: dateFilter } : {}),
      },
      _sum: { amount: true },
    }),
    prisma.treasuryEntry.groupBy({
      by: ['type'],
      where: { isDeleted: false, ...(hasDateFilter ? { date: dateFilter } : {}) },
      _sum: { amount: true },
    }),
    // ديون العملاء — الحالة الحالية دايمًا (مش مرتبطة بالفترة)، زي أي "دين مستحق".
    prisma.order.findMany({
      where: { isDeleted: false, status: { not: 'CANCELLED' }, partnerId: { not: null } },
      select: {
        partnerId: true,
        partner: { select: { nameAr: true } },
        finalTotal: true,
        payments: { where: { isDeleted: false }, select: { amount: true } },
        items: { select: { returns: { select: { refundAmount: true } } } },
      },
    }),
    prisma.order.findMany({
      where: { isDeleted: false, status: { not: 'CANCELLED' }, ...(hasDateFilter ? { date: dateFilter } : {}) },
      select: {
        id: true,
        invoiceNumber: true,
        date: true,
        finalTotal: true,
        partner: { select: { nameAr: true } },
        payments: { where: { isDeleted: false }, select: { amount: true } },
        items: { select: { returns: { select: { refundAmount: true } } } },
      },
      orderBy: { date: 'desc' },
    }),
    prisma.treasuryEntry.findMany({
      where: { isDeleted: false, ...(hasDateFilter ? { date: dateFilter } : {}) },
      select: {
        id: true,
        type: true,
        sourceType: true,
        date: true,
        amount: true,
        method: true,
        category: true,
        note: true,
        partner: { select: { nameAr: true } },
        salaryPayment: { select: { staff: { select: { name: true } } } },
        employeeAdvance: { select: { staff: { select: { name: true } } } },
        employeeAdvanceRepayment: { select: { advance: { select: { staff: { select: { name: true } } } } } },
      },
      orderBy: { date: 'desc' },
    }),
    prisma.supplierPurchase.findMany({
      where: { isDeleted: false, ...(hasDateFilter ? { date: dateFilter } : {}) },
      select: { id: true, date: true, amount: true, description: true, partner: { select: { nameAr: true } } },
      orderBy: { date: 'desc' },
    }),
    prisma.stockMovement.findMany({
      where: { isDeleted: false, ...(hasDateFilter ? { date: dateFilter } : {}) },
      select: { id: true, date: true, type: true, quantity: true, reference: true, inventoryItem: { select: { name: true } } },
      orderBy: { date: 'desc' },
    }),
  ]);

  const byMethodTotals = new Map<string, number>();
  for (const g of methodGrouped) {
    if (!g.method) continue;
    const amount = g._sum.amount?.toNumber() ?? 0;
    const delta = g.type === 'INCOME' ? amount : -amount;
    byMethodTotals.set(g.method, (byMethodTotals.get(g.method) ?? 0) + delta);
  }
  const byPaymentMethod = Array.from(byMethodTotals.entries()).map(([method, balance]) => ({ method, balance }));

  const typeTotals: Record<'INCOME' | 'EXPENSE' | 'TRANSFER', number> = { INCOME: 0, EXPENSE: 0, TRANSFER: 0 };
  for (const g of typeGrouped) typeTotals[g.type] = g._sum.amount?.toNumber() ?? 0;

  const debtByPartner = new Map<string, { nameAr: string; outstanding: number }>();
  for (const order of ordersForDebt) {
    if (!order.partnerId || !order.partner) continue;
    const paid = order.payments.reduce((sum, p) => sum + p.amount.toNumber(), 0);
    const returned = order.items.reduce(
      (sum, item) => sum + item.returns.reduce((s, r) => s + r.refundAmount.toNumber(), 0),
      0,
    );
    const remaining = order.finalTotal.toNumber() - returned - paid;
    if (remaining <= 0) continue;
    const entry = debtByPartner.get(order.partnerId) ?? { nameAr: order.partner.nameAr, outstanding: 0 };
    entry.outstanding += remaining;
    debtByPartner.set(order.partnerId, entry);
  }
  const customerDebts = Array.from(debtByPartner.entries())
    .map(([partnerId, v]) => ({ partnerId, nameAr: v.nameAr, outstanding: v.outstanding }))
    .sort((a, b) => b.outstanding - a.outstanding);
  const totalCustomerDebt = customerDebts.reduce((sum, d) => sum + d.outstanding, 0);

  const salesInvoiceRows = salesInvoices.map((order) => {
    const paid = order.payments.reduce((sum, p) => sum + p.amount.toNumber(), 0);
    const returned = order.items.reduce(
      (sum, item) => sum + item.returns.reduce((s, r) => s + r.refundAmount.toNumber(), 0),
      0,
    );
    return {
      orderId: order.id,
      invoiceNumber: order.invoiceNumber,
      date: order.date.toISOString(),
      partnerName: order.partner?.nameAr ?? null,
      finalTotal: order.finalTotal.toNumber(),
      remainingBalance: order.finalTotal.toNumber() - returned - paid,
    };
  });

  const employeeSourceTypes = new Set(['EMPLOYEE_ADVANCE', 'EMPLOYEE_ADVANCE_REPAYMENT', 'SALARY_PAYMENT']);
  const employeePayments = treasuryEntries
    .filter((e) => employeeSourceTypes.has(e.sourceType))
    .map((e) => ({
      id: e.id,
      date: e.date.toISOString(),
      staffName:
        e.salaryPayment?.staff.name ?? e.employeeAdvance?.staff.name ?? e.employeeAdvanceRepayment?.advance.staff.name ?? '—',
      amount: e.amount.toNumber(),
      kind: e.sourceType as 'SALARY_PAYMENT' | 'EMPLOYEE_ADVANCE' | 'EMPLOYEE_ADVANCE_REPAYMENT',
      note: e.note,
    }));
  const expenses = treasuryEntries
    .filter((e) => e.type === 'EXPENSE' && !employeeSourceTypes.has(e.sourceType))
    .map((e) => ({
      id: e.id,
      date: e.date.toISOString(),
      amount: e.amount.toNumber(),
      method: e.method,
      category: e.category,
      note: e.note,
      partnerName: e.partner?.nameAr ?? null,
    }));
  const transfers = treasuryEntries
    .filter((e) => e.type === 'TRANSFER')
    .map((e) => ({
      id: e.id,
      date: e.date.toISOString(),
      amount: e.amount.toNumber(),
      method: e.method,
      category: e.category,
      note: e.note,
      partnerName: e.partner?.nameAr ?? null,
    }));

  const purchases = supplierPurchases.map((p) => ({
    id: p.id,
    date: p.date.toISOString(),
    supplierName: p.partner.nameAr,
    amount: p.amount.toNumber(),
    description: p.description,
  }));

  const inventoryMovements = stockMovements.map((m) => ({
    id: m.id,
    date: m.date.toISOString(),
    itemName: m.inventoryItem.name,
    type: m.type,
    quantity: m.quantity.toNumber(),
    reference: m.reference,
  }));

  return {
    from: from ? from.toISOString() : null,
    to: to ? to.toISOString() : null,
    byPaymentMethod,
    totalIncome: typeTotals.INCOME,
    totalExpense: typeTotals.EXPENSE,
    totalTransfer: typeTotals.TRANSFER,
    customerDebts,
    totalCustomerDebt,
    salesInvoices: salesInvoiceRows,
    expenses,
    transfers,
    purchases,
    inventoryMovements,
    employeePayments,
  };
}
