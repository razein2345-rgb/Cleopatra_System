import { z } from 'zod';

/**
 * Owner (2026-08-26, "افصل تماماً بين أمين خزينة كليوباترا و أمين خزينة
 * برينتنج هاوس... عايز انا يظهرلي إجمالي كليوباترا، إجمالي برينتنج،
 * صافي الربح من كل مكان لوحده... وإجمالي الربح العام والإجمالي العام") —
 * جزء 2 من مبادرة "فصل الخزينة/الربح بالفرع" (docs/AI/PROJECT_STATUS.md
 * § 6). One row per branch, plus a company-wide total row computed the
 * same way (never a separate calculation, so the numbers always add up).
 */
export const branchFinancialSummarySchema = z.object({
  branchId: z.string().uuid(),
  branchName: z.string(),
  treasuryIncome: z.number(),
  treasuryExpense: z.number(),
  /** income - expense (never touched by transfers, same convention as the existing company-wide TreasuryBalance). */
  treasuryBalance: z.number(),
  salesTotal: z.number(),
  salesCount: z.number().int(),
  /**
   * "لازم علشان يكون واضح صافي الربح بالظبط يحسب فلوس نسبة الربح فقط" —
   * sum of each order item's own margin (frozen `breakdown.subtotal` vs
   * its charged total for print-priced kinds; charged price minus
   * `InventoryItem.costPrice`/`ReadyProduct.costPrice` for
   * retail/ready-product kinds), net of item- and order-level discounts.
   * Items with no cost basis recorded yet (BOARDS, SERVICE, MANUAL, or a
   * retail/ready-product item with no costPrice set) contribute nothing
   * here rather than a wrong guess — see `hasUnknownProfitItems`.
   */
  /**
   * Accounting audit fix (2026-09-17, Phase B) — scoped to TODAY (Cairo
   * business day) only, matching `dailyFixedCost`'s own period — this
   * used to sum ALL-TIME items, mixed against a one-day fixed cost below
   * (the exact time-basis bug the accounting audit found). `salesTotal`
   * above is unaffected — still all-time.
   */
  netProfit: z.number(),
  /** Accounting audit fix (2026-09-17, Decision 5) — the portion of `netProfit` backed by a REAL (owner-confirmed actual supplier/material) cost — never blended with `estimatedProfit` into one undisclosed figure. */
  realProfit: z.number(),
  /** The portion of `netProfit` backed by an ESTIMATED cost (the pricing engine's padded margin fallback, or a not-yet-RECEIVED supplier task cost) — disclosed separately, never presented with the same certainty as `realProfit`. */
  estimatedProfit: z.number(),
  /** Sum of the REAL cost basis behind `realProfit` (i.e. `realProfit`'s items' revenue minus this = realProfit). */
  realCost: z.number(),
  /** Sum of the ESTIMATED cost basis behind `estimatedProfit`. */
  estimatedCost: z.number(),
  /** Revenue from items with NO resolvable cost basis at all (UNKNOWN) — contributes to `salesTotal` but to none of `netProfit`/`realProfit`/`estimatedProfit`. */
  unknownCostRevenue: z.number(),
  /** true when at least one TODAY item had no computable cost basis (UNKNOWN) — `netProfit` is a partial/lower-bound figure, not the full picture, whenever this is true. */
  hasUnknownProfitItems: z.boolean(),
  /**
   * Owner (2026-09-08, "محتاج قسم خاص بالخزينة يكون فيه المصروفات الشهرية
   * الدائمة علشان يخصمها من الربح يومياً... علشان أعرف انا معايا صافي
   * كام أقدر اتصرف فيه") — this branch's own recurring monthly overhead
   * (`FixedMonthlyExpense` rows scoped to it, plus every company-wide one)
   * divided by 30, PLUS this branch's own staff's real payroll cost
   * (`StaffProfile.baseSalary`, prorated to each employee's own pay-cycle
   * day count — WEEKLY ÷ 7, MONTHLY ÷ 30 — not a blanket ÷30 for everyone).
   * See `getDailyFixedCostByBranch`'s own doc comment for the exact split.
   */
  dailyFixedCost: z.number(),
  /** `netProfit - dailyFixedCost` — what's actually left to spend today. */
  netAfterDailyFixedCost: z.number(),
});

