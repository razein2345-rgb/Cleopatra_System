import { z } from 'zod';

/**
 * صفحة التقارير الشاملة — جزء 6 (آخر جزء عمدًا) من مبادرة "فصل الخزينة/
 * الربح بالفرع + الموردين + التقارير" (docs/AI/PROJECT_STATUS.md § 6).
 * owner: تصميم مطابق لصور مرجعية — أرصدة لكل طريقة دفع بفترة زمنية + جدول
 * تفصيلي متبوّب (ديون العملاء/فواتير البيع/المصروفات/التحويلات/المشتريات/
 * المخزن/مدفوعات الموظفين). owner أكّد صراحة: مجمّعة لكل الشركة، مش مقسّمة
 * لكل فرع (بعكس ويدجت "صافي الربح بالفرع" في جزء 2).
 */

export const paymentMethodBalanceSchema = z.object({
  method: z.string(),
  balance: z.number(),
});

/** ديون العملاء — الحالة الحالية (مش مرتبطة بالفترة المختارة، الدين موجود لحد ما يتسدد). */
export const customerDebtRowSchema = z.object({
  partnerId: z.string().uuid(),
  nameAr: z.string(),
  outstanding: z.number(),
});

export const salesInvoiceRowSchema = z.object({
  orderId: z.string().uuid(),
  invoiceNumber: z.string(),
  date: z.string(),
  partnerName: z.string().nullable(),
  finalTotal: z.number(),
  remainingBalance: z.number(),
});

export const treasuryRowSchema = z.object({
  id: z.string().uuid(),
  date: z.string(),
  amount: z.number(),
  method: z.string().nullable(),
  category: z.string().nullable(),
  note: z.string().nullable(),
  partnerName: z.string().nullable(),
});

export const supplierPurchaseRowSchema = z.object({
  id: z.string().uuid(),
  date: z.string(),
  supplierName: z.string(),
  amount: z.number(),
  description: z.string().nullable(),
});

export const inventoryMovementRowSchema = z.object({
  id: z.string().uuid(),
  date: z.string(),
  itemName: z.string(),
  type: z.enum(['IN', 'OUT', 'ADJUSTMENT']),
  quantity: z.number(),
  reference: z.string().nullable(),
});

export const employeePaymentRowSchema = z.object({
  id: z.string().uuid(),
  date: z.string(),
  staffName: z.string(),
  amount: z.number(),
  kind: z.enum(['SALARY_PAYMENT', 'EMPLOYEE_ADVANCE', 'EMPLOYEE_ADVANCE_REPAYMENT']),
  note: z.string().nullable(),
});

export const reportsOverviewSchema = z.object({
  from: z.string().nullable(),
  to: z.string().nullable(),
  byPaymentMethod: z.array(paymentMethodBalanceSchema),
  totalIncome: z.number(),
  totalExpense: z.number(),
  totalTransfer: z.number(),
  customerDebts: z.array(customerDebtRowSchema),
  totalCustomerDebt: z.number(),
  salesInvoices: z.array(salesInvoiceRowSchema),
  expenses: z.array(treasuryRowSchema),
  transfers: z.array(treasuryRowSchema),
  purchases: z.array(supplierPurchaseRowSchema),
  inventoryMovements: z.array(inventoryMovementRowSchema),
  employeePayments: z.array(employeePaymentRowSchema),
});

export type PaymentMethodBalance = z.infer<typeof paymentMethodBalanceSchema>;
export type CustomerDebtRow = z.infer<typeof customerDebtRowSchema>;
export type SalesInvoiceRow = z.infer<typeof salesInvoiceRowSchema>;
export type TreasuryRow = z.infer<typeof treasuryRowSchema>;
export type SupplierPurchaseRow = z.infer<typeof supplierPurchaseRowSchema>;
export type InventoryMovementRow = z.infer<typeof inventoryMovementRowSchema>;
export type EmployeePaymentRow = z.infer<typeof employeePaymentRowSchema>;
export type ReportsOverview = z.infer<typeof reportsOverviewSchema>;
