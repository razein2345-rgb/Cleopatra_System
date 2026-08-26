import type { BranchFinancialSummary, CompanyFinancialSummary } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';

/**
 * Owner (2026-08-26, "افصل تماماً بين أمين خزينة كليوباترا و أمين خزينة
 * برينتنج هاوس... صافي الربح من كل مكان لوحده... ولازم علشان يكون واضح
 * صافي الربح بالظبط يحسب فلوس نسبة الربح فقط") — جزء 2 من مبادرة "فصل
 * الخزينة/الربح بالفرع" (docs/AI/PROJECT_STATUS.md § 6، تكملة 33).
 *
 * Per-item profit resolution, in priority order:
 * 1. Margin-priced kinds (LOOSE_PAPER/NOTEBOOK/FOLDER/ENVELOPE/DIGITAL) —
 *    every one of them freezes `breakdown.subtotal` (the pre-margin cost)
 *    alongside `itemTotal` (subtotal × (1 + profitPercent/100)), so profit
 *    is `itemTotal - subtotal` — no lookup needed, always computable.
 * 2. INVENTORY_RETAIL — `inventoryItemId` is a real, always-populated FK;
 *    profit is `(chargedUnitPrice - InventoryItem.costPrice) × quantity`
 *    when a cost price has been recorded.
 * 3. PRODUCT — `readyProductId` is a real FK for any order created after
 *    2026-08-26 (see OrderItem.readyProductId's schema doc comment);
 *    older orders fall back to a best-effort `modelName` match against the
 *    current ReadyProduct catalog, same fragile-but-useful discipline
 *    `ReorderPredictionTab.tsx` already established for this exact gap.
 * 4. BOARDS/SERVICE/MANUAL, or a retail/ready-product item with no cost
 *    price recorded — no cost basis exists yet. Contributes to `salesTotal`
 *    but *not* to `netProfit`, and flips `hasUnknownProfitItems` — a wrong
 *    guess would be worse than an honest gap here.
 *
 * Discounts (both this item's own `discountAmount` and the whole order's
 * `discountPercent`) reduce realized revenue the same way they reduce
 * `Order.finalTotal` itself (see orderService.ts's `afterDiscount`
 * formula) — the cost basis is never discount-adjusted (materials cost is
 * what it is regardless of what the customer was charged), so a heavy
 * discount correctly shrinks (or even zeroes out) the realized profit.
 */

interface ItemBreakdownShape {
  kind?: string;
  subtotal?: number;
  quantity?: number;
  unitPrice?: number;
  /** BOARDS only — see boardsCostCalculation.ts's `BoardsCostResult.supplierCost` doc comment (part 4 of this same initiative). */
  supplierCost?: number;
}

export function resolveItemProfit(
  item: {
    itemTotal: number | null;
    discountAmount: number;
    breakdown: unknown;
    inventoryItemId: string | null;
    readyProductId: string | null;
    modelName: string | null;
  },
  orderDiscountFactor: number,
  costPriceByInventoryItemId: Map<string, number | null>,
  costPriceByReadyProductId: Map<string, number | null>,
  costPriceByReadyProductName: Map<string, number | null>,
): { revenue: number; profit: number | null } {
  const itemTotal = item.itemTotal ?? 0;
  const revenue = (itemTotal - item.discountAmount) * orderDiscountFactor;
  const breakdown = (item.breakdown ?? {}) as ItemBreakdownShape;

  // 1. Margin-priced kinds — subtotal is the pre-margin cost, always present.
  if (typeof breakdown.subtotal === 'number') {
    const marginRatio = itemTotal > 0 ? (itemTotal - breakdown.subtotal) / itemTotal : 0;
    return { revenue, profit: revenue * marginRatio };
  }

  const quantity = typeof breakdown.quantity === 'number' ? breakdown.quantity : 1;
  const unitPrice = typeof breakdown.unitPrice === 'number' ? breakdown.unitPrice : null;

  // 2. INVENTORY_RETAIL — real FK, direct lookup.
  if (item.inventoryItemId) {
    const costPrice = costPriceByInventoryItemId.get(item.inventoryItemId);
    if (costPrice != null && unitPrice != null) {
      const costBasis = costPrice * quantity * orderDiscountFactor;
      return { revenue, profit: revenue - costBasis };
    }
    return { revenue, profit: null };
  }

  // 3. PRODUCT — real FK when present, best-effort name match otherwise.
  if (breakdown.kind === 'PRODUCT') {
    const costPrice = item.readyProductId
      ? costPriceByReadyProductId.get(item.readyProductId)
      : (item.modelName ? costPriceByReadyProductName.get(item.modelName.trim().toLowerCase()) : undefined);
    if (costPrice != null && unitPrice != null) {
      const costBasis = costPrice * quantity * orderDiscountFactor;
      return { revenue, profit: revenue - costBasis };
    }
    return { revenue, profit: null };
  }

  // 4. BOARDS — real supplier cost, computed at pricing time from the
  // area/piece geometry × the settings-configured supplier rate (part 4 of
  // this initiative). `undefined` means the item predates this feature or
  // its material's supplier rate was never configured (still 0/default) —
  // an honest "unknown" rather than a fabricated number.
  if (typeof breakdown.supplierCost === 'number') {
    const costBasis = breakdown.supplierCost * orderDiscountFactor;
    return { revenue, profit: revenue - costBasis };
  }

  // 5. SERVICE/MANUAL, or a BOARDS item with no supplier cost recorded — no cost basis concept yet.
  return { revenue, profit: null };
}