export const companyFinancialSummarySchema = z.object({
  branches: z.array(branchFinancialSummarySchema),
  totalTreasuryBalance: z.number(),
  totalSales: z.number(),
  totalNetProfit: z.number(),
  totalRealProfit: z.number(),
  totalEstimatedProfit: z.number(),
  totalUnknownCostRevenue: z.number(),
  hasUnknownProfitItems: z.boolean(),
  totalDailyFixedCost: z.number(),
  totalNetAfterDailyFixedCost: z.number(),
});

export type BranchFinancialSummary = z.infer<typeof branchFinancialSummarySchema>;
export type CompanyFinancialSummary = z.infer<typeof companyFinancialSummarySchema>;

/**
 * Accounting audit fix (2026-09-17, Phase 3 C/D) — a proper, explicit-date-
 * range Gross → Operating Profit report, plus the Revenue / Cash Received /
 * Accounts Receivable breakdown the previous phase found missing. Every
 * number here shares the SAME period (`from`→`to`) — never mixing an
 * all-time figure with a period-scoped one (the exact bug Phase B fixed
 * elsewhere). Definitions, verified against the existing Order/Payment/
 * Return/Treasury model (not invented):
 *
 * - `revenue` — sum of `Order.finalTotal` for orders dated in the period,
 *   minus `OrderItemReturn.refundAmount` for returns recorded in the same
 *   period (a return reduces the period it happens in, standard
 *   contra-revenue treatment) — NEVER derived from Treasury.
 * - `cashReceived` — sum of `Payment.amount` for payments recorded in the
 *   period — NEVER derived from Order totals (a customer may owe the rest).
 * - `accountsReceivable` — the CURRENT outstanding balance across all
 *   non-cancelled orders (point-in-time by nature, like any AR figure —
 *   not itself bound to `from`/`to`), scoped to the requested branch(es).
 * - `realCost`/`estimatedCost`/`unknownCostRevenue` — same REAL/ESTIMATED/
 *   UNKNOWN classification as `resolveItemProfit`, summed over the
 *   period's orders only.
 * - `grossProfit` = `realProfit + estimatedProfit` (excludes
 *   `unknownCostRevenue`, matching the existing `netProfit` convention —
 *   an unknown cost basis is never guessed at).
 * - `fixedExpenseCost` — `FixedMonthlyExpense`-derived daily rate ×
 *   the number of days in `[from, to]` (Phase B's own fix — never a
 *   mismatched one-day figure against a longer period).
 * - `manualTreasuryExpenses` — ad-hoc `TreasuryEntry{type:EXPENSE,
 *   sourceType:'MANUAL'}` rows in the period ONLY. Deliberately excludes
 *   SUPPLIER_PAYMENT (already inside each item's own REAL cost basis via
 *   SupplierPurchase/ItemSupplierTask — counting it again here would be
 *   the exact double-count the audit warned against), SALARY_PAYMENT
 *   (already inside `fixedExpenseCost` via the payroll-rate estimate),
 *   EMPLOYEE_ADVANCE (a receivable from staff, not an expense), and RETURN
 *   (already netted out of `revenue` above).
 * - `operatingExpenses` = `fixedExpenseCost + manualTreasuryExpenses`.
 * - `operatingProfit` = `grossProfit - operatingExpenses`.
 */
export const profitabilityReportSchema = z.object({
  from: z.string(),
  to: z.string(),
  revenue: z.number(),
  cashReceived: z.number(),
  accountsReceivable: z.number(),
  realCost: z.number(),
  estimatedCost: z.number(),
  unknownCostRevenue: z.number(),
  realProfit: z.number(),
  estimatedProfit: z.number(),
  grossProfit: z.number(),
  fixedExpenseCost: z.number(),
  manualTreasuryExpenses: z.number(),
  operatingExpenses: z.number(),
  operatingProfit: z.number(),
  hasUnknownProfitItems: z.boolean(),
});
export type ProfitabilityReport = z.infer<typeof profitabilityReportSchema>;
