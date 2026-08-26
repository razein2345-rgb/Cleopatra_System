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
  netProfit: z.number(),
  /** true when at least one item counted toward `salesTotal` had no computable cost basis — `netProfit` is a partial/lower-bound figure, not the full picture, whenever this is true. */
  hasUnknownProfitItems: z.boolean(),
});

export const companyFinancialSummarySchema = z.object({
  branches: z.array(branchFinancialSummarySchema),
  totalTreasuryBalance: z.number(),
  totalSales: z.number(),
  totalNetProfit: z.number(),
  hasUnknownProfitItems: z.boolean(),
});

export type BranchFinancialSummary = z.infer<typeof branchFinancialSummarySchema>;
export type CompanyFinancialSummary = z.infer<typeof companyFinancialSummarySchema>;