export async function getCompanyFinancialSummary(): Promise<CompanyFinancialSummary> {
  const [branches, treasuryGrouped, orders, inventoryItems, readyProducts] = await Promise.all([
    prisma.branch.findMany({ where: { isDeleted: false }, select: { id: true, name: true } }),
    prisma.treasuryEntry.groupBy({
      by: ['branchId', 'type'],
      where: { isDeleted: false },
      _sum: { amount: true },
    }),
    prisma.order.findMany({
      where: { isDeleted: false, status: { not: 'CANCELLED' } },
      select: {
        branchId: true,
        finalTotal: true,
        discountPercent: true,
        items: {
          select: {
            itemTotal: true,
            discountAmount: true,
            breakdown: true,
            inventoryItemId: true,
            readyProductId: true,
            modelName: true,
          },
        },
      },
    }),
    prisma.inventoryItem.findMany({ select: { id: true, costPrice: true } }),
    prisma.readyProduct.findMany({ where: { isDeleted: false }, select: { id: true, name: true, costPrice: true } }),
  ]);

  const costPriceByInventoryItemId = new Map(inventoryItems.map((i) => [i.id, i.costPrice?.toNumber() ?? null]));
  const costPriceByReadyProductId = new Map(readyProducts.map((p) => [p.id, p.costPrice?.toNumber() ?? null]));
  const costPriceByReadyProductName = new Map(
    readyProducts.map((p) => [p.name.trim().toLowerCase(), p.costPrice?.toNumber() ?? null]),
  );

  const byBranch = new Map<
    string,
    { income: number; expense: number; salesTotal: number; salesCount: number; netProfit: number; hasUnknown: boolean }
  >();
  const ensure = (branchId: string) => {
    const existing = byBranch.get(branchId);
    if (existing) return existing;
    const fresh = { income: 0, expense: 0, salesTotal: 0, salesCount: 0, netProfit: 0, hasUnknown: false };
    byBranch.set(branchId, fresh);
    return fresh;
  };

  for (const g of treasuryGrouped) {
    const entry = ensure(g.branchId);
    const amount = g._sum.amount?.toNumber() ?? 0;
    if (g.type === 'INCOME') entry.income += amount;
    else if (g.type === 'EXPENSE') entry.expense += amount;
  }

  for (const order of orders) {
    const entry = ensure(order.branchId);
    entry.salesTotal += order.finalTotal.toNumber();
    entry.salesCount += 1;
    const orderDiscountFactor = 1 - order.discountPercent.toNumber() / 100;
    for (const item of order.items) {
      const { profit } = resolveItemProfit(
        {
          itemTotal: item.itemTotal?.toNumber() ?? null,
          discountAmount: item.discountAmount.toNumber(),
          breakdown: item.breakdown,
          inventoryItemId: item.inventoryItemId,
          readyProductId: item.readyProductId,
          modelName: item.modelName,
        },
        orderDiscountFactor,
        costPriceByInventoryItemId,
        costPriceByReadyProductId,
        costPriceByReadyProductName,
      );
      if (profit === null) {
        entry.hasUnknown = true;
      } else {
        entry.netProfit += profit;
      }
    }
  }

  const branchSummaries: BranchFinancialSummary[] = branches.map((branch) => {
    const entry = ensure(branch.id);
    return {
      branchId: branch.id,
      branchName: branch.name,
      treasuryIncome: entry.income,
      treasuryExpense: entry.expense,
      treasuryBalance: entry.income - entry.expense,
      salesTotal: entry.salesTotal,
      salesCount: entry.salesCount,
      netProfit: entry.netProfit,
      hasUnknownProfitItems: entry.hasUnknown,
    };
  });

  return {
    branches: branchSummaries,
    totalTreasuryBalance: branchSummaries.reduce((sum, b) => sum + b.treasuryBalance, 0),
    totalSales: branchSummaries.reduce((sum, b) => sum + b.salesTotal, 0),
    totalNetProfit: branchSummaries.reduce((sum, b) => sum + b.netProfit, 0),
    hasUnknownProfitItems: branchSummaries.some((b) => b.hasUnknownProfitItems),
  };
}
